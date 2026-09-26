// Builds the Roblox DataModel a Rojo project describes, from its files.
//
// Mirrors Rojo 7's rules so that what the builder shows in the hierarchy
// explorer, validates, and exports is exactly what `rojo serve` / `rojo
// build` would produce in Studio:
//
//   *.server.luau / .lua   -> Script
//   *.client.luau / .lua   -> LocalScript
//   *.luau / .lua          -> ModuleScript
//   init.* in a directory  -> the directory becomes that script
//   *.model.json           -> JSON model (ClassName/Properties/Children)
//   *.meta.json            -> class/property overrides for a sibling or init
//   *.json                 -> ModuleScript returning the data
//   *.txt                  -> StringValue
//   *.csv                  -> LocalizationTable
//   *.rbxmx                -> XML model (parsed)
//   *.rbxm                 -> binary model (opaque)
//   anything else          -> ignored by Rojo, and so ignored here

import type { Diagnostic } from "../diagnostics";
import { basename, dirname, isDir, lineOfJsonKey, listDir, parseJsonWithPosition, textOf, type FileMap } from "../project/files";
import { getClass, propType } from "./classes";
import type { RNode } from "./instance";
import { parseRbxmx } from "./rbxmx";
import { fromRojo, ValueError, type RValue } from "./values";

export const DEFAULT_PROJECT_FILE = "default.project.json";

export interface DataModelBuild {
  root: RNode;
  diagnostics: Diagnostic[];
  /** Project file that was used, or undefined when none exists. */
  projectFile?: string;
  /** Which instances each file produced (a file can produce several: model files). */
  nodesByFile: Map<string, string[]>;
  /** Files under a mapped directory that Rojo will not turn into instances. */
  unmappedFiles: string[];
}

const SCRIPT_EXT = /\.(luau|lua)$/;

interface Ctx {
  files: FileMap;
  diagnostics: Diagnostic[];
  nodesByFile: Map<string, string[]>;
  mappedDirs: Set<string>;
  mappedFiles: Set<string>;
}

export function buildDataModel(files: FileMap, projectFile = DEFAULT_PROJECT_FILE): DataModelBuild {
  const ctx: Ctx = { files, diagnostics: [], nodesByFile: new Map(), mappedDirs: new Set(), mappedFiles: new Set() };
  const text = textOf(files, projectFile);
  if (text === undefined) {
    ctx.diagnostics.push({
      rule: "rojo/no-project",
      severity: "error",
      category: "project",
      message: `No ${projectFile}; Rojo cannot sync or build this project`,
      file: projectFile,
    });
    return { root: emptyDataModel(), diagnostics: ctx.diagnostics, nodesByFile: ctx.nodesByFile, unmappedFiles: [] };
  }
  const parsed = parseJsonWithPosition(text);
  if (parsed.error) {
    ctx.diagnostics.push({
      rule: "rojo/invalid-json",
      severity: "error",
      category: "project",
      message: `Invalid JSON: ${parsed.error.message}`,
      file: projectFile,
      line: parsed.error.line,
      col: parsed.error.col,
    });
    return { root: emptyDataModel(), diagnostics: ctx.diagnostics, projectFile, nodesByFile: ctx.nodesByFile, unmappedFiles: [] };
  }
  const project = parsed.value as { name?: unknown; tree?: unknown };
  if (!project || typeof project !== "object" || typeof project.tree !== "object" || project.tree === null) {
    ctx.diagnostics.push({
      rule: "rojo/no-tree",
      severity: "error",
      category: "project",
      message: 'Project file needs a "tree" object',
      file: projectFile,
    });
    return { root: emptyDataModel(), diagnostics: ctx.diagnostics, projectFile, nodesByFile: ctx.nodesByFile, unmappedFiles: [] };
  }
  const baseDir = dirname(projectFile);
  const tree = project.tree as Record<string, unknown>;
  const rootName = typeof project.name === "string" ? project.name : "game";
  const root = projectNode(ctx, tree, rootName, "game", baseDir, projectFile, "/tree", text);
  if (root.className === "DataModel") root.name = "game";

  const unmappedFiles: string[] = [];
  for (const dir of ctx.mappedDirs) {
    for (const p of files.keys()) {
      if (!p.startsWith(`${dir}/`) || ctx.mappedFiles.has(p)) continue;
      unmappedFiles.push(p);
    }
  }
  return { root, diagnostics: ctx.diagnostics, projectFile, nodesByFile: ctx.nodesByFile, unmappedFiles: unmappedFiles.sort() };
}

