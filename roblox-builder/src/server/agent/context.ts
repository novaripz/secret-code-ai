// The project context the agent receives at the start of every run: the
// structured memory plus everything derivable from the files, computed fresh
// so it is never stale — file tree, Roblox hierarchy, scripts and where they
// run, remotes, assets, UI, dependencies, and the current check results.

import { renderTree, textOf, type FileMap } from "@/core/project/files";
import type { ProjectMemory, ProjectMeta } from "@/core/project/types";
import { getClass, isA } from "@/core/roblox/classes";
import { dottedPath, walk, type RNode } from "@/core/roblox/instance";
import { scriptContextOf } from "@/core/roblox/rojo";
import { isRobloxKind } from "@/core/roblox/template";
import { validateRobloxProject, type ValidationReport } from "@/core/roblox/validate";

const IMPORTANT_PROPS = ["Text", "Size", "Position", "AnchorPoint", "Material", "Anchored", "Value"];

/** Indented hierarchy with class names, optionally with key properties. */
export function renderHierarchy(root: RNode, opts: { maxDepth?: number; maxNodes?: number; properties?: boolean } = {}): string {
  const lines: string[] = [];
  const maxDepth = opts.maxDepth ?? 8;
  const maxNodes = opts.maxNodes ?? 400;
  let count = 0;
  walk(root, (n, _p, depth) => {
    if (count >= maxNodes) return false;
    if (depth > maxDepth) return false;
    count++;
    let line = `${"  ".repeat(depth)}${n.name} [${n.className}]`;
    if (n.origin?.file && (depth <= 2 || /\.(luau|lua)$/.test(n.origin.file))) line += `  <- ${n.origin.file}`;
    if (opts.properties) {
      const props = IMPORTANT_PROPS.filter((k) => n.properties[k]).map((k) => {
        const v = n.properties[k];
        return `${k}=${JSON.stringify("v" in v ? v.v : v)}`;
      });
      if (props.length) line += `  {${props.join(", ")}}`;
    }
    lines.push(line);
  });
  if (count >= maxNodes) lines.push(`… (truncated at ${maxNodes} instances)`);
  return lines.join("\n");
}

export interface BuiltContext {
  text: string;
  report?: ValidationReport;
}

export function buildProjectContext(meta: ProjectMeta, memory: ProjectMemory, files: FileMap, extras: { recentRuns?: string[]; focus?: { file?: string; instance?: string } } = {}): BuiltContext {
  const parts: string[] = [];
  parts.push(`# Project: ${meta.name}\nKind: ${meta.kind}\nBranch: ${meta.activeBranch}${meta.description ? `\nDescription: ${meta.description}` : ""}`);

  const mem: string[] = [];
  const list = (title: string, items: string[]) => items.length && mem.push(`## ${title}\n${items.map((i) => `- ${i}`).join("\n")}`);
  list("Goals", memory.goals);
  list("Architecture", memory.architecture);
  list("Design system", memory.designSystem);
  list("User preferences", memory.preferences);
  list("Known bugs", memory.knownBugs);
  list("Previous decisions", memory.decisions.slice(-25).map((d) => d.text));
  list("Notes", memory.notes);
  parts.push(`# Project memory\n${mem.join("\n\n") || "(empty: record goals, architecture and decisions with update_memory as you work)"}`);

  const paths = [...files.keys()];
  parts.push(`# Files (${paths.length})\n${renderTree(paths.slice(0, 600))}${paths.length > 600 ? "\n… (truncated)" : ""}`);

  let report: ValidationReport | undefined;
  if (isRobloxKind(meta.kind)) {
    report = validateRobloxProject(files);
    parts.push(`# Roblox DataModel (from default.project.json)\n${renderHierarchy(report.build.root, { maxDepth: 7, maxNodes: 300 })}`);

    const scripts: string[] = [];
    const remotes: string[] = [];
    const guis: string[] = [];
    const assets: string[] = [];
    walk(report.build.root, (n) => {
      if (n.className === "Script" || n.className === "LocalScript" || n.className === "ModuleScript") {
        scripts.push(`${dottedPath(n.id)} (${n.className}, runs as ${scriptContextOf(n)}) <- ${n.origin?.file ?? "?"}`);
      }
      if (getClass(n.className)?.category === "remote") remotes.push(`${dottedPath(n.id)} (${n.className})`);
      if (n.className === "ScreenGui") guis.push(`${dottedPath(n.id)} <- ${n.origin?.file ?? "?"}`);
      if (n.attributes.GeneratedBy?.t === "string" || (isA(n.className, "Model") && n.id.includes("/Assets/"))) {
        if (n.id.split("/").length <= 4) assets.push(`${dottedPath(n.id)} (${n.className})`);
      }
    });
    parts.push(`# Scripts\n${scripts.join("\n") || "(none)"}`);
    parts.push(`# Remotes\n${remotes.join("\n") || "(none)"}`);
    parts.push(`# UI (ScreenGuis)\n${guis.join("\n") || "(none)"}`);
    parts.push(`# Assets\n${assets.join("\n") || "(none)"}`);
    const s = report.summary;
    const top = report.diagnostics.filter((d) => d.severity !== "info").slice(0, 25);
    parts.push(
      `# Current compatibility check\n${s.error} errors, ${s.warning} warnings, ${s.info} notes` +
        (top.length ? `\n${top.map((d) => `- [${d.severity}] ${d.file ? `${d.file}${d.line ? `:${d.line}` : ""}: ` : ""}${d.message}`).join("\n")}` : ""),
    );
  }

  const deps: string[] = [];
  const pkg = textOf(files, "package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg);
      deps.push(`npm: ${Object.keys({ ...j.dependencies, ...j.devDependencies }).join(", ") || "(none)"}; scripts: ${Object.keys(j.scripts ?? {}).join(", ") || "(none)"}`);
    } catch {
      deps.push("package.json is not valid JSON");
    }
  }
  const wally = textOf(files, "wally.toml");
  if (wally) deps.push(`wally.toml:\n${wally.slice(0, 800)}`);
  if (deps.length) parts.push(`# Dependencies\n${deps.join("\n")}`);

  if (extras.recentRuns?.length) parts.push(`# Recent requests in this project\n${extras.recentRuns.map((r) => `- ${r}`).join("\n")}`);
  if (extras.focus?.file || extras.focus?.instance) {
    parts.push(`# What the user is looking at\n${extras.focus.file ? `Open file: ${extras.focus.file}\n` : ""}${extras.focus.instance ? `Selected instance: ${extras.focus.instance}` : ""}`);
  }
  return { text: parts.join("\n\n"), report };
}
