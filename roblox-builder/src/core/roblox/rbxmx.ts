// Roblox XML model (.rbxmx) and place (.rbxlx) serialization.
//
// This is the format Studio itself writes when you save as XML, and that it
// opens directly with File > Open (places) or Insert from File (models). It is
// also what Open Cloud's place publishing endpoint accepts as
// application/xml, which is why the builder can publish without Rojo.

import { allProps, getClass, isA, propType, xmlPropertyName } from "./classes";
import { ENUMS, FONT_WEIGHTS } from "./enums";
import type { RNode } from "./instance";
import { IDENTITY_ROT, rotationFromOrientation, type RValue } from "./values";

const HEADER =
  '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cdata(s: string): string {
  // "]]>" cannot appear inside a CDATA section; split it across two.
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function num(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1e6) / 1e6);
}

export interface XmlWriteOptions {
  /** Emit a place file: the root is a DataModel and its children are services. */
  place?: boolean;
}

export interface XmlWriteResult {
  xml: string;
  warnings: string[];
  instanceCount: number;
}

export function writeRobloxXml(root: RNode, options: XmlWriteOptions = {}): XmlWriteResult {
  const warnings: string[] = [];
  const referents = new Map<RNode, string>();
  const byRefId = new Map<string, RNode>();
  let counter = 0;
  const assign = (n: RNode) => {
    referents.set(n, `RBX${(counter++).toString(16).toUpperCase().padStart(8, "0")}`);
    if (n.refId) byRefId.set(n.refId, n);
    n.children.forEach(assign);
  };
  const tops = options.place ? root.children : [root];
  tops.forEach(assign);

  const lines: string[] = [HEADER, "\t<External>null</External>", "\t<External>nil</External>"];
  const writeItem = (n: RNode, depth: number) => {
    const ind = "\t".repeat(depth);
    if (n.opaque) {
      warnings.push(`${n.id} comes from a binary .rbxm file and was exported as an empty ${n.className}; insert that file in Studio separately`);
    }
    lines.push(`${ind}<Item class="${esc(n.className)}" referent="${referents.get(n)}">`);
    lines.push(`${ind}\t<Properties>`);
    for (const p of propertyElements(n, referents, byRefId, warnings)) lines.push(`${ind}\t\t${p}`);
    lines.push(`${ind}\t</Properties>`);
    for (const c of n.children) writeItem(c, depth + 1);
    lines.push(`${ind}</Item>`);
  };
  tops.forEach((n) => writeItem(n, 1));
  lines.push("</roblox>");
  return { xml: lines.join("\n") + "\n", warnings, instanceCount: counter };
}

function propertyElements(n: RNode, referents: Map<RNode, string>, byRefId: Map<string, RNode>, warnings: string[]): string[] {
  const out: string[] = [`<string name="Name">${esc(n.name)}</string>`];
  const props = { ...n.properties };

  // Position/Orientation are views of CFrame and are not serialized.
  if (isA(n.className, "BasePart") && (props.Position || props.Orientation)) {
    const cf = props.CFrame?.t === "CFrame" ? props.CFrame : { t: "CFrame" as const, pos: [0, 0, 0] as [number, number, number], rot: [...IDENTITY_ROT] };
    const pos = props.Position?.t === "Vector3" ? props.Position.v : cf.pos;
    const rot = props.Orientation?.t === "Vector3" ? rotationFromOrientation(props.Orientation.v) : cf.rot;
    props.CFrame = { t: "CFrame", pos, rot };
    delete props.Position;
    delete props.Orientation;
  }

  if (n.className === "Script" || n.className === "LocalScript" || n.className === "ModuleScript") {
    out.push(`<ProtectedString name="Source">${cdata(n.source ?? "")}</ProtectedString>`);
  }

  for (const [prop, value] of Object.entries(props)) {
    if (prop === "WorldPivot") continue;
    const el = valueElement(n.className, prop, value, referents, byRefId, warnings, n.id);
    if (el) out.push(el);
  }
  for (const [prop, target] of Object.entries(n.refTargets ?? {})) {
    const t = byRefId.get(target);
    if (!t) {
      warnings.push(`${n.id}.${prop} points at Rojo_Id "${target}", which is not in the exported tree`);
      continue;
    }
    out.push(`<Ref name="${esc(xmlPropertyName(n.className, prop))}">${referents.get(t)}</Ref>`);
  }
  if (Object.keys(n.attributes).length > 0) {
    out.push(`<BinaryString name="AttributesSerialize">${base64(serializeAttributes(n.attributes, warnings, n.id))}</BinaryString>`);
  }
  if (n.tags.length > 0) {
    out.push(`<BinaryString name="Tags">${base64(new TextEncoder().encode(n.tags.join("\0")))}</BinaryString>`);
  }
  return out;
}

