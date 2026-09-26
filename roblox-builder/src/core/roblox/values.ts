// Typed Roblox property values, and conversion to and from Rojo's JSON
// property format (both the implicit form — `"Size": [4, 1, 2]` — and the
// explicit form — `"Size": { "Vector3": [4, 1, 2] }`).

import type { PropType } from "./classes";
import { ENUMS, FONT_FAMILIES } from "./enums";

export type RValue =
  | { t: "bool"; v: boolean }
  | { t: "string"; v: string }
  | { t: "int"; v: number }
  | { t: "float"; v: number }
  | { t: "Vector3"; v: [number, number, number] }
  | { t: "Vector2"; v: [number, number] }
  | { t: "Color3"; v: [number, number, number] }
  | { t: "BrickColor"; v: number }
  | { t: "UDim"; v: [number, number] }
  | { t: "UDim2"; v: [number, number, number, number] }
  | { t: "CFrame"; pos: [number, number, number]; rot: number[] }
  | { t: "Enum"; enum: string; v: string }
  | { t: "Content"; v: string }
  | { t: "NumberRange"; v: [number, number] }
  | { t: "NumberSequence"; v: [number, number, number][] }
  | { t: "ColorSequence"; v: [number, number, number, number][] }
  | { t: "Font"; family: string; weight: string; style: "Normal" | "Italic" }
  | { t: "Ref"; v: string | null }
  | { t: "Rect"; v: [number, number, number, number] };

export const IDENTITY_ROT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export class ValueError extends Error {}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isNumArr = (x: unknown, n: number): x is number[] => Array.isArray(x) && x.length === n && x.every(isNum);

/** Rotation matrix (row-major R00..R22) from XYZ Euler degrees, Roblox's `CFrame.fromOrientation` order (Y, X, Z). */
export function rotationFromOrientation(deg: [number, number, number]): number[] {
  const [rx, ry, rz] = deg.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Ry * Rx * Rz
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return round9(mul3(mul3(Ry, Rx), Rz));
}

/** Inverse of rotationFromOrientation, for showing a CFrame as Orientation degrees. */
export function orientationFromRotation(r: number[]): [number, number, number] {
  // For R = Ry Rx Rz: r12 = -sin(x)
  const sx = -r[5];
  const x = Math.asin(Math.max(-1, Math.min(1, sx)));
  let y: number, z: number;
  if (Math.abs(Math.cos(x)) > 1e-6) {
    y = Math.atan2(r[2], r[8]);
    z = Math.atan2(r[3], r[4]);
  } else {
    y = Math.atan2(-r[6], r[0]);
    z = 0;
  }
  const deg = (a: number) => Math.round(((a * 180) / Math.PI) * 1000) / 1000;
  return [deg(x), deg(y), deg(z)];
}

export function mul3(a: number[], b: number[]): number[] {
  const out = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return out;
}

function round9(m: number[]): number[] {
  return m.map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e9) / 1e9));
}

/**
 * Converts a Rojo JSON property value to a typed value.
 * `type` comes from the class database; when it is unknown, only the explicit
 * form can be interpreted.
 */
