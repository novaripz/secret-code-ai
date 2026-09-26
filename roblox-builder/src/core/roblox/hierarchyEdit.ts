// Editing the Roblox hierarchy by editing the files that define it.
//
// The explorer, the visual GUI editor and the agent's modify_roblox_hierarchy
// tool all change instances through here. An instance lives somewhere
// concrete — a node in a .model.json, a node in default.project.json, a
// script file, a directory — and each edit is translated into the smallest
// change to that file, so the project stays a normal, hand-editable Rojo
// project.

import { basename, dirname, isDir, normalizePath, parseJsonWithPosition, textOf, type FileMap } from "../project/files";
import { getClass, isA, propType } from "./classes";
import { indexTree, type RNode } from "./instance";
import { buildDataModel, DEFAULT_PROJECT_FILE } from "./rojo";
import { fromRojo, toRojo, type RValue } from "./values";

export type HierarchyOp =
  | { op: "add"; parent: string; className: string; name: string; properties?: Record<string, unknown>; children?: ModelJson[] }
  | { op: "set"; path: string; properties: Record<string, unknown> }
  | { op: "remove"; path: string }
  | { op: "rename"; path: string; name: string }
  | { op: "move"; path: string; newParent: string };

export interface ModelJson {
  Name?: string;
  ClassName: string;
  Properties?: Record<string, unknown>;
  Attributes?: Record<string, unknown>;
  Tags?: string[];
  Children?: ModelJson[];
}

export class HierarchyEditError extends Error {}

/** `ReplicatedStorage.Shared.Config` or `game/ReplicatedStorage/Shared/Config` -> node. */
export function findNodeByPath(root: RNode, path: string): RNode | undefined {
  const clean = path.trim().replace(/^game[./]?/, "");
  const segs = clean ? clean.split(/[./]/) : [];
  let cur: RNode | undefined = root;
  for (const s of segs) {
    cur = cur?.children.find((c) => c.name === s);
    if (!cur) return undefined;
  }
  return cur;
}

/** Serializes an instance subtree to Rojo's JSON model format. */
export function nodeToModelJson(n: RNode, includeName = true): ModelJson {
  const out: ModelJson = { ClassName: n.className };
  if (includeName) out.Name = n.name;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.properties)) props[k] = toRojo(v);
  if (n.source !== undefined && (n.className === "Script" || n.className === "LocalScript" || n.className === "ModuleScript")) {
    props.Source = n.source;
  }
  if (Object.keys(props).length) out.Properties = props;
  const attrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n.attributes)) attrs[k] = toRojo(v);
  if (n.refId) attrs.Rojo_Id = n.refId;
  for (const [k, v] of Object.entries(n.refTargets ?? {})) attrs[`Rojo_Target_${k}`] = v;
  if (Object.keys(attrs).length) out.Attributes = attrs;
  if (n.tags.length) out.Tags = n.tags;
  if (n.children.length) out.Children = n.children.map((c) => nodeToModelJson(c));
  return out;
}

function validateProps(className: string, props: Record<string, unknown>): void {
  if (!getClass(className)) throw new HierarchyEditError(`Unknown class "${className}"`);
  for (const [k, v] of Object.entries(props)) {
    if (k === "Name" || k === "Source" || k === "Tags" || k === "Attributes") continue;
    const t = propType(className, k);
    if (!t) throw new HierarchyEditError(`${className} has no property "${k}"`);
    fromRojo(v, t); // throws ValueError with a precise message
  }
}

function validateModel(m: ModelJson): void {
  if (!m || typeof m.ClassName !== "string") throw new HierarchyEditError("Each instance needs a ClassName");
  if (getClass(m.ClassName)?.service) throw new HierarchyEditError(`${m.ClassName} is a service and cannot be created`);
  if (getClass(m.ClassName)?.notCreatable) throw new HierarchyEditError(`${m.ClassName} cannot be created`);
  validateProps(m.ClassName, m.Properties ?? {});
  (m.Children ?? []).forEach(validateModel);
}

