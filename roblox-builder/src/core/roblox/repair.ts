// Automatic repairs for compatibility findings.
//
// A repair is only offered when it is mechanical and safe: renaming a
// deprecated call, correcting a misspelt service, moving a script to where it
// actually runs, declaring a remote that code already uses, removing a
// property that does not exist. Anything that needs judgment (an unvalidated
// remote argument, a missing listener) is left for the agent, which gets the
// diagnostic text instead.

import type { Diagnostic, Fix, TextEdit } from "../diagnostics";
import { basename, dirname, isDir, textOf, type FileMap } from "../project/files";
import { indexTree, type RNode } from "./instance";
import type { ValidationReport } from "./validate";

export interface RepairAction {
  description: string;
  rule: string;
  fix: Fix;
}

export interface RepairResult {
  files: FileMap;
  applied: RepairAction[];
  failed: { action: RepairAction; reason: string }[];
  changedFiles: string[];
}

/** Every repair that can be applied to this report, deduplicated. */
export function planRepairs(files: FileMap, report: ValidationReport): RepairAction[] {
  const actions: RepairAction[] = [];
  const seen = new Set<string>();
  const add = (rule: string, fix: Fix) => {
    const key = JSON.stringify(fix);
    if (seen.has(key)) return;
    seen.add(key);
    actions.push({ rule, description: fix.description, fix });
  };

  for (const d of report.diagnostics) {
    if (d.fix) add(d.rule, d.fix);
  }

  const { byId } = indexTree(report.build.root);
  const mappedDirFor = (className: string): string | undefined => {
    for (const [file, ids] of report.build.nodesByFile) {
      if (!/\.(luau|lua)$/.test(file)) continue;
      const node = byId.get(ids[0]);
      if (!node) continue;
      if (node.id.split("/").includes(className)) return dirname(file);
    }
    return undefined;
  };

  for (const d of report.diagnostics) {
    const node = d.instancePath ? byId.get(d.instancePath) : undefined;
    const file = node?.origin?.file;

    if (d.rule === "roblox/localscript-location" && file && /\.client\.(luau|lua)$/.test(file)) {
      const target = mappedDirFor("StarterPlayerScripts") ?? (isDir(files, "src/client") ? "src/client" : undefined);
      if (target && target !== dirname(file)) {
        add(d.rule, { kind: "move-file", from: file, to: `${target}/${basename(file)}`, description: `Move ${basename(file)} to ${target} (StarterPlayerScripts) so it runs` });
      }
    }
    if (d.rule === "roblox/script-location" && file && /\.server\.(luau|lua)$/.test(file)) {
      const target = mappedDirFor("ServerScriptService") ?? (isDir(files, "src/server") ? "src/server" : undefined);
      if (target && target !== dirname(file)) {
        add(d.rule, { kind: "move-file", from: file, to: `${target}/${basename(file)}`, description: `Move ${basename(file)} to ${target} (ServerScriptService) so it runs` });
      }
    }
    if (d.rule === "rojo/missing-path") {
      const m = /\$path "([^"]+)"/.exec(d.message);
      if (m && !m[1].includes("..")) {
        const dir = m[1].replace(/\/+$/, "");
        if (!/\.\w+$/.test(dir)) {
          add(d.rule, { kind: "write-file", file: `${dir}/init.meta.json`, content: '{\n  "className": "Folder"\n}\n', description: `Create the missing folder ${dir}` });
        }
      }
    }
    if (d.rule === "roblox/waitforchild-missing" || d.rule === "roblox/index-missing") {
      const remote = missingRemoteFix(d, report, byId, files);
      if (remote) add("roblox/remote-missing", remote);
    }
  }
  return actions;
}