function valueElement(
  className: string,
  prop: string,
  v: RValue,
  referents: Map<RNode, string>,
  byRefId: Map<string, RNode>,
  warnings: string[],
  id: string,
): string | undefined {
  const name = esc(xmlPropertyName(className, prop));
  switch (v.t) {
    case "bool":
      return `<bool name="${name}">${v.v}</bool>`;
    case "string":
      return `<string name="${name}">${esc(v.v)}</string>`;
    case "int":
      return `<int name="${name}">${Math.round(v.v)}</int>`;
    case "float":
      return `<float name="${name}">${num(v.v)}</float>`;
    case "BrickColor":
      return `<BrickColor name="${name}">${Math.round(v.v)}</BrickColor>`;
    case "Vector3":
      return `<Vector3 name="${name}"><X>${num(v.v[0])}</X><Y>${num(v.v[1])}</Y><Z>${num(v.v[2])}</Z></Vector3>`;
    case "Vector2":
      return `<Vector2 name="${name}"><X>${num(v.v[0])}</X><Y>${num(v.v[1])}</Y></Vector2>`;
    case "Color3": {
      if (name === "Color3uint8") {
        const [r, g, b] = v.v.map((c) => Math.max(0, Math.min(255, Math.round(c * 255))));
        const packed = (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
        return `<Color3uint8 name="Color3uint8">${packed}</Color3uint8>`;
      }
      return `<Color3 name="${name}"><R>${num(v.v[0])}</R><G>${num(v.v[1])}</G><B>${num(v.v[2])}</B></Color3>`;
    }
    case "UDim":
      return `<UDim name="${name}"><S>${num(v.v[0])}</S><O>${Math.round(v.v[1])}</O></UDim>`;
    case "UDim2":
      return `<UDim2 name="${name}"><XS>${num(v.v[0])}</XS><XO>${Math.round(v.v[1])}</XO><YS>${num(v.v[2])}</YS><YO>${Math.round(v.v[3])}</YO></UDim2>`;
    case "Rect":
      return `<Rect2D name="${name}"><min><X>${num(v.v[0])}</X><Y>${num(v.v[1])}</Y></min><max><X>${num(v.v[2])}</X><Y>${num(v.v[3])}</Y></max></Rect2D>`;
    case "CFrame": {
      const r = v.rot.length === 9 ? v.rot : IDENTITY_ROT;
      const rs = r.map((x, i) => `<R${Math.floor(i / 3)}${i % 3}>${num(x)}</R${Math.floor(i / 3)}${i % 3}>`).join("");
      return `<CoordinateFrame name="${name}"><X>${num(v.pos[0])}</X><Y>${num(v.pos[1])}</Y><Z>${num(v.pos[2])}</Z>${rs}</CoordinateFrame>`;
    }
    case "Enum": {
      const value = ENUMS[v.enum]?.[v.v];
      if (value === undefined) {
        warnings.push(`${id}.${prop}: Enum.${v.enum}.${v.v} has no known serialized value and was skipped`);
        return undefined;
      }
      return `<token name="${name}">${value}</token>`;
    }
    case "Content":
      return v.v ? `<Content name="${name}"><url>${esc(v.v)}</url></Content>` : `<Content name="${name}"><null></null></Content>`;
    case "NumberRange":
      return `<NumberRange name="${name}">${num(v.v[0])} ${num(v.v[1])} </NumberRange>`;
    case "NumberSequence":
      return `<NumberSequence name="${name}">${v.v.map(([t, x, e]) => `${num(t)} ${num(x)} ${num(e)} `).join("")}</NumberSequence>`;
    case "ColorSequence":
      return `<ColorSequence name="${name}">${v.v.map(([t, r, g, b]) => `${num(t)} ${num(r)} ${num(g)} ${num(b)} 0 `).join("")}</ColorSequence>`;
    case "Font": {
      const weight = FONT_WEIGHTS[v.weight] ?? 400;
      return `<Font name="${name}"><Family><url>${esc(v.family)}</url></Family><Weight>${weight}</Weight><Style>${v.style}</Style></Font>`;
    }
    case "Ref": {
      if (v.v === null) return `<Ref name="${name}">null</Ref>`;
      const t = byRefId.get(v.v);
      if (!t) {
        warnings.push(`${id}.${prop} points at "${v.v}", which is not in the exported tree`);
        return `<Ref name="${name}">null</Ref>`;
      }
      return `<Ref name="${name}">${referents.get(t)}</Ref>`;
    }
  }
}

// ------------------------------------------------------------------ attributes

const ATTR = { String: 0x02, Bool: 0x03, Double: 0x06, UDim: 0x09, UDim2: 0x0a, Color3: 0x0f, Vector2: 0x10, Vector3: 0x11 } as const;

/** The binary attribute blob Studio stores in AttributesSerialize. */
export function serializeAttributes(attrs: Record<string, RValue>, warnings: string[] = [], id = ""): Uint8Array {
  const bytes: number[] = [];
  const u32 = (n: number) => bytes.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
  const str = (s: string) => {
    const b = new TextEncoder().encode(s);
    u32(b.length);
    bytes.push(...b);
  };
  const f32 = (x: number) => {
    const buf = new DataView(new ArrayBuffer(4));
    buf.setFloat32(0, x, true);
    for (let i = 0; i < 4; i++) bytes.push(buf.getUint8(i));
  };
  const f64 = (x: number) => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, x, true);
    for (let i = 0; i < 8; i++) bytes.push(buf.getUint8(i));
  };
  const i32 = (x: number) => u32(x | 0);

  const entries = Object.entries(attrs).filter(([key, v]) => {
    const ok = ["string", "bool", "int", "float", "Color3", "Vector3", "Vector2", "UDim", "UDim2"].includes(v.t);
    if (!ok) warnings.push(`${id}: attribute "${key}" of type ${v.t} is not exported`);
    return ok;
  });
  u32(entries.length);
  for (const [key, v] of entries) {
    str(key);
    switch (v.t) {
      case "string":
        bytes.push(ATTR.String);
        str(v.v);
        break;
      case "bool":
        bytes.push(ATTR.Bool, v.v ? 1 : 0);
        break;
      case "int":
      case "float":
        bytes.push(ATTR.Double);
        f64(v.v);
        break;
      case "Color3":
        bytes.push(ATTR.Color3);
        v.v.forEach(f32);
        break;
      case "Vector3":
        bytes.push(ATTR.Vector3);
        v.v.forEach(f32);
        break;
      case "Vector2":
        bytes.push(ATTR.Vector2);
        v.v.forEach(f32);
        break;
      case "UDim":
        bytes.push(ATTR.UDim);
        f32(v.v[0]);
        i32(v.v[1]);
        break;
      case "UDim2":
        bytes.push(ATTR.UDim2);
        f32(v.v[0]);
        i32(v.v[1]);
        f32(v.v[2]);
        i32(v.v[3]);
        break;
    }
  }
  return new Uint8Array(bytes);
}