function emptyDataModel(): RNode {
  return { id: "game", name: "game", className: "DataModel", properties: {}, attributes: {}, tags: [], children: [] };
}

function record(ctx: Ctx, file: string, id: string): void {
  const list = ctx.nodesByFile.get(file) ?? [];
  list.push(id);
  ctx.nodesByFile.set(file, list);
  ctx.mappedFiles.add(file);
}

function uniqueChildId(parentId: string, name: string, siblings: RNode[]): string {
  const base = `${parentId}/${name}`;
  if (!siblings.some((s) => s.id === base)) return base;
  let i = 2;
  while (siblings.some((s) => s.id === `${base}#${i}`)) i++;
  return `${base}#${i}`;
}

/** Guesses the class a project node key implies when `$className` is absent. */
function impliedClass(name: string, isRoot: boolean): string | undefined {
  if (isRoot && name === "game") return "DataModel";
  const c = getClass(name);
  if (c?.service) return name;
  if (name === "StarterPlayerScripts" || name === "StarterCharacterScripts") return name;
  return undefined;
}

function projectNode(
  ctx: Ctx,
  node: Record<string, unknown>,
  name: string,
  id: string,
  baseDir: string,
  projectFile: string,
  pointer: string,
  projectText: string,
): RNode {
  let result: RNode | undefined;
  const pathValue = node.$path;
  if (typeof pathValue === "string" || (pathValue && typeof pathValue === "object")) {
    const rel = typeof pathValue === "string" ? pathValue : (pathValue as { optional?: string }).optional;
    const optional = typeof pathValue === "object";
    if (typeof rel === "string") {
      const target = [baseDir, rel].filter(Boolean).join("/").replace(/\/+$/, "");
      if (ctx.files.has(target)) {
        result = fileNode(ctx, target, name, id);
      } else if (isDir(ctx.files, target)) {
        result = dirNode(ctx, target, name, id);
        ctx.mappedDirs.add(target);
      } else if (!optional) {
        ctx.diagnostics.push({
          rule: "rojo/missing-path",
          severity: "error",
          category: "project",
          message: `$path "${rel}" does not exist; Rojo will refuse to build`,
          file: projectFile,
          line: lineOfJsonKey(projectText, name),
        });
      }
    }
  }

  const explicitClass = typeof node.$className === "string" ? node.$className : undefined;
  const className = explicitClass ?? result?.className ?? impliedClass(name, pointer === "/tree") ?? undefined;
  if (!className) {
    ctx.diagnostics.push({
      rule: "rojo/no-classname",
      severity: "error",
      category: "project",
      message: `Project node "${name}" has neither $className nor $path, and "${name}" is not a service name`,
      file: projectFile,
      line: lineOfJsonKey(projectText, name),
    });
  }
  if (explicitClass && explicitClass !== "DataModel" && !getClass(explicitClass)) {
    ctx.diagnostics.push({
      rule: "roblox/unknown-class",
      severity: "warning",
      category: "project",
      message: `"${explicitClass}" is not a class this builder knows; check the spelling`,
      file: projectFile,
      line: lineOfJsonKey(projectText, name),
    });
  }

  const out: RNode = result ?? {
    id,
    name,
    className: className ?? "Folder",
    properties: {},
    attributes: {},
    tags: [],
    children: [],
    origin: { file: projectFile, pointer },
  };
  out.name = name;
  if (explicitClass) out.className = explicitClass;
  if (!out.origin) out.origin = { file: projectFile, pointer };

  if (node.$properties && typeof node.$properties === "object") {
    applyProperties(ctx, out, node.$properties as Record<string, unknown>, projectFile, projectText);
  }
  if (node.$attributes && typeof node.$attributes === "object") {
    applyAttributes(ctx, out, node.$attributes as Record<string, unknown>, projectFile, projectText);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      ctx.diagnostics.push({
        rule: "rojo/invalid-node",
        severity: "error",
        category: "project",
        message: `Project node "${key}" must be an object`,
        file: projectFile,
        line: lineOfJsonKey(projectText, key),
      });
      continue;
    }
    const childId = uniqueChildId(out.id, key, out.children);
    const existing = out.children.findIndex((c) => c.name === key);
    const child = projectNode(ctx, value as Record<string, unknown>, key, childId, baseDir, projectFile, `${pointer}/${key}`, projectText);
    if (existing >= 0) {
      // A project node with the same name as a directory child merges over it.
      out.children[existing] = { ...child, children: [...out.children[existing].children, ...child.children] };
    } else {
      out.children.push(child);
    }
  }
  return out;
}