/** When code waits for a remote that the Remotes model does not declare, declare it. */
function missingRemoteFix(d: Diagnostic, report: ValidationReport, byId: Map<string, RNode>, files: FileMap): Fix | undefined {
  const m = /nothing named "([^"]+)" exists under ([\w.]+)|"([^"]+)" is not a valid member of \w+ "([\w.]+)"/.exec(d.message);
  if (!m) return undefined;
  const name = m[1] ?? m[3];
  const parentPath = m[2] ?? m[4];
  const parent = [...byId.values()].find((n) => n.id.split("/").slice(1).join(".") === parentPath);
  if (!parent?.origin?.file.endsWith(".model.json")) return undefined;
  const siblingsAreRemotes = parent.children.length > 0 && parent.children.every((c) => /Remote(Event|Function)$|UnreliableRemoteEvent/.test(c.className));
  if (!siblingsAreRemotes && parent.name !== "Remotes") return undefined;

  let kind = "RemoteEvent";
  for (const f of report.facts.values()) {
    for (const rc of f.remoteCalls) {
      if (rc.name === name && /Invoke/.test(rc.member)) kind = "RemoteFunction";
    }
  }
  const text = textOf(files, parent.origin.file);
  if (!text) return undefined;
  let model: { Children?: unknown[]; children?: unknown[] };
  try {
    model = JSON.parse(text);
  } catch {
    return undefined;
  }
  const pointer = parent.origin.pointer ?? "";
  const target = resolvePointer(model, pointer) as { Children?: unknown[]; children?: unknown[] } | undefined;
  if (!target) return undefined;
  const key = target.children && !target.Children ? "children" : "Children";
  const list = [...((target[key] as unknown[]) ?? []), { Name: name, ClassName: kind }];
  return {
    kind: "json-patch",
    file: parent.origin.file,
    pointer: `${pointer}/${key}`,
    value: list,
    description: `Declare ${kind} "${name}" in ${parent.origin.file}`,
  };
}

function resolvePointer(root: unknown, pointer: string): unknown {
  let cur: unknown = root;
  for (const raw of pointer.split("/").filter(Boolean)) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function applyTextEdits(text: string, edits: TextEdit[]): string {
  const lines = text.split("\n");
  const offsetOf = (line: number, col: number) => {
    let off = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
    return off + col - 1;
  };
  const sorted = [...edits].sort((a, b) => offsetOf(b.line, b.col) - offsetOf(a.line, a.col));
  let out = text;
  for (const e of sorted) {
    const start = offsetOf(e.line, e.col);
    const end = offsetOf(e.endLine, e.endCol);
    if (start < 0 || end < start || end > out.length) throw new Error("Edit is outside the file");
    out = out.slice(0, start) + e.text + out.slice(end);
  }
  return out;
}

function applyJsonPatch(text: string, pointer: string, value: unknown, remove: boolean | undefined): string {
  const doc = JSON.parse(text);
  const candidates = [pointer, pointer.replace("/Properties/", "/properties/"), pointer.replace("/Properties/", "/$properties/")];
  for (const p of candidates) {
    const segs = p.split("/").filter(Boolean).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    const last = segs.pop();
    if (last === undefined) continue;
    const parentPointer = segs.length ? "/" + segs.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/") : "";
    const parent = resolvePointer(doc, parentPointer);
    if (!parent || typeof parent !== "object") continue;
    const obj = parent as Record<string, unknown>;
    if (remove) {
      if (!(last in obj)) continue;
      delete obj[last];
    } else {
      obj[last] = value;
    }
    return JSON.stringify(doc, null, 2) + "\n";
  }
  throw new Error(`JSON pointer ${pointer} not found`);
}

/** Applies fixes to a copy of the file map. Actions are applied in order; later ones see earlier results. */
export function applyRepairs(files: FileMap, actions: RepairAction[]): RepairResult {
  const out: FileMap = new Map(files);
  const applied: RepairAction[] = [];
  const failed: { action: RepairAction; reason: string }[] = [];
  const changed = new Set<string>();

  // Text edits for the same file must be applied together, against the
  // original positions, or earlier edits shift later ones.
  const textEditsByFile = new Map<string, { action: RepairAction; edits: TextEdit[] }[]>();
  for (const a of actions) {
    if (a.fix.kind === "text-edits") {
      const list = textEditsByFile.get(a.fix.file) ?? [];
      list.push({ action: a, edits: a.fix.edits });
      textEditsByFile.set(a.fix.file, list);
    }
  }
  for (const [file, list] of textEditsByFile) {
    const text = textOf(out, file);
    if (text === undefined) {
      list.forEach((l) => failed.push({ action: l.action, reason: `${file} does not exist` }));
      continue;
    }
    // Drop overlapping edits, keeping the first.
    const kept: typeof list = [];
    const ranges: [number, number, number, number][] = [];
    for (const l of list) {
      const overlaps = l.edits.some((e) => ranges.some(([sl, sc, el, ec]) => !(e.endLine < sl || (e.endLine === sl && e.endCol <= sc) || e.line > el || (e.line === el && e.col >= ec))));
      if (overlaps) {
        failed.push({ action: l.action, reason: "overlaps another fix in the same place" });
        continue;
      }
      l.edits.forEach((e) => ranges.push([e.line, e.col, e.endLine, e.endCol]));
      kept.push(l);
    }
    try {
      out.set(file, applyTextEdits(text, kept.flatMap((k) => k.edits)));
      kept.forEach((k) => applied.push(k.action));
      changed.add(file);
    } catch (err) {
      kept.forEach((k) => failed.push({ action: k.action, reason: err instanceof Error ? err.message : String(err) }));
    }
  }

  for (const a of actions) {
    const fix = a.fix;
    try {
      switch (fix.kind) {
        case "text-edits":
          continue;
        case "move-file": {
          const data = out.get(fix.from);
          if (data === undefined) throw new Error(`${fix.from} does not exist`);
          if (out.has(fix.to)) throw new Error(`${fix.to} already exists`);
          out.delete(fix.from);
          out.set(fix.to, data);
          // A sibling .meta.json travels with its script.
          const meta = fix.from.replace(/\.(server|client)?\.?(luau|lua)$/, "").replace(/\.$/, "") + ".meta.json";
          const metaData = out.get(meta);
          if (metaData !== undefined) {
            out.delete(meta);
            out.set(`${dirname(fix.to)}/${basename(meta)}`, metaData);
          }
          changed.add(fix.from);
          changed.add(fix.to);
          break;
        }
        case "write-file":
          if (out.has(fix.file)) throw new Error(`${fix.file} already exists`);
          out.set(fix.file, fix.content);
          changed.add(fix.file);
          break;
        case "json-patch": {
          const text = textOf(out, fix.file);
          if (text === undefined) throw new Error(`${fix.file} does not exist`);
          out.set(fix.file, applyJsonPatch(text, fix.pointer, fix.value, fix.remove));
          changed.add(fix.file);
          break;
        }
      }
      applied.push(a);
    } catch (err) {
      failed.push({ action: a, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { files: out, applied, failed, changedFiles: [...changed].sort() };
}