function pointerGet(doc: unknown, pointer: string): unknown {
  let cur = doc;
  for (const seg of pointer.split("/").filter(Boolean)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function pointerParent(pointer: string): { parent: string; key: string } {
  const segs = pointer.split("/").filter(Boolean);
  const key = segs.pop() ?? "";
  return { parent: segs.length ? "/" + segs.join("/") : "", key };
}

const writeJson = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

function loadJson(files: FileMap, file: string): Record<string, unknown> {
  const text = textOf(files, file);
  if (text === undefined) throw new HierarchyEditError(`${file} does not exist`);
  const parsed = parseJsonWithPosition(text);
  if (parsed.error) throw new HierarchyEditError(`${file} is not valid JSON (line ${parsed.error.line}): ${parsed.error.message}`);
  return parsed.value as Record<string, unknown>;
}

/** Where a new child of `parent` should be written. */
function childTarget(files: FileMap, parent: RNode): { kind: "json"; file: string; pointer: string; project: boolean } | { kind: "dir"; dir: string } {
  const origin = parent.origin;
  if (!origin) throw new HierarchyEditError(`${parent.name} has no source file`);
  if (origin.file.endsWith(".model.json")) return { kind: "json", file: origin.file, pointer: origin.pointer ?? "", project: false };
  if (origin.file.endsWith(".project.json")) {
    // A project node backed by a directory gets a new file there; otherwise the child goes in the project file.
    return { kind: "json", file: origin.file, pointer: origin.pointer ?? "/tree", project: true };
  }
  if (isDir(files, origin.file)) return { kind: "dir", dir: origin.file };
  // A script: turn `Foo.luau` into `Foo/init.luau` so it can have children.
  if (/\.(luau|lua)$/.test(origin.file)) {
    const base = basename(origin.file).replace(/\.(server|client)?\.?(luau|lua)$/, "");
    const suffix = /\.server\./.test(origin.file) ? ".server" : /\.client\./.test(origin.file) ? ".client" : "";
    return { kind: "dir", dir: `${dirname(origin.file) ? dirname(origin.file) + "/" : ""}${base}` + `\u0000${suffix}` };
  }
  throw new HierarchyEditError(`Cannot add children to ${parent.name} (defined by ${origin.file})`);
}

/** Directory a project node maps with $path, if any. */
function projectNodeDir(files: FileMap, projectFile: string, pointer: string): string | undefined {
  const doc = loadJson(files, projectFile);
  const node = pointerGet(doc, pointer) as Record<string, unknown> | undefined;
  const p = node?.$path;
  if (typeof p === "string" && isDir(files, [dirname(projectFile), p].filter(Boolean).join("/"))) {
    return [dirname(projectFile), p].filter(Boolean).join("/").replace(/\/+$/, "");
  }
  return undefined;
}

function uniqueFileName(files: FileMap, dir: string, name: string, ext: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_") || "Instance";
  let candidate = `${dir}/${safe}${ext}`;
  let i = 2;
  while (files.has(candidate) || isDir(files, candidate.replace(ext, ""))) candidate = `${dir}/${safe}${i++}${ext}`;
  return normalizePath(candidate);
}

export interface EditResult {
  files: FileMap;
  changed: string[];
  summary: string;
}

export function applyHierarchyOps(files: FileMap, ops: HierarchyOp[], projectFile = DEFAULT_PROJECT_FILE): EditResult {
  let current: FileMap = new Map(files);
  const changed = new Set<string>();
  const summaries: string[] = [];
  for (const op of ops) {
    const r = applyOne(current, op, projectFile);
    current = r.files;
    r.changed.forEach((c) => changed.add(c));
    summaries.push(r.summary);
  }
  return { files: current, changed: [...changed].sort(), summary: summaries.join("\n") };
}

function applyOne(files: FileMap, op: HierarchyOp, projectFile: string): EditResult {
  const out: FileMap = new Map(files);
  const build = buildDataModel(files, projectFile);
  const root = build.root;

  switch (op.op) {
    case "add": {
      const parent = findNodeByPath(root, op.parent);
      if (!parent) throw new HierarchyEditError(`No instance at ${op.parent}`);
      const model: ModelJson = { Name: op.name, ClassName: op.className, Properties: op.properties, Children: op.children };
      validateModel(model);
      if (!op.name.trim()) throw new HierarchyEditError("Name cannot be empty");
      const isScript = ["Script", "LocalScript", "ModuleScript"].includes(op.className);
      const target = childTarget(files, parent);

      const writeAsFile = (dir: string) => {
        if (isScript) {
          const ext = op.className === "Script" ? ".server.luau" : op.className === "LocalScript" ? ".client.luau" : ".luau";
          const file = uniqueFileName(out, dir, op.name, ext);
          const src = typeof op.properties?.Source === "string" ? op.properties.Source : "--!strict\n";
          out.set(file, src);
          return file;
        }
        const file = uniqueFileName(out, dir, op.name, ".model.json");
        const { Name: _omit, ...rest } = model;
        void _omit;
        out.set(file, writeJson(rest));
        return file;
      };

      if (target.kind === "dir") {
        let dir = target.dir;
        const extra: string[] = [];
        if (dir.includes("\u0000")) {
          // Promote a single-file script to a directory with an init script.
          const [d, suffix] = dir.split("\u0000");
          const originFile = parent.origin!.file;
          const data = out.get(originFile)!;
          out.delete(originFile);
          out.set(`${d}/init${suffix}.luau`, data);
          extra.push(originFile, `${d}/init${suffix}.luau`);
          dir = d;
        }
        const file = writeAsFile(dir);
        return { files: out, changed: [...extra, file], summary: `Added ${op.className} "${op.name}" under ${op.parent} (${file})` };
      }
      if (target.project) {
        const dir = projectNodeDir(files, target.file, target.pointer);
        if (dir) {
          const file = writeAsFile(dir);
          return { files: out, changed: [file], summary: `Added ${op.className} "${op.name}" under ${op.parent} (${file})` };
        }
        if (isScript) throw new HierarchyEditError(`${op.parent} is not backed by a folder; map it to a directory with $path to add scripts`);
        const doc = loadJson(out, target.file);
        const node = pointerGet(doc, target.pointer) as Record<string, unknown>;
        if (node[op.name]) throw new HierarchyEditError(`${op.parent} already has a child named ${op.name}`);
        node[op.name] = projectNodeFromModel(model);
        out.set(target.file, writeJson(doc));
        return { files: out, changed: [target.file], summary: `Added ${op.className} "${op.name}" under ${op.parent}` };
      }
      const doc = loadJson(out, target.file);
      const node = (target.pointer ? pointerGet(doc, target.pointer) : doc) as Record<string, unknown>;
      const key = node.children && !node.Children ? "children" : "Children";
      const list = (node[key] as unknown[]) ?? [];
      list.push(model);
      node[key] = list;
      out.set(target.file, writeJson(doc));
      return { files: out, changed: [target.file], summary: `Added ${op.className} "${op.name}" under ${op.parent}` };
    }

    case "set": {
      const node = findNodeByPath(root, op.path);
      if (!node) throw new HierarchyEditError(`No instance at ${op.path}`);
      validateProps(node.className, op.properties);
      const origin = node.origin;
      if (!origin) throw new HierarchyEditError(`${op.path} has no source file`);
      if (/\.(luau|lua)$/.test(origin.file) && Object.keys(op.properties).every((k) => k === "Source")) {
        out.set(origin.file, String(op.properties.Source));
        return { files: out, changed: [origin.file], summary: `Updated source of ${op.path}` };
      }
      if (origin.file.endsWith(".model.json") || origin.file.endsWith(".project.json")) {
        const doc = loadJson(out, origin.file);
        const target = (origin.pointer ? pointerGet(doc, origin.pointer) : doc) as Record<string, unknown>;
        const isProject = origin.file.endsWith(".project.json");
        const key = isProject ? "$properties" : target.properties && !target.Properties ? "properties" : "Properties";
        const props = (target[key] as Record<string, unknown>) ?? {};
        for (const [k, v] of Object.entries(op.properties)) {
          if (v === null) delete props[k];
          else props[k] = v;
        }
        target[key] = props;
        out.set(origin.file, writeJson(doc));
        return { files: out, changed: [origin.file], summary: `Set ${Object.keys(op.properties).join(", ")} on ${op.path}` };
      }
      // Scripts and directories take properties through a meta file.
      const metaFile = isDir(files, origin.file)
        ? `${origin.file}/init.meta.json`
        : /\/init(\.server|\.client)?\.(luau|lua)$/.test(origin.file)
          ? `${dirname(origin.file)}/init.meta.json`
          : `${dirname(origin.file) ? dirname(origin.file) + "/" : ""}${basename(origin.file).replace(/\.(server|client)?\.?(luau|lua)$/, "")}.meta.json`;
      const meta = out.has(metaFile) ? loadJson(out, metaFile) : {};
      const key = meta.Properties && !meta.properties ? "Properties" : "properties";
      const props = (meta[key] as Record<string, unknown>) ?? {};
      for (const [k, v] of Object.entries(op.properties)) {
        if (k === "Source") continue;
        if (v === null) delete props[k];
        else props[k] = v;
      }
      meta[key] = props;
      out.set(metaFile, writeJson(meta));
      return { files: out, changed: [metaFile], summary: `Set ${Object.keys(op.properties).join(", ")} on ${op.path}` };
    }

    case "rename": {
      const node = findNodeByPath(root, op.path);
      if (!node?.origin) throw new HierarchyEditError(`No instance at ${op.path}`);
      if (!op.name.trim()) throw new HierarchyEditError("Name cannot be empty");
      const origin = node.origin;
      if (origin.file.endsWith(".model.json") && origin.pointer) {
        const doc = loadJson(out, origin.file);
        const target = pointerGet(doc, origin.pointer) as Record<string, unknown>;
        target[target.name && !target.Name ? "name" : "Name"] = op.name;
        out.set(origin.file, writeJson(doc));
        return { files: out, changed: [origin.file], summary: `Renamed ${op.path} to ${op.name}` };
      }
      if (origin.file.endsWith(".project.json") && origin.pointer) {
        const doc = loadJson(out, origin.file);
        const { parent, key } = pointerParent(origin.pointer);
        const container = pointerGet(doc, parent) as Record<string, unknown>;
        if (container[op.name]) throw new HierarchyEditError(`A sibling named ${op.name} already exists`);
        container[op.name] = container[key];
        delete container[key];
        out.set(origin.file, writeJson(doc));
        return { files: out, changed: [origin.file], summary: `Renamed ${op.path} to ${op.name}` };
      }
      // File-backed: rename the file (or directory), keeping its extension.
      const from = origin.file;
      const renamed = renameFileBacked(out, from, op.name);
      return { files: out, changed: renamed, summary: `Renamed ${op.path} to ${op.name}` };
    }

    case "remove": {
      const node = findNodeByPath(root, op.path);
      if (!node?.origin) throw new HierarchyEditError(`No instance at ${op.path}`);
      if (getClass(node.className)?.service) throw new HierarchyEditError("Services cannot be removed");
      const origin = node.origin;
      if (origin.pointer && (origin.file.endsWith(".model.json") || origin.file.endsWith(".project.json"))) {
        const doc = loadJson(out, origin.file);
        const { parent, key } = pointerParent(origin.pointer);
        const container = pointerGet(doc, parent);
        if (Array.isArray(container)) container.splice(Number(key), 1);
        else if (container && typeof container === "object") delete (container as Record<string, unknown>)[key];
        out.set(origin.file, writeJson(doc));
        return { files: out, changed: [origin.file], summary: `Removed ${op.path}` };
      }
      const removed: string[] = [];
      const initDir = /\/init(\.server|\.client)?\.(luau|lua)$/.test(origin.file) ? dirname(origin.file) : undefined;
      const prefix = initDir ?? origin.file;
      for (const p of [...out.keys()]) {
        if (p === prefix || p.startsWith(`${prefix}/`)) {
          out.delete(p);
          removed.push(p);
        }
      }
      const meta = `${prefix.replace(/\.(server|client)?\.?(luau|lua|model\.json)$/, "")}.meta.json`;
      if (out.delete(meta)) removed.push(meta);
      return { files: out, changed: removed, summary: `Removed ${op.path}` };
    }

    case "move": {
      const node = findNodeByPath(root, op.path);
      const newParent = findNodeByPath(root, op.newParent);
      if (!node?.origin || !newParent) throw new HierarchyEditError(`Cannot find ${node ? op.newParent : op.path}`);
      const { byId } = indexTree(root);
      for (let p: RNode | undefined = newParent; p; p = byId.get(p.id.split("/").slice(0, -1).join("/"))) {
        if (p.id === node.id) throw new HierarchyEditError("Cannot move an instance into itself");
      }
      // File-backed script moving to a directory-backed parent: move the file.
      const target = childTarget(files, newParent);
      if (/\.(luau|lua)$/.test(node.origin.file) && !node.origin.pointer) {
        let dir: string | undefined;
        if (target.kind === "dir" && !target.dir.includes("\u0000")) dir = target.dir;
        else if (target.kind === "json" && target.project) dir = projectNodeDir(files, target.file, target.pointer);
        if (!dir) throw new HierarchyEditError(`${op.newParent} is not backed by a folder; scripts can only move into folders`);
        const dest = `${dir}/${basename(node.origin.file)}`;
        if (out.has(dest)) throw new HierarchyEditError(`${dest} already exists`);
        const data = out.get(node.origin.file)!;
        out.delete(node.origin.file);
        out.set(dest, data);
        return { files: out, changed: [node.origin.file, dest], summary: `Moved ${op.path} to ${op.newParent}` };
      }
      // Anything else: serialize, remove, re-add under the new parent.
      const model = nodeToModelJson(node);
      let next = applyOne(out, { op: "remove", path: op.path }, projectFile);
      next = applyOne(next.files, {
        op: "add",
        parent: op.newParent,
        className: model.ClassName,
        name: node.name,
        properties: model.Properties,
        children: model.Children,
      }, projectFile);
      return { files: next.files, changed: next.changed, summary: `Moved ${op.path} to ${op.newParent}` };
    }
  }

}

function renameFileBacked(files: FileMap, from: string, name: string): string[] {
  const dir = dirname(from);
  const isFolder = isDir(files, from);
  const changed: string[] = [];
  if (isFolder) {
    const to = `${dir ? dir + "/" : ""}${name}`;
    for (const p of [...files.keys()]) {
      if (p.startsWith(`${from}/`)) {
        const np = to + p.slice(from.length);
        files.set(np, files.get(p)!);
        files.delete(p);
        changed.push(p, np);
      }
    }
    return changed;
  }
  const ext = /(\.server\.luau|\.client\.luau|\.server\.lua|\.client\.lua|\.model\.json|\.luau|\.lua|\.json|\.txt|\.rbxmx|\.rbxm)$/.exec(from)?.[1] ?? "";
  const to = `${dir ? dir + "/" : ""}${name}${ext}`;
  if (files.has(to)) throw new HierarchyEditError(`${to} already exists`);
  files.set(to, files.get(from)!);
  files.delete(from);
  changed.push(from, to);
  const meta = from.replace(ext, ".meta.json");
  if (files.has(meta)) {
    const toMeta = to.replace(ext, ".meta.json");
    files.set(toMeta, files.get(meta)!);
    files.delete(meta);
    changed.push(meta, toMeta);
  }
  return changed;
}

function projectNodeFromModel(m: ModelJson): Record<string, unknown> {
  const node: Record<string, unknown> = { $className: m.ClassName };
  if (m.Properties && Object.keys(m.Properties).length) node.$properties = m.Properties;
  if (m.Attributes && Object.keys(m.Attributes).length) node.$attributes = m.Attributes;
  for (const c of m.Children ?? []) node[c.Name ?? c.ClassName] = projectNodeFromModel(c);
  return node;
}

/** Sets one typed property on a node in memory (used by the GUI editor before writing). */
export function setNodeProperty(node: RNode, prop: string, value: RValue | undefined): void {
  if (value === undefined) delete node.properties[prop];
  else node.properties[prop] = value;
}

/** A GUI object class is something the visual editor can place. */
export function isPlaceableGui(className: string): boolean {
  return isA(className, "GuiObject") || isA(className, "UIComponent");
}