function scriptClassFor(file: string): "Script" | "LocalScript" | "ModuleScript" | undefined {
  if (!SCRIPT_EXT.test(file)) return undefined;
  if (/\.server\.(luau|lua)$/.test(file)) return "Script";
  if (/\.client\.(luau|lua)$/.test(file)) return "LocalScript";
  return "ModuleScript";
}

/** Instance name for a file, per Rojo: extension(s) stripped. */
export function instanceNameForFile(file: string): string {
  const b = basename(file);
  return b
    .replace(/\.(server|client)\.(luau|lua)$/, "")
    .replace(/\.(luau|lua)$/, "")
    .replace(/\.model\.json$/, "")
    .replace(/\.meta\.json$/, "")
    .replace(/\.project\.json$/, "")
    .replace(/\.(json|txt|csv|toml|rbxmx|rbxm)$/, "");
}

function fileNode(ctx: Ctx, file: string, name: string | undefined, id: string): RNode | undefined {
  const data = ctx.files.get(file);
  const instName = name ?? instanceNameForFile(file);
  const base: Omit<RNode, "className"> = {
    id,
    name: instName,
    properties: {},
    attributes: {},
    tags: [],
    children: [],
    origin: { file },
  };

  const scriptClass = scriptClassFor(file);
  if (scriptClass) {
    record(ctx, file, id);
    const node: RNode = { ...base, className: scriptClass, source: typeof data === "string" ? data : "" };
    applyMeta(ctx, node, siblingMetaPath(file));
    return node;
  }

  if (file.endsWith(".model.json")) {
    const text = typeof data === "string" ? data : "";
    const parsed = parseJsonWithPosition(text);
    if (parsed.error) {
      ctx.diagnostics.push({
        rule: "rojo/invalid-json",
        severity: "error",
        category: "project",
        message: `Invalid JSON model: ${parsed.error.message}`,
        file,
        line: parsed.error.line,
        col: parsed.error.col,
      });
      record(ctx, file, id);
      return { ...base, className: "Folder" };
    }
    const node = jsonModelNode(ctx, parsed.value, instName, id, file, "", text);
    return node;
  }

  if (file.endsWith(".meta.json") || file.endsWith(".project.json")) {
    ctx.mappedFiles.add(file);
    return undefined;
  }

  if (file.endsWith(".json") || file.endsWith(".toml")) {
    record(ctx, file, id);
    if (file.endsWith(".json")) {
      const parsed = parseJsonWithPosition(typeof data === "string" ? data : "");
      if (parsed.error) {
        ctx.diagnostics.push({
          rule: "rojo/invalid-json",
          severity: "error",
          category: "project",
          message: `Invalid JSON: ${parsed.error.message}`,
          file,
          line: parsed.error.line,
          col: parsed.error.col,
        });
      }
    }
    return { ...base, className: "ModuleScript", source: `-- Generated by Rojo from ${basename(file)}\nreturn ${typeof data === "string" ? jsonToLuauLiteral(data) : "nil"}` };
  }

  if (file.endsWith(".txt")) {
    record(ctx, file, id);
    return { ...base, className: "StringValue", properties: { Value: { t: "string", v: typeof data === "string" ? data : "" } } };
  }

  if (file.endsWith(".csv")) {
    record(ctx, file, id);
    return { ...base, className: "LocalizationTable" };
  }

  if (file.endsWith(".rbxmx")) {
    record(ctx, file, id);
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const parsed = parseRbxmx(text);
    if (parsed.error || parsed.roots.length === 0) {
      ctx.diagnostics.push({
        rule: "rojo/invalid-rbxmx",
        severity: "error",
        category: "asset",
        message: parsed.error ?? "Model file contains no instances",
        file,
      });
      return { ...base, className: "Folder", opaque: true };
    }
    if (parsed.roots.length > 1) {
      ctx.diagnostics.push({
        rule: "rojo/rbxmx-multiple-roots",
        severity: "error",
        category: "asset",
        message: `Rojo requires a model file to have exactly one root instance; this has ${parsed.roots.length}`,
        file,
      });
    }
    const root = parsed.roots[0];
    return reId({ ...root, name: instName, origin: { file } }, id);
  }

  if (file.endsWith(".rbxm")) {
    record(ctx, file, id);
    return { ...base, className: "Model", opaque: true };
  }

  return undefined;
}