export function fromRojo(json: unknown, type: PropType | undefined): RValue {
  // Explicit form: a single-key object naming the type.
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const keys = Object.keys(json as object);
    if (keys.length === 1) {
      const [k] = keys;
      const inner = (json as Record<string, unknown>)[k];
      if (k === "Color3uint8" && isNumArr(inner, 3)) {
        return { t: "Color3", v: [inner[0] / 255, inner[1] / 255, inner[2] / 255] };
      }
      const explicit = explicitType(k);
      if (explicit) return fromRojo(inner, explicit);
    }
  }

  if (!type) throw new ValueError("unknown property; only explicit typed values can be used");

  switch (type) {
    case "bool":
      if (typeof json === "boolean") return { t: "bool", v: json };
      break;
    case "string":
      if (typeof json === "string") return { t: "string", v: json };
      break;
    case "int":
      if (isNum(json)) return { t: "int", v: Math.round(json) };
      break;
    case "float":
      if (isNum(json)) return { t: "float", v: json };
      break;
    case "BrickColor":
      if (isNum(json)) return { t: "BrickColor", v: json };
      break;
    case "Vector3":
      if (isNumArr(json, 3)) return { t: "Vector3", v: [json[0], json[1], json[2]] };
      break;
    case "Vector2":
      if (isNumArr(json, 2)) return { t: "Vector2", v: [json[0], json[1]] };
      break;
    case "Color3":
      if (isNumArr(json, 3)) {
        if (json.some((c) => c > 1)) {
          throw new ValueError("Color3 components are 0-1 floats; for 0-255 use {\"Color3uint8\": [r, g, b]}");
        }
        return { t: "Color3", v: [json[0], json[1], json[2]] };
      }
      break;
    case "UDim":
      if (isNumArr(json, 2)) return { t: "UDim", v: [json[0], json[1]] };
      break;
    case "UDim2":
      if (Array.isArray(json) && json.length === 2 && isNumArr(json[0], 2) && isNumArr(json[1], 2)) {
        return { t: "UDim2", v: [json[0][0], json[0][1], json[1][0], json[1][1]] };
      }
      break;
    case "Rect":
      if (Array.isArray(json) && json.length === 2 && isNumArr(json[0], 2) && isNumArr(json[1], 2)) {
        return { t: "Rect", v: [json[0][0], json[0][1], json[1][0], json[1][1]] };
      }
      break;
    case "CFrame": {
      if (json && typeof json === "object" && !Array.isArray(json)) {
        const o = json as { position?: unknown; orientation?: unknown };
        if (isNumArr(o.position, 3)) {
          const pos: [number, number, number] = [o.position[0], o.position[1], o.position[2]];
          const orient = o.orientation;
          if (orient === undefined) return { t: "CFrame", pos, rot: [...IDENTITY_ROT] };
          if (Array.isArray(orient) && orient.length === 3 && orient.every((r) => isNumArr(r, 3))) {
            return { t: "CFrame", pos, rot: (orient as number[][]).flat() };
          }
        }
      }
      if (isNumArr(json, 12)) return { t: "CFrame", pos: [json[0], json[1], json[2]], rot: json.slice(3) };
      if (isNumArr(json, 3)) return { t: "CFrame", pos: [json[0], json[1], json[2]], rot: [...IDENTITY_ROT] };
      break;
    }
    case "Content":
      if (typeof json === "string") return { t: "Content", v: json };
      break;
    case "NumberRange":
      if (isNumArr(json, 2)) return { t: "NumberRange", v: [json[0], json[1]] };
      if (isNum(json)) return { t: "NumberRange", v: [json, json] };
      break;
    case "NumberSequence": {
      if (isNum(json)) return { t: "NumberSequence", v: [[0, json, 0], [1, json, 0]] };
      const kps = (json as { keypoints?: unknown })?.keypoints;
      if (Array.isArray(kps)) {
        return {
          t: "NumberSequence",
          v: kps.map((k: { time?: number; value?: number; envelope?: number }) => {
            if (!isNum(k.time) || !isNum(k.value)) throw new ValueError("NumberSequence keypoints need time and value");
            return [k.time, k.value, k.envelope ?? 0] as [number, number, number];
          }),
        };
      }
      break;
    }
    case "ColorSequence": {
      if (isNumArr(json, 3)) return { t: "ColorSequence", v: [[0, json[0], json[1], json[2]], [1, json[0], json[1], json[2]]] };
      const kps = (json as { keypoints?: unknown })?.keypoints;
      if (Array.isArray(kps)) {
        return {
          t: "ColorSequence",
          v: kps.map((k: { time?: number; color?: number[] }) => {
            if (!isNum(k.time) || !isNumArr(k.color, 3)) throw new ValueError("ColorSequence keypoints need time and color");
            return [k.time, k.color[0], k.color[1], k.color[2]] as [number, number, number, number];
          }),
        };
      }
      break;
    }
    case "Font": {
      const o = json as { family?: unknown; weight?: unknown; style?: unknown };
      if (o && typeof o === "object" && typeof o.family === "string") {
        return {
          t: "Font",
          family: o.family.startsWith("rbxasset") ? o.family : (FONT_FAMILIES[o.family] ?? o.family),
          weight: typeof o.weight === "string" ? o.weight : "Regular",
          style: o.style === "Italic" ? "Italic" : "Normal",
        };
      }
      break;
    }
    case "Ref":
      if (typeof json === "string" || json === null) return { t: "Ref", v: json };
      break;
    default: {
      if (type.startsWith("Enum:")) {
        const enumName = type.slice(5);
        const items = ENUMS[enumName];
        if (typeof json === "string") {
          if (items && !(json in items)) {
            throw new ValueError(`"${json}" is not an item of Enum.${enumName} (${Object.keys(items).slice(0, 8).join(", ")}…)`);
          }
          return { t: "Enum", enum: enumName, v: json };
        }
        if (isNum(json) && items) {
          const name = Object.entries(items).find(([, n]) => n === json)?.[0];
          if (!name) throw new ValueError(`${json} is not a value of Enum.${enumName}`);
          return { t: "Enum", enum: enumName, v: name };
        }
      }
    }
  }
  throw new ValueError(`expected ${describeType(type)}, got ${preview(json)}`);
}