export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// ------------------------------------------------------------------ parsing

interface XmlEl {
  tag: string;
  attrs: Record<string, string>;
  children: XmlEl[];
  text: string;
}

/** A small, strict-enough XML reader for Roblox model files. */
export function parseXml(src: string): XmlEl {
  let i = 0;
  const root: XmlEl = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlEl[] = [root];
  const decode = (s: string) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
  while (i < src.length) {
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i);
      if (end < 0) throw new Error("Unterminated CDATA section");
      stack[stack.length - 1].text += src.slice(i + 9, end);
      i = end + 3;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src[i] === "<") {
      const end = src.indexOf(">", i);
      if (end < 0) throw new Error("Unterminated tag");
      const body = src.slice(i + 1, end);
      i = end + 1;
      if (body.startsWith("/")) {
        const tag = body.slice(1).trim();
        const top = stack.pop();
        if (!top || top.tag !== tag) throw new Error(`Mismatched closing tag </${tag}>`);
        continue;
      }
      const selfClosing = body.endsWith("/");
      const inner = selfClosing ? body.slice(0, -1) : body;
      const m = /^([\w:.-]+)/.exec(inner.trim());
      if (!m) throw new Error("Malformed tag");
      const el: XmlEl = { tag: m[1], attrs: {}, children: [], text: "" };
      for (const a of inner.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) el.attrs[a[1]] = decode(a[2]);
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      continue;
    }
    const next = src.indexOf("<", i);
    const chunk = src.slice(i, next < 0 ? src.length : next);
    stack[stack.length - 1].text += decode(chunk);
    i = next < 0 ? src.length : next;
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].tag}>`);
  return root;
}

export function parseRbxmx(text: string): { roots: RNode[]; error?: string } {
  let doc: XmlEl;
  try {
    doc = parseXml(text);
  } catch (err) {
    return { roots: [], error: `Malformed XML: ${err instanceof Error ? err.message : String(err)}` };
  }
  const robloxEl = doc.children.find((c) => c.tag === "roblox");
  if (!robloxEl) return { roots: [], error: "Not a Roblox XML file (no <roblox> root)" };
  const toNode = (el: XmlEl, parentId: string): RNode => {
    const className = el.attrs.class ?? "Folder";
    const propsEl = el.children.find((c) => c.tag === "Properties");
    const node: RNode = { id: "", name: className, className, properties: {}, attributes: {}, tags: [], children: [] };
    const known = allProps(className);
    for (const p of propsEl?.children ?? []) {
      const name = p.attrs.name;
      if (!name) continue;
      if (name === "Name") {
        node.name = p.text;
        continue;
      }
      if (name === "Source") {
        node.source = p.text;
        continue;
      }
      const lua = name === "size" ? "Size" : name === "Color3uint8" ? "Color" : name === "shape" ? "Shape" : name;
      const t = known[lua] ?? propType(className, lua);
      const v = readXmlValue(p, t);
      if (v) node.properties[lua] = v;
    }
    node.id = `${parentId}/${node.name}`;
    node.children = el.children.filter((c) => c.tag === "Item").map((c) => toNode(c, node.id));
    return node;
  };
  const roots = robloxEl.children.filter((c) => c.tag === "Item").map((c) => toNode(c, "model"));
  return { roots };
}

function readXmlValue(el: XmlEl, type: string | undefined): RValue | undefined {
  const child = (tag: string) => Number(el.children.find((c) => c.tag === tag)?.text ?? 0);
  switch (el.tag) {
    case "bool":
      return { t: "bool", v: el.text.trim() === "true" };
    case "string":
      return { t: "string", v: el.text };
    case "int":
      return { t: "int", v: Number(el.text) };
    case "float":
    case "double":
      return { t: "float", v: Number(el.text) };
    case "Vector3":
      return { t: "Vector3", v: [child("X"), child("Y"), child("Z")] };
    case "Vector2":
      return { t: "Vector2", v: [child("X"), child("Y")] };
    case "Color3":
      return { t: "Color3", v: [child("R"), child("G"), child("B")] };
    case "Color3uint8": {
      const n = Number(el.text) >>> 0;
      return { t: "Color3", v: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] };
    }
    case "UDim2":
      return { t: "UDim2", v: [child("XS"), child("XO"), child("YS"), child("YO")] };
    case "UDim":
      return { t: "UDim", v: [child("S"), child("O")] };
    case "CoordinateFrame":
      return {
        t: "CFrame",
        pos: [child("X"), child("Y"), child("Z")],
        rot: ["R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"].map(child),
      };
    case "token": {
      if (!type?.startsWith("Enum:")) return undefined;
      const enumName = type.slice(5);
      const n = Number(el.text);
      const item = Object.entries(ENUMS[enumName] ?? {}).find(([, v]) => v === n)?.[0];
      return item ? { t: "Enum", enum: enumName, v: item } : undefined;
    }
    case "Content": {
      const url = el.children.find((c) => c.tag === "url")?.text;
      return { t: "Content", v: url ?? "" };
    }
    default:
      return undefined;
  }
}

/** Whether a class can be placed at the top of a place file. */
export function isPlaceRootClass(className: string): boolean {
  return getClass(className)?.service === true;
}