function reId(node: RNode, id: string): RNode {
  const children: RNode[] = [];
  for (const c of node.children) children.push(reId(c, uniqueChildId(id, c.name, children)));
  return { ...node, id, children };
}

function siblingMetaPath(file: string): string {
  const dir = dirname(file);
  const name = instanceNameForFile(file);
  return [dir, `${name}.meta.json`].filter(Boolean).join("/");
}

function applyMeta(ctx: Ctx, node: RNode, metaPath: string, allowClassName = false): void {
  const text = textOf(ctx.files, metaPath);
  if (text === undefined) return;
  ctx.mappedFiles.add(metaPath);
  const parsed = parseJsonWithPosition(text);
  if (parsed.error) {
    ctx.diagnostics.push({
      rule: "rojo/invalid-json",
      severity: "error",
      category: "project",
      message: `Invalid meta file: ${parsed.error.message}`,
      file: metaPath,
      line: parsed.error.line,
    });
    return;
  }
  const meta = parsed.value as Record<string, unknown>;
  const className = (meta.className ?? meta.ClassName) as unknown;
  if (typeof className === "string") {
    if (allowClassName) node.className = className;
    else {
      ctx.diagnostics.push({
        rule: "rojo/meta-classname",
        severity: "error",
        category: "project",
        message: "className in a meta file only applies to directories (init.meta.json)",
        file: metaPath,
      });
    }
  }
  const props = (meta.properties ?? meta.Properties) as Record<string, unknown> | undefined;
  if (props && typeof props === "object") applyProperties(ctx, node, props, metaPath, text);
  const attrs = (meta.attributes ?? meta.Attributes) as Record<string, unknown> | undefined;
  if (attrs && typeof attrs === "object") applyAttributes(ctx, node, attrs, metaPath, text);
}