function explicitType(key: string): PropType | undefined {
  switch (key) {
    case "Bool":
      return "bool";
    case "String":
      return "string";
    case "Int32":
    case "Int64":
      return "int";
    case "Float32":
    case "Float64":
      return "float";
    case "Vector3":
    case "Vector2":
    case "UDim":
    case "UDim2":
    case "CFrame":
    case "Content":
    case "NumberRange":
    case "NumberSequence":
    case "ColorSequence":
    case "Font":
    case "Rect":
    case "BrickColor":
    case "Color3":
      return key;
    case "Color3uint8":
      return "Color3"; // normalised below by the caller when values are > 1
    case "Ref":
      return "Ref";
    default:
      return undefined;
  }
}

export function describeType(type: PropType): string {
  switch (type) {
    case "Vector3":
      return "Vector3 [x, y, z]";
    case "Vector2":
      return "Vector2 [x, y]";
    case "Color3":
      return "Color3 [r, g, b] with 0-1 components";
    case "UDim":
      return "UDim [scale, offset]";
    case "UDim2":
      return "UDim2 [[xScale, xOffset], [yScale, yOffset]]";
    case "CFrame":
      return 'CFrame { "position": [x, y, z], "orientation": [[...],[...],[...]] }';
    case "Rect":
      return "Rect [[minX, minY], [maxX, maxY]]";
    default:
      return type.startsWith("Enum:") ? `an Enum.${type.slice(5)} item name` : type;
  }
}

function preview(x: unknown): string {
  const s = JSON.stringify(x);
  return s === undefined ? String(x) : s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/** Writes a value in Rojo's explicit JSON form, which is unambiguous for any property. */
export function toRojo(v: RValue): unknown {
  switch (v.t) {
    case "bool":
      return v.v;
    case "string":
      return v.v;
    case "int":
      return { Int32: v.v };
    case "float":
      return v.v;
    case "BrickColor":
      return { BrickColor: v.v };
    case "Vector3":
      return v.v;
    case "Vector2":
      return v.v;
    case "Color3":
      return v.v.map((c) => Math.round(c * 1000) / 1000);
    case "UDim":
      return v.v;
    case "UDim2":
      return [
        [v.v[0], v.v[1]],
        [v.v[2], v.v[3]],
      ];
    case "Rect":
      return [
        [v.v[0], v.v[1]],
        [v.v[2], v.v[3]],
      ];
    case "CFrame":
      return {
        CFrame: {
          position: v.pos,
          orientation: [v.rot.slice(0, 3), v.rot.slice(3, 6), v.rot.slice(6, 9)],
        },
      };
    case "Enum":
      return v.v;
    case "Content":
      return v.v;
    case "NumberRange":
      return { NumberRange: v.v };
    case "NumberSequence":
      return { NumberSequence: { keypoints: v.v.map(([time, value, envelope]) => ({ time, value, envelope })) } };
    case "ColorSequence":
      return { ColorSequence: { keypoints: v.v.map(([time, r, g, b]) => ({ time, color: [r, g, b] })) } };
    case "Font":
      return { Font: { family: v.family, weight: v.weight, style: v.style } };
    case "Ref":
      return v.v;
  }
}

/** Short human-readable rendering for inspectors and diffs. */
export function formatValue(v: RValue): string {
  const n = (x: number) => String(Math.round(x * 1000) / 1000);
  switch (v.t) {
    case "bool":
    case "int":
    case "float":
    case "BrickColor":
      return String(v.v);
    case "string":
    case "Content":
      return v.v;
    case "Vector3":
    case "Vector2":
    case "UDim":
    case "NumberRange":
      return v.v.map(n).join(", ");
    case "Color3":
      return `rgb(${v.v.map((c) => Math.round(c * 255)).join(", ")})`;
    case "UDim2":
      return `{${n(v.v[0])}, ${n(v.v[1])}}, {${n(v.v[2])}, ${n(v.v[3])}}`;
    case "Rect":
      return v.v.map(n).join(", ");
    case "CFrame":
      return `${v.pos.map(n).join(", ")} ∠ ${orientationFromRotation(v.rot).map(n).join(", ")}`;
    case "Enum":
      return `Enum.${v.enum}.${v.v}`;
    case "NumberSequence":
      return v.v.map(([t, x]) => `${n(t)}:${n(x)}`).join(" ");
    case "ColorSequence":
      return v.v.map(([t, r, g, b]) => `${n(t)}:rgb(${[r, g, b].map((c) => Math.round(c * 255)).join(",")})`).join(" ");
    case "Font":
      return `${v.family.replace(/^.*families\//, "").replace(".json", "")} ${v.weight}${v.style === "Italic" ? " Italic" : ""}`;
    case "Ref":
      return v.v ?? "nil";
  }
}

export function color3FromHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new ValueError(`"${hex}" is not a #rrggbb colour`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function color3ToHex(c: [number, number, number]): string {
  return (
    "#" +
    c
      .map((x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, "0"))
      .join("")
  );
}