function dirNode(ctx: Ctx, dir: string, name: string | undefined, id: string): RNode {
  const { files: fileNames, dirs } = listDir(ctx.files, dir);
  const instName = name ?? basename(dir);
  let node: RNode = {
    id,
    name: instName,
    className: "Folder",
    properties: {},
    attributes: {},
    tags: [],
    children: [],
    origin: { file: dir },
  };

  const initFile = fileNames.find((f) => /^init(\.server|\.client)?\.(luau|lua)$/.test(f));
  if (initFile) {
    const path = `${dir}/${initFile}`;
    const scriptNode = fileNode(ctx, path, instName, id);
    if (scriptNode) node = { ...scriptNode, origin: { file: path } };
  }
  applyMeta(ctx, node, `${dir}/init.meta.json`, true);

  const taken = new Map<string, string>();
  for (const f of fileNames) {
    if (f === initFile || f === "init.meta.json") continue;
    if (/^init\./.test(f) && SCRIPT_EXT.test(f)) {
      ctx.diagnostics.push({
        rule: "rojo/multiple-init",
        severity: "error",
        category: "project",
        message: `Directory has more than one init script (${initFile} and ${f})`,
        file: `${dir}/${f}`,
      });
      continue;
    }
    const path = `${dir}/${f}`;
    const childName = instanceNameForFile(path);
    const child = fileNode(ctx, path, undefined, uniqueChildId(node.id, childName, node.children));
    if (!child) continue;
    const clash = taken.get(childName);
    if (clash) {
      ctx.diagnostics.push({
        rule: "rojo/duplicate-name",
        severity: "warning",
        category: "naming",
        message: `"${f}" and "${clash}" both become an instance named "${childName}"; scripts can only reach one of them by name`,
        file: path,
      });
    }
    taken.set(childName, f);
    node.children.push(child);
  }
  for (const d of dirs) {
    const childName = d;
    const clash = taken.get(childName);
    if (clash) {
      ctx.diagnostics.push({
        rule: "rojo/duplicate-name",
        severity: "warning",
        category: "naming",
        message: `Folder "${d}" and file "${clash}" both become an instance named "${childName}"`,
        file: `${dir}/${d}`,
      });
    }
    taken.set(childName, `${d}/`);
    node.children.push(dirNode(ctx, `${dir}/${d}`, undefined, uniqueChildId(node.id, childName, node.children)));
  }
  return node;
}

function jsonModelNode(ctx: Ctx, value: unknown, name: string, id: string, file: string, pointer: string, text: string): RNode {
  const o = (value ?? {}) as Record<string, unknown>;
  const className = (o.ClassName ?? o.className) as unknown;
  const node: RNode = {
    id,
    name,
    className: typeof className === "string" ? className : "Folder",
    properties: {},
    attributes: {},
    tags: [],
    children: [],
    origin: { file, pointer },
  };
  record(ctx, file, id);
  if (typeof className !== "string") {
    ctx.diagnostics.push({
      rule: "rojo/model-classname",
      severity: "error",
      category: "project",
      message: `JSON model${pointer ? ` child at ${pointer}` : ""} is missing "ClassName"`,
      file,
    });
  } else if (!getClass(className)) {
    ctx.diagnostics.push({
      rule: "roblox/unknown-class",
      severity: "warning",
      category: "property",
      message: `"${className}" is not a class this builder knows; check the spelling`,
      file,
      line: lineOfJsonKey(text, className),
      instancePath: id,
    });
  }
  const props = (o.Properties ?? o.properties) as Record<string, unknown> | undefined;
  if (props && typeof props === "object") applyProperties(ctx, node, props, file, text);
  const attrs = (o.Attributes ?? o.attributes) as Record<string, unknown> | undefined;
  if (attrs && typeof attrs === "object") applyAttributes(ctx, node, attrs, file, text);
  const tags = (o.Tags ?? o.tags) as unknown;
  if (Array.isArray(tags)) node.tags = tags.filter((t): t is string => typeof t === "string");

  const children = (o.Children ?? o.children) as unknown;
  if (Array.isArray(children)) {
    children.forEach((c, i) => {
      const co = (c ?? {}) as Record<string, unknown>;
      const childName = (co.Name ?? co.name) as unknown;
      const cName = typeof childName === "string" ? childName : typeof (co.ClassName ?? co.className) === "string" ? String(co.ClassName ?? co.className) : "Instance";
      if (typeof childName !== "string") {
        ctx.diagnostics.push({
          rule: "rojo/model-child-name",
          severity: "warning",
          category: "naming",
          message: `A child in this JSON model has no "Name"; it will be named "${cName}"`,
          file,
        });
      }
      const childPointer = `${pointer}/Children/${i}`;
      node.children.push(jsonModelNode(ctx, c, cName, uniqueChildId(id, cName, node.children), file, childPointer, text));
    });
  }
  return node;
}

function applyProperties(ctx: Ctx, node: RNode, props: Record<string, unknown>, file: string, text: string): void {
  for (const [prop, raw] of Object.entries(props)) {
    if (prop === "Name") {
      if (typeof raw === "string") node.name = raw;
      continue;
    }
    if (prop === "Source" && typeof raw === "string") {
      node.source = raw;
      continue;
    }
    if (prop === "Tags" && Array.isArray(raw)) {
      node.tags = raw.filter((t): t is string => typeof t === "string");
      continue;
    }
    if (prop === "Attributes" && raw && typeof raw === "object") {
      applyAttributes(ctx, node, raw as Record<string, unknown>, file, text);
      continue;
    }
    const type = node.className === "DataModel" ? undefined : propType(node.className, prop);
    const known = getClass(node.className) !== undefined;
    if (!type && known) {
      ctx.diagnostics.push({
        rule: "roblox/unknown-property",
        severity: "error",
        category: "property",
        message: `${node.className} has no property "${prop}"`,
        file,
        line: lineOfJsonKey(text, prop),
        instancePath: node.id,
        fix: { kind: "json-patch", file, pointer: `${node.origin?.pointer ?? ""}/Properties/${prop}`, value: undefined, remove: true, description: `Remove "${prop}"` },
      });
      continue;
    }
    try {
      node.properties[prop] = fromRojo(raw, type);
    } catch (err) {
      ctx.diagnostics.push({
        rule: "roblox/property-type",
        severity: "error",
        category: "property",
        message: `${node.className}.${prop}: ${err instanceof ValueError ? err.message : String(err)}`,
        file,
        line: lineOfJsonKey(text, prop),
        instancePath: node.id,
      });
    }
  }
}

function applyAttributes(ctx: Ctx, node: RNode, attrs: Record<string, unknown>, file: string, text: string): void {
  for (const [key, raw] of Object.entries(attrs)) {
    if (key === "Rojo_Id" && typeof raw === "string") {
      node.refId = raw;
      continue;
    }
    if (key.startsWith("Rojo_Target_") && typeof raw === "string") {
      (node.refTargets ??= {})[key.slice("Rojo_Target_".length)] = raw;
      continue;
    }
    if (!/^[A-Za-z0-9_]{1,100}$/.test(key) || key.startsWith("RBX")) {
      ctx.diagnostics.push({
        rule: "roblox/attribute-name",
        severity: "error",
        category: "naming",
        message: `Attribute name "${key}" is invalid: use letters, digits and _ (max 100), and not the RBX prefix`,
        file,
        line: lineOfJsonKey(text, key),
        instancePath: node.id,
      });
      continue;
    }
    const value = attributeValue(raw);
    if (!value) {
      ctx.diagnostics.push({
        rule: "roblox/attribute-type",
        severity: "error",
        category: "property",
        message: `Attribute "${key}" has an unsupported value ${JSON.stringify(raw)}`,
        file,
        line: lineOfJsonKey(text, key),
        instancePath: node.id,
      });
      continue;
    }
    node.attributes[key] = value;
  }
}

function attributeValue(raw: unknown): RValue | undefined {
  if (typeof raw === "boolean") return { t: "bool", v: raw };
  if (typeof raw === "string") return { t: "string", v: raw };
  if (typeof raw === "number") return { t: "float", v: raw };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    try {
      return fromRojo(raw, undefined);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** JSON text -> equivalent Luau table literal, for .json modules. */
export function jsonToLuauLiteral(text: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "nil";
  }
  const go = (v: unknown, indent: string): string => {
    if (v === null) return "nil";
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
      if (v.length === 0) return "{}";
      return `{\n${v.map((x) => `${indent}\t${go(x, indent + "\t")},`).join("\n")}\n${indent}}`;
    }
    const entries = Object.entries(v as object);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(([k, x]) => `${indent}\t${/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`} = ${go(x, indent + "\t")},`)
      .join("\n")}\n${indent}}`;
  };
  return go(value, "");
}

/** Which script context a node runs in, for the analyzer. */
export function scriptContextOf(node: RNode): "server" | "client" | "module" {
  if (node.className === "ModuleScript") return "module";
  if (node.className === "LocalScript") return "client";
  const rc = node.properties.RunContext;
  if (rc?.t === "Enum" && rc.v === "Client") return "client";
  return "server";
}
