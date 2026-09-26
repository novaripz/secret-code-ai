// The agent's tools. Each one performs a real action on the project (files
// on disk, commands, validation, asset generation, hierarchy edits,
// snapshots) and returns text the model reads back. Inputs are validated
// with zod before anything runs; destructive tools ask for approval unless
// the run is in autopilot.

import { z } from "zod";
import type { Phase, PlanStep, RunEvent, RunMode } from "@/core/agent/events";
import { runAssetPipeline } from "@/core/assets/pipeline";
import { parseAssetSpec } from "@/core/assets/spec";
import { buildAsset } from "@/core/assets/mesh";
import { inspectMeshFile } from "@/core/assets/gltf";
import { validateAsset, validateMeshInspection } from "@/core/assets/validate";
import type { Diagnostic } from "@/core/diagnostics";
import { analyzeLuau } from "@/core/luau/analyzer";
import { parseLuau } from "@/core/luau/parser";
import { normalizePath, parseJsonWithPosition, type FileMap } from "@/core/project/files";
import type { ProjectMemory, ProjectMeta } from "@/core/project/types";
import { applyHierarchyOps, findNodeByPath, HierarchyEditError, type HierarchyOp } from "@/core/roblox/hierarchyEdit";
import { dottedPath } from "@/core/roblox/instance";
import { parseRbxmx, writeRobloxXml } from "@/core/roblox/rbxmx";
import { applyRepairs, planRepairs } from "@/core/roblox/repair";
import { buildDataModel } from "@/core/roblox/rojo";
import { isRobloxKind } from "@/core/roblox/template";
import { describeLayout } from "@/core/roblox/uiAudit";
import { validateRobloxProject, type ValidationReport } from "@/core/roblox/validate";
import { diffLines } from "@/core/versions/diff";
import { smokeTest } from "../browser";
import { CommandRejected, runCommand } from "../exec";
import * as store from "../store";
import { runProjectTests } from "../testing";
import { renderHierarchy } from "./context";

export interface ToolContext {
  projectId: string;
  branch: string;
  meta: ProjectMeta;
  runId: string;
  mode: RunMode;
  signal: AbortSignal;
  origin?: string;
  toolCallId: string;
  emit(e: RunEvent): void;
  requestApproval(tool: string, description: string, detail?: string): Promise<boolean>;
  setPhase(phase: Phase, detail?: string): void;
  plan: PlanStep[];
  touched: Set<string>;
  state: { lastReport?: ValidationReport; testsPassed?: boolean; finished?: string };
}

export interface ToolResultOut {
  content: string;
  isError?: boolean;
  summary: string;
}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  destructive?: (input: z.infer<S>) => string | undefined;
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolResultOut>;
}

function tool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

const ok = (summary: string, content: string): ToolResultOut => ({ summary, content });
const fail = (summary: string, content?: string): ToolResultOut => ({ summary, content: content ?? summary, isError: true });

function numbered(text: string, start = 1): string {
  return text
    .split("\n")
    .map((l, i) => `${String(i + start).padStart(4)}  ${l}`)
    .join("\n");
}

function formatDiags(diags: Diagnostic[], limit = 40): string {
  if (!diags.length) return "No problems.";
  const shown = diags.slice(0, limit).map((d) => {
    const where = d.file ? `${d.file}${d.line ? `:${d.line}${d.col ? `:${d.col}` : ""}` : ""}` : d.instancePath ? dottedPath(d.instancePath) : "";
    return `[${d.severity}] ${d.rule} ${where}\n    ${d.message}${d.fix ? `\n    auto-fix available: ${d.fix.description}` : ""}`;
  });
  return shown.join("\n") + (diags.length > limit ? `\n… and ${diags.length - limit} more` : "");
}

/** Immediate feedback after a write, so mistakes are caught in the same turn. */
function quickCheck(path: string, content: string, files: FileMap): string {
  if (/\.(luau|lua)$/.test(path)) {
    const parsed = parseLuau(content);
    if (parsed.error) return `\nSYNTAX ERROR at ${path}:${parsed.error.line}:${parsed.error.col}: ${parsed.error.message}`;
    const ctx = /\.server\.(luau|lua)$/.test(path) ? "server" : /\.client\.(luau|lua)$/.test(path) ? "client" : "module";
    const diags = analyzeLuau(content, ctx, path).diagnostics.filter((d) => d.severity !== "info");
    return diags.length ? `\nChecks on this file:\n${formatDiags(diags, 15)}` : "\nParses cleanly; no problems in this file.";
  }
  if (path.endsWith(".json")) {
    const parsed = parseJsonWithPosition(content);
    if (parsed.error) return `\nINVALID JSON at line ${parsed.error.line}: ${parsed.error.message}`;
    if (path.endsWith(".model.json") || path.endsWith(".project.json") || path.endsWith(".meta.json")) {
      const report = validateRobloxProject(files);
      const mine = report.diagnostics.filter((d) => d.file === path && d.severity !== "info");
      return mine.length ? `\nChecks on this file:\n${formatDiags(mine, 15)}` : "\nValid.";
    }
  }
  return "";
}

async function writeAndReport(ctx: ToolContext, path: string, content: string | Uint8Array): Promise<string> {
  let existed = true;
  try {
    await store.readFile(ctx.projectId, ctx.branch, path);
  } catch {
    existed = false;
  }
  const clean = await store.writeFile(ctx.projectId, ctx.branch, path, content);
  ctx.touched.add(clean);
  ctx.emit({ type: "file", path: clean, change: existed ? "modified" : "added" });
  return clean;
}

const LUAU_TARGETS: Record<string, { dir: string; ext: string; context: "server" | "client" | "module" }> = {
  "server-script": { dir: "src/server", ext: ".server.luau", context: "server" },
  "client-script": { dir: "src/client", ext: ".client.luau", context: "client" },
  "shared-module": { dir: "src/shared", ext: ".luau", context: "module" },
  "server-module": { dir: "src/modules", ext: ".luau", context: "module" },
  "client-module": { dir: "src/client", ext: ".luau", context: "module" },
  config: { dir: "src/config", ext: ".luau", context: "module" },
};

const hierarchyOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    parent: z.string().describe("Dotted path of the parent, e.g. StarterGui.HUD.TopBar"),
    className: z.string(),
    name: z.string(),
    properties: z.record(z.string(), z.unknown()).optional().describe("Rojo JSON property values, e.g. {\"Size\": [[0,200],[0,50]], \"Text\": \"Play\"}"),
    children: z.array(z.record(z.string(), z.unknown())).optional().describe("Nested JSON-model children: {Name, ClassName, Properties, Children}"),
  }),
  z.object({ op: z.literal("set"), path: z.string(), properties: z.record(z.string(), z.unknown()).describe("Properties to set; null removes one") }),
  z.object({ op: z.literal("remove"), path: z.string() }),
  z.object({ op: z.literal("rename"), path: z.string(), name: z.string() }),
  z.object({ op: z.literal("move"), path: z.string(), newParent: z.string() }),
]);

export const TOOLS = [
  tool({
    name: "create_plan",
    description:
      "Record the technical plan for this request as an ordered checklist the user sees. Call this first on any non-trivial request, before writing files. Keep steps concrete (\"Server: ShopService validates purchases and updates PlayerData\").",
    schema: z.object({ steps: z.array(z.string().min(3).max(200)).min(1).max(20), architecture: z.string().max(2000).optional().describe("Short architecture summary to remember") }),
    async run(input, ctx) {
      ctx.plan.splice(0, ctx.plan.length, ...input.steps.map((text, i) => ({ text, status: (i === 0 ? "active" : "pending") as PlanStep["status"] })));
      ctx.emit({ type: "plan", steps: [...ctx.plan] });
      if (input.architecture) {
        const mem = await store.getMemory(ctx.projectId);
        mem.decisions.push({ at: Date.now(), text: `Plan: ${input.architecture.slice(0, 480)}` });
        await store.setMemory(ctx.projectId, mem);
      }
      return ok(`Plan with ${input.steps.length} steps`, "Plan recorded. Mark steps done with update_plan as you complete them.");
    },
  }),
  tool({
    name: "update_plan",
    description: "Mark a plan step active, done or skipped (0-based index). Keeps the user's checklist accurate.",
    schema: z.object({ step: z.number().int().min(0), status: z.enum(["active", "done", "skipped"]), note: z.string().max(200).optional() }),
    async run(input, ctx) {
      const s = ctx.plan[input.step];
      if (!s) return fail(`No step ${input.step}`);
      s.status = input.status;
      if (input.status === "done") {
        const next = ctx.plan.find((p) => p.status === "pending");
        if (next && !ctx.plan.some((p) => p.status === "active")) next.status = "active";
      }
      ctx.emit({ type: "plan", steps: [...ctx.plan] });
      return ok(`Step ${input.step + 1} ${input.status}`, "Updated.");
    },
  }),
  tool({
    name: "set_phase",
    description: "Tell the user which build phase you are in. Phases: planning, generating, installing, coding, testing, debugging, optimizing, validating.",
    schema: z.object({
      phase: z.enum(["planning", "generating", "installing", "coding", "testing", "debugging", "optimizing", "validating"]),
      detail: z.string().max(120).optional(),
    }),
    async run(input, ctx) {
      ctx.setPhase(input.phase, input.detail);
      return ok(`${input.phase}${input.detail ? `: ${input.detail}` : ""}`, "ok");
    },
  }),
  tool({
    name: "list_files",
    description: "List project files (optionally under a directory) with sizes.",
    schema: z.object({ dir: z.string().optional() }),
    async run(input, ctx) {
      const files = await store.listFiles(ctx.projectId, ctx.branch);
      const prefix = input.dir ? normalizePath(input.dir) + "/" : "";
      const list = files.filter((f) => f.path.startsWith(prefix));
      return ok(`${list.length} files`, list.map((f) => `${f.path}  ${f.binary ? "(binary) " : ""}${f.size}B`).join("\n") || "(no files)");
    },
  }),
  tool({
    name: "read_file",
    description: "Read a text file with line numbers. Use start/end lines for large files.",
    schema: z.object({ path: z.string(), startLine: z.number().int().min(1).optional(), endLine: z.number().int().min(1).optional() }),
    async run(input, ctx) {
      const f = await store.readFile(ctx.projectId, ctx.branch, input.path);
      if (f.binary) return ok(`${f.path} (binary)`, `${f.path} is binary (${(f.data as Uint8Array).length} bytes). Use inspect_asset for 3D files.`);
      const lines = (f.data as string).split("\n");
      const start = input.startLine ?? 1;
      const end = Math.min(input.endLine ?? Math.min(lines.length, start + 1499), lines.length);
      const body = numbered(lines.slice(start - 1, end).join("\n"), start);
      return ok(`${f.path} (${lines.length} lines)`, `${f.path} lines ${start}-${end} of ${lines.length}:\n${body}`);
    },
  }),
  tool({
    name: "write_file",
    description:
      "Create or overwrite a file with complete contents. Returns immediate checks (Luau syntax/analysis, JSON validity, Roblox model checks) for that file. Prefer edit_file for small changes to existing files.",
    schema: z.object({ path: z.string(), content: z.string() }),
    async run(input, ctx) {
      const path = await writeAndReport(ctx, input.path, input.content);
      const files = await store.readTree(ctx.projectId, ctx.branch);
      return ok(`Wrote ${path}`, `Wrote ${path} (${input.content.split("\n").length} lines).${quickCheck(path, input.content, files)}`);
    },
  }),
  tool({
    name: "edit_file",
    description:
      "Edit a file by exact string replacement. Each `old` must match exactly once (include enough surrounding lines) unless replaceAll is true. Edits apply in order.",
    schema: z.object({
      path: z.string(),
      edits: z.array(z.object({ old: z.string().min(1), new: z.string(), replaceAll: z.boolean().optional() })).min(1).max(30),
    }),
    async run(input, ctx) {
      const f = await store.readFile(ctx.projectId, ctx.branch, input.path);
      if (f.binary) return fail(`${f.path} is binary`);
      let text = f.data as string;
      for (const [i, e] of input.edits.entries()) {
        const count = text.split(e.old).length - 1;
        if (count === 0) return fail(`Edit ${i + 1}: text not found`, `Edit ${i + 1}: the old text was not found in ${f.path}. Read the file again and copy the exact text (whitespace matters).`);
        if (count > 1 && !e.replaceAll) return fail(`Edit ${i + 1}: ambiguous`, `Edit ${i + 1}: the old text matches ${count} places in ${f.path}; include more context or set replaceAll.`);
        text = e.replaceAll ? text.split(e.old).join(e.new) : text.replace(e.old, () => e.new);
      }
      await writeAndReport(ctx, f.path, text);
      const ops = diffLines(f.data as string, text);
      const files = await store.readTree(ctx.projectId, ctx.branch);
      return ok(
        `Edited ${f.path}`,
        `Edited ${f.path}: +${ops.filter((o) => o.kind === "add").length} -${ops.filter((o) => o.kind === "remove").length} lines.${quickCheck(f.path, text, files)}`,
      );
    },
  }),
  tool({
    name: "delete_file",
    description: "Delete a file or directory. Destructive: asks the user unless in autopilot.",
    schema: z.object({ path: z.string(), reason: z.string().max(200) }),
    destructive: (i) => `Delete ${i.path}: ${i.reason}`,
    async run(input, ctx) {
      await store.deleteFile(ctx.projectId, ctx.branch, input.path);
      ctx.touched.add(normalizePath(input.path));
      ctx.emit({ type: "file", path: normalizePath(input.path), change: "deleted" });
      return ok(`Deleted ${input.path}`, `Deleted ${input.path}.`);
    },
  }),
  tool({
    name: "rename_file",
    description: "Rename or move a file.",
    schema: z.object({ from: z.string(), to: z.string() }),
    async run(input, ctx) {
      const to = await store.renameFile(ctx.projectId, ctx.branch, input.from, input.to);
      ctx.touched.add(normalizePath(input.from));
      ctx.touched.add(to);
      ctx.emit({ type: "file", path: normalizePath(input.from), change: "deleted" });
      ctx.emit({ type: "file", path: to, change: "added" });
      return ok(`Moved to ${to}`, `Moved ${input.from} to ${to}.`);
    },
  }),
  tool({
    name: "search_files",
    description: "Search text files for a string or regular expression. Returns matching lines with paths and line numbers.",
    schema: z.object({ query: z.string().min(1), regex: z.boolean().optional(), pathPrefix: z.string().optional() }),
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      let re: RegExp;
      try {
        re = input.regex ? new RegExp(input.query) : new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      } catch (err) {
        return fail("Invalid regex", String(err));
      }
      const hits: string[] = [];
      for (const [p, d] of files) {
        if (typeof d !== "string" || (input.pathPrefix && !p.startsWith(input.pathPrefix))) continue;
        d.split("\n").forEach((line, i) => {
          if (hits.length < 200 && re.test(line)) hits.push(`${p}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
      }
      return ok(`${hits.length} matches`, hits.join("\n") || "No matches.");
    },
  }),
  tool({
    name: "run_command",
    description:
      "Run one allow-listed program in the project directory (node, npm, npx, pnpm, yarn, tsc, rojo, luau, luau-analyze, lune, selene, stylua, wally, rokit). No shell: no pipes, redirects or &&. Output is streamed to the user's terminal.",
    schema: z.object({ command: z.string().min(1).max(500), timeoutSec: z.number().int().min(1).max(600).optional() }),
    async run(input, ctx) {
      try {
        const r = await runCommand(input.command, {
          cwd: store.treeDir(ctx.projectId, ctx.branch),
          timeoutMs: (input.timeoutSec ?? 120) * 1000,
          signal: ctx.signal,
          onOutput: (stream, chunk) => ctx.emit({ type: "output", toolId: ctx.toolCallId, stream, chunk }),
        });
        const out = `$ ${r.command}\nexit ${r.exitCode}${r.timedOut ? " (timed out)" : ""} in ${r.durationMs} ms\n${r.stdout.slice(-6000)}${r.stderr ? `\n[stderr]\n${r.stderr.slice(-4000)}` : ""}`;
        return r.exitCode === 0 ? ok(`exit 0 (${r.durationMs} ms)`, out) : fail(`exit ${r.exitCode}`, out);
      } catch (err) {
        if (err instanceof CommandRejected) return fail("Command rejected", err.message);
        throw err;
      }
    },
  }),
  tool({
    name: "install_dependency",
    description: "Install npm packages into the project (web apps / tooling). For Roblox packages, add them to wally.toml and run `wally install` with run_command.",
    schema: z.object({ packages: z.array(z.string().regex(/^(@[\w.-]+\/)?[\w.-]+(@[\w.^~<>=*-]+)?$/, "invalid package name")).min(1).max(20), dev: z.boolean().optional() }),
    async run(input, ctx) {
      ctx.setPhase("installing", input.packages.join(", "));
      try {
        const r = await runCommand(`npm install --no-audit --no-fund ${input.dev ? "--save-dev " : ""}${input.packages.join(" ")}`, {
          cwd: store.treeDir(ctx.projectId, ctx.branch),
          timeoutMs: 300_000,
          signal: ctx.signal,
          onOutput: (stream, chunk) => ctx.emit({ type: "output", toolId: ctx.toolCallId, stream, chunk }),
        });
        ctx.touched.add("package.json");
        ctx.emit({ type: "file", path: "package.json", change: "modified" });
        const out = `${r.stdout.slice(-3000)}\n${r.stderr.slice(-3000)}`;
        return r.exitCode === 0 ? ok(`Installed ${input.packages.join(", ")}`, out) : fail(`npm install failed (exit ${r.exitCode})`, out);
      } catch (err) {
        if (err instanceof CommandRejected) return fail("Install rejected", err.message);
        throw err;
      }
    },
  }),
  tool({
    name: "run_tests",
    description:
      "Run every check that can actually execute here: for Roblox projects, Luau parsing, the full compatibility check, a place-export round trip, and rojo/selene if installed; for web apps, npm install/test, JS syntax, HTML references and a headless-browser load. Reports each case as pass/fail/warn/skip.",
    schema: z.object({}),
    async run(_input, ctx) {
      ctx.setPhase("testing");
      const r = await runProjectTests(ctx.projectId, ctx.branch, {
        origin: ctx.origin,
        signal: ctx.signal,
        onOutput: (chunk) => ctx.emit({ type: "output", toolId: ctx.toolCallId, stream: "stdout", chunk }),
      });
      ctx.state.testsPassed = r.failed === 0;
      const lines = r.cases.map((c) => `${c.status.toUpperCase().padEnd(4)} ${c.name}${c.detail ? `\n       ${c.detail.split("\n").join("\n       ")}` : ""}`);
      const diag = r.diagnostics ? `\n\nFindings:\n${formatDiags(r.diagnostics.filter((d) => d.severity !== "info"))}` : "";
      return (r.failed ? fail : ok)(`${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped`, `${lines.join("\n")}${diag}`);
    },
  }),
  tool({
    name: "inspect_errors",
    description: "Collect every current problem: Roblox compatibility findings with auto-fix availability, or for web apps a test run. Use this when debugging.",
    schema: z.object({ includeInfo: z.boolean().optional() }),
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      if (!isRobloxKind(ctx.meta.kind)) {
        const r = await runProjectTests(ctx.projectId, ctx.branch, { origin: ctx.origin, signal: ctx.signal });
        const failing = r.cases.filter((c) => c.status === "fail");
        return ok(`${failing.length} failing checks`, failing.map((c) => `${c.name}\n${c.detail ?? ""}`).join("\n\n") || "No failing checks.");
      }
      const report = validateRobloxProject(files);
      ctx.state.lastReport = report;
      const diags = input.includeInfo ? report.diagnostics : report.diagnostics.filter((d) => d.severity !== "info");
      return ok(`${report.summary.error} errors, ${report.summary.warning} warnings`, formatDiags(diags, 60));
    },
  }),
  tool({
    name: "validate_roblox_project",
    description:
      "Run the full Roblox compatibility check: Rojo mapping, Luau syntax and analysis in each script's real context, client/server boundary, remotes and remote security, hierarchy rules, references (requires, WaitForChild), properties, names, UI at phone/tablet/desktop sizes, and asset ids.",
    schema: z.object({}),
    async run(_input, ctx) {
      ctx.setPhase("validating", "Roblox compatibility check");
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const report = validateRobloxProject(files);
      ctx.state.lastReport = report;
      ctx.emit({
        type: "checks",
        errors: report.summary.error,
        warnings: report.summary.warning,
        infos: report.summary.info,
        groups: report.checks.map((c) => ({ id: c.id, label: c.label, status: c.status })),
      });
      const groups = report.checks.map((c) => `${c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✕"} ${c.label}${c.errors || c.warnings ? ` (${c.errors} errors, ${c.warnings} warnings)` : ""}`);
      const fixable = report.diagnostics.filter((d) => d.fix).length;
      return (report.summary.error ? fail : ok)(
        `${report.summary.error} errors, ${report.summary.warning} warnings`,
        `${groups.join("\n")}\n\n${formatDiags(report.diagnostics.filter((d) => d.severity !== "info"), 60)}${fixable ? `\n\n${fixable} finding(s) can be fixed automatically with repair_project.` : ""}`,
      );
    },
  }),
  tool({
    name: "repair_project",
    description: "Apply every safe automatic repair (deprecated APIs, misspelt services, scripts in places they never run, missing remote declarations, invalid properties), then re-validate.",
    schema: z.object({}),
    async run(_input, ctx) {
      ctx.setPhase("debugging", "auto-repair");
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const report = validateRobloxProject(files);
      const plan = planRepairs(files, report);
      if (!plan.length) return ok("Nothing to auto-repair", "No automatic repairs apply; remaining findings need code changes.");
      const res = applyRepairs(files, plan);
      const changed = await store.applyFileMap(ctx.projectId, ctx.branch, res.files);
      for (const p of changed) {
        ctx.touched.add(p);
        ctx.emit({ type: "file", path: p, change: res.files.has(p) ? (files.has(p) ? "modified" : "added") : "deleted" });
      }
      const after = validateRobloxProject(res.files);
      ctx.state.lastReport = after;
      return ok(
        `Applied ${res.applied.length} repairs`,
        `Applied:\n${res.applied.map((a) => `- ${a.description}`).join("\n")}${res.failed.length ? `\nFailed:\n${res.failed.map((f) => `- ${f.action.description}: ${f.reason}`).join("\n")}` : ""}\n\nAfter repair: ${after.summary.error} errors, ${after.summary.warning} warnings.\n${formatDiags(after.diagnostics.filter((d) => d.severity !== "info"), 30)}`,
      );
    },
  }),
  tool({
    name: "generate_luau",
    description:
      "Write a Luau script or module to the correct place in the Roblox hierarchy for its role, then analyze it in that role's context. Roles: server-script (ServerScriptService), client-script (StarterPlayerScripts), shared-module (ReplicatedStorage.Shared: code both sides use), server-module (ServerStorage.Modules: data, economy, anything secret), client-module (client controllers), config (ReplicatedStorage.Config). Provide the complete source.",
    schema: z.object({
      role: z.enum(["server-script", "client-script", "shared-module", "server-module", "client-module", "config"]),
      name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
      source: z.string().min(1),
      subfolder: z.string().regex(/^[A-Za-z0-9_/-]{1,80}$/).optional(),
    }),
    async run(input, ctx) {
      ctx.setPhase("coding", `${input.name} (${input.role})`);
      const t = LUAU_TARGETS[input.role];
      const path = `${t.dir}${input.subfolder ? `/${input.subfolder}` : ""}/${input.name}${t.ext}`;
      const parsed = parseLuau(input.source);
      await writeAndReport(ctx, path, input.source);
      if (parsed.error) return fail(`Syntax error in ${path}`, `Wrote ${path}, but it has a SYNTAX ERROR at line ${parsed.error.line}:${parsed.error.col}: ${parsed.error.message}. Fix it with edit_file.`);
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const report = validateRobloxProject(files);
      const mine = report.diagnostics.filter((d) => d.file === path && d.severity !== "info");
      const b = buildDataModel(files);
      const nodeId = b.nodesByFile.get(path)?.[0];
      const where = nodeId ? dottedPath(nodeId) : "(not mapped by default.project.json!)";
      return ok(`${path} -> ${where}`, `Wrote ${path}; in Studio it is ${where}, running as ${t.context}.\n${mine.length ? formatDiags(mine) : "No problems found in this script."}`);
    },
  }),
  tool({
    name: "get_roblox_hierarchy",
    description: "Show the Roblox instance tree the project produces (as Rojo would build it), optionally from a subtree and with key properties.",
    schema: z.object({ root: z.string().optional().describe("Dotted path like StarterGui.HUD"), depth: z.number().int().min(1).max(20).optional(), properties: z.boolean().optional() }),
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const b = buildDataModel(files);
      const node = input.root ? findNodeByPath(b.root, input.root) : b.root;
      if (!node) return fail(`No instance at ${input.root}`);
      return ok(`Hierarchy of ${input.root ?? "game"}`, renderHierarchy(node, { maxDepth: input.depth ?? 10, properties: input.properties, maxNodes: 600 }));
    },
  }),
  tool({
    name: "modify_roblox_hierarchy",
    description:
      "Add, change, rename, move or remove Roblox instances. Edits are written into the files that define them (.model.json, default.project.json, meta files, script files). Property values use Rojo's JSON format: Vector3 [x,y,z], Color3 [r,g,b] with 0-1 floats, UDim2 [[xScale,xOffset],[yScale,yOffset]], UDim [scale,offset], enums by item name (\"Neon\"), fonts {\"Font\":{\"family\":\"rbxasset://fonts/families/BuilderSans.json\",\"weight\":\"Bold\",\"style\":\"Normal\"}}. Each property is checked against the class.",
    schema: z.object({ ops: z.array(hierarchyOpSchema).min(1).max(50) }),
    destructive: (i) => {
      const removals = i.ops.filter((o) => o.op === "remove").map((o) => (o as { path: string }).path);
      return removals.length ? `Remove ${removals.join(", ")}` : undefined;
    },
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      let res;
      try {
        res = applyHierarchyOps(files, input.ops as HierarchyOp[]);
      } catch (err) {
        if (err instanceof HierarchyEditError || (err instanceof Error && err.name === "Error")) return fail("Hierarchy edit rejected", err instanceof Error ? err.message : String(err));
        throw err;
      }
      const changed = await store.applyFileMap(ctx.projectId, ctx.branch, res.files);
      for (const p of changed) {
        ctx.touched.add(p);
        ctx.emit({ type: "file", path: p, change: res.files.has(p) ? (files.has(p) ? "modified" : "added") : "deleted" });
      }
      const report = validateRobloxProject(res.files);
      const mine = report.diagnostics.filter((d) => d.file && changed.includes(d.file) && d.severity !== "info");
      return ok(`${input.ops.length} hierarchy edit(s)`, `${res.summary}\nFiles changed: ${changed.join(", ")}\n${mine.length ? formatDiags(mine) : "No problems in the changed files."}`);
    },
  }),
  tool({
    name: "create_asset",
    description:
      "Generate a 3D asset from a spec of Roblox primitive parts and run the full asset pipeline: inspect, optimize, validate, textures, package a Roblox model (src/assets, synced to ReplicatedStorage.Assets, PrimaryPart set, welded if unanchored), metadata, and glTF/GLB/OBJ source exports. Units are studs; +Y up; the asset faces -Z; position is each part's centre; rotation is Roblox Orientation degrees. A player is ~5.5 studs tall. Cylinders run along X (size [length, diameter, diameter]).",
    schema: z.object({
      spec: z.record(z.string(), z.unknown()).describe("{name, category, description?, front?, modular?, parts: [{name, shape: block|cylinder|sphere|wedge|cornerwedge, size:[x,y,z], position:[x,y,z], rotation?:[x,y,z], color:\"#rrggbb\", material: Roblox material name, transparency?, anchored?, canCollide?, group?, texture?: {pattern: planks|bricks|checker|stripes|noise|tiles}, effects?: [{type: PointLight|SpotLight|SurfaceLight|ParticleEmitter, ...}]}]}"),
      formats: z.array(z.enum(["glb", "gltf", "obj"])).optional(),
    }),
    async run(input, ctx) {
      ctx.setPhase("generating", "3D asset");
      const r = runAssetPipeline(input.spec, { formats: input.formats ?? ctx.meta.settings.assetFormats ?? ["glb"], units: ctx.meta.settings.assetUnits ?? "studs" });
      const steps = r.steps.map((s) => `${s.ok ? "✓" : "✕"} ${s.step}: ${s.detail}`).join("\n");
      if (!r.ok) return fail("Asset pipeline failed", `${steps}\n\n${formatDiags(r.diagnostics)}`);
      for (const [p, data] of Object.entries(r.files)) await writeAndReport(ctx, p, data);
      return ok(
        `${r.spec!.name}: ${r.stats!.parts} parts, ${r.stats!.triangles} tris`,
        `${steps}\n\nFiles:\n${Object.keys(r.files).map((f) => `- ${f}`).join("\n")}\n\nIn game: ${r.robloxPath} (clone it from scripts).\n${r.diagnostics.length ? `\nFindings:\n${formatDiags(r.diagnostics)}` : ""}`,
      );
    },
  }),
  tool({
    name: "inspect_asset",
    description: "Inspect an asset file: a spec (assets/specs/*.spec.json), a Roblox model (.model.json/.rbxmx), or a 3D file (.glb/.gltf/.obj/.fbx) — structure, size, triangle count, materials, textures, missing references.",
    schema: z.object({ path: z.string() }),
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const p = normalizePath(input.path);
      const data = files.get(p);
      if (data === undefined) return fail(`${p} does not exist`);
      if (p.endsWith(".spec.json")) {
        const parsed = parseAssetSpec(JSON.parse(data as string));
        if (!parsed.spec) return fail("Invalid spec", parsed.errors.join("\n"));
        const built = buildAsset(parsed.spec);
        const size = built.bounds.max.map((m, i) => (m - built.bounds.min[i]).toFixed(2));
        return ok(`${parsed.spec.name}`, `${parsed.spec.name} (${parsed.spec.category}): ${parsed.spec.parts.length} parts, ${built.triangles} triangles, ${size.join(" × ")} studs.\nParts:\n${parsed.spec.parts.map((x) => `- ${x.group ? `${x.group}/` : ""}${x.name} ${x.shape} ${x.size.join("×")} @ ${x.position.join(",")} ${x.material} ${x.color}`).join("\n")}`);
      }
      if (p.endsWith(".model.json") || p.endsWith(".rbxmx")) {
        const b = buildDataModel(files);
        const id = b.nodesByFile.get(p)?.[0];
        const node = id ? [...(function* all(n): Generator<typeof b.root> { yield n; for (const c of n.children) yield* all(c); })(b.root)].find((n) => n.id === id) : undefined;
        if (!node) {
          if (p.endsWith(".rbxmx")) {
            const r = parseRbxmx(typeof data === "string" ? data : new TextDecoder().decode(data));
            return r.error ? fail(r.error) : ok("rbxmx", r.roots.map((n) => renderHierarchy(n, { properties: true })).join("\n"));
          }
          return fail(`${p} is not mapped into the DataModel by default.project.json`);
        }
        return ok(`${dottedPath(node.id)}`, `${dottedPath(node.id)}:\n${renderHierarchy(node, { properties: true, maxNodes: 300 })}`);
      }
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const r = inspectMeshFile(p, bytes);
      return (r.ok ? ok : fail)(`${r.format}: ${r.triangles} tris`, JSON.stringify({ ...r, notes: r.notes }, null, 2));
    },
  }),
  tool({
    name: "validate_asset",
    description: "Validate an asset for Roblox: spec checks (scale for its category, orientation, pivot, duplicate/tiny parts, part count) or 3D file checks (triangle limit, missing textures, units).",
    schema: z.object({ path: z.string() }),
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const p = normalizePath(input.path);
      const data = files.get(p);
      if (data === undefined) return fail(`${p} does not exist`);
      let diags: Diagnostic[];
      if (p.endsWith(".spec.json")) {
        const parsed = parseAssetSpec(JSON.parse(data as string));
        if (!parsed.spec) return fail("Invalid spec", parsed.errors.join("\n"));
        diags = validateAsset(parsed.spec, buildAsset(parsed.spec), p);
      } else {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        diags = validateMeshInspection(p, inspectMeshFile(p, bytes), new Set(files.keys()));
      }
      const errors = diags.filter((d) => d.severity === "error").length;
      return (errors ? fail : ok)(`${errors} errors, ${diags.length - errors} other findings`, formatDiags(diags));
    },
  }),
  tool({
    name: "preview_project",
    description:
      "See what the project looks like. Roblox: every ScreenGui laid out at phone and desktop sizes (positions and sizes of each element) plus a Workspace summary. Web: loads the app in a headless browser and reports errors.",
    schema: z.object({ gui: z.string().optional().describe("Only this ScreenGui (name)") }),
    async run(input, ctx) {
      const files = await store.readTree(ctx.projectId, ctx.branch);
      if (!isRobloxKind(ctx.meta.kind)) {
        if (!ctx.origin) return fail("Preview unavailable", "Server origin unknown; the user can see the preview panel.");
        const r = await smokeTest(`${ctx.origin}/api/projects/${ctx.projectId}/preview/~${encodeURIComponent(ctx.branch)}/index.html`);
        if (!r.ran) return ok("Browser preview skipped", r.reason ?? "skipped");
        const problems = [...r.pageErrors, ...r.consoleErrors, ...r.failedRequests];
        return (problems.length ? fail : ok)(`Loaded "${r.title}"`, problems.length ? `Errors:\n${problems.join("\n")}` : `Loaded "${r.title}" with no console errors.`);
      }
      const b = buildDataModel(files);
      const sg = b.root.children.find((c) => c.className === "StarterGui");
      const guis = (sg?.children ?? []).filter((g) => g.className === "ScreenGui" && (!input.gui || g.name === input.gui));
      const parts: string[] = [];
      for (const g of guis) {
        parts.push(describeLayout(g, { w: 1280, h: 720 }));
        parts.push(describeLayout(g, { w: 844, h: 390 }));
      }
      const ws = b.root.children.find((c) => c.className === "Workspace");
      let partCount = 0;
      if (ws) {
        const count = (n: typeof ws): number => n.children.reduce((a, c) => a + count(c), /Part$/.test(n.className) ? 1 : 0);
        partCount = count(ws);
      }
      parts.push(`Workspace: ${partCount} parts. The user's 3D viewport renders them.`);
      return ok(`${guis.length} ScreenGui(s)`, parts.join("\n\n") || "No ScreenGuis.");
    },
  }),
  tool({
    name: "export_project",
    description: "Build an export into build/: a Roblox place (.rbxlx) of the whole project, or a model (.rbxmx) of one instance subtree. Reports instance counts and any export warnings. The user downloads exports from the Export panel.",
    schema: z.object({ format: z.enum(["rbxlx", "rbxmx"]), instance: z.string().optional().describe("For rbxmx: dotted path of the root instance") }),
    async run(input, ctx) {
      ctx.setPhase("validating", `export ${input.format}`);
      const files = await store.readTree(ctx.projectId, ctx.branch);
      const b = buildDataModel(files);
      const root = input.format === "rbxmx" ? (input.instance ? findNodeByPath(b.root, input.instance) : b.root.className === "DataModel" ? undefined : b.root) : b.root;
      if (!root) return fail("Choose the instance to export as a model", "rbxmx needs `instance` (e.g. ReplicatedStorage.Assets.OakTable).");
      const out = writeRobloxXml(root, { place: input.format === "rbxlx" && root.className === "DataModel" });
      const name = `${input.format === "rbxlx" ? ctx.meta.name.replace(/[^\w-]+/g, "") || "Place" : root.name}.${input.format}`;
      await writeAndReport(ctx, `build/${name}`, out.xml);
      return ok(`build/${name}`, `Wrote build/${name}: ${out.instanceCount} instances, ${(out.xml.length / 1024).toFixed(1)} KB.${out.warnings.length ? `\nWarnings:\n${out.warnings.join("\n")}` : ""}`);
    },
  }),
  tool({
    name: "create_snapshot",
    description: "Save a named restore point of the current branch.",
    schema: z.object({ label: z.string().min(1).max(120) }),
    async run(input, ctx) {
      const s = await store.createSnapshot(ctx.projectId, ctx.branch, { label: input.label, reason: "manual", runId: ctx.runId });
      ctx.emit({ type: "snapshot", id: s.id, label: s.label });
      return ok(`Snapshot ${s.id}`, `Saved snapshot ${s.id} "${s.label}" (${s.fileCount} files).`);
    },
  }),
  tool({
    name: "list_snapshots",
    description: "List restore points of the current branch, newest first.",
    schema: z.object({}),
    async run(_i, ctx) {
      const list = await store.listSnapshots(ctx.projectId, ctx.branch);
      return ok(`${list.length} snapshots`, list.slice(0, 30).map((s) => `${s.id}  ${new Date(s.createdAt).toISOString()}  ${s.label} (${s.reason})`).join("\n"));
    },
  }),
  tool({
    name: "restore_snapshot",
    description: "Restore the branch to a snapshot. The current state is saved first, so this can be undone. Destructive: asks the user unless in autopilot.",
    schema: z.object({ snapshotId: z.string(), reason: z.string().max(200) }),
    destructive: (i) => `Restore snapshot ${i.snapshotId}: ${i.reason}`,
    async run(input, ctx) {
      const r = await store.restoreSnapshot(ctx.projectId, ctx.branch, input.snapshotId);
      for (const p of r.changed) {
        ctx.touched.add(p);
        ctx.emit({ type: "file", path: p, change: "modified" });
      }
      return ok(`Restored ${input.snapshotId}`, `Restored. ${r.changed.length} files changed. The previous state is snapshot ${r.before.id}.`);
    },
  }),
  tool({
    name: "update_memory",
    description:
      "Update the project's long-term memory, which you receive at the start of every future request: goals, architecture, design system (colours, fonts, radii, spacing), user preferences, decisions (with reasons), known bugs, notes. Record decisions as you make them; remove entries that are no longer true.",
    schema: z.object({
      add: z
        .object({
          goals: z.array(z.string()).optional(),
          architecture: z.array(z.string()).optional(),
          designSystem: z.array(z.string()).optional(),
          preferences: z.array(z.string()).optional(),
          decisions: z.array(z.string()).optional(),
          knownBugs: z.array(z.string()).optional(),
          notes: z.array(z.string()).optional(),
        })
        .optional(),
      remove: z
        .object({
          goals: z.array(z.string()).optional(),
          architecture: z.array(z.string()).optional(),
          designSystem: z.array(z.string()).optional(),
          preferences: z.array(z.string()).optional(),
          knownBugs: z.array(z.string()).optional(),
          notes: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Exact entries to delete (e.g. fixed bugs)"),
    }),
    async run(input, ctx) {
      const mem = await store.getMemory(ctx.projectId);
      const add = input.add ?? {};
      const rm = input.remove ?? {};
      const keys = ["goals", "architecture", "designSystem", "preferences", "knownBugs", "notes"] as const;
      for (const k of keys) {
        const removals = new Set(rm[k] ?? []);
        mem[k] = [...mem[k].filter((x) => !removals.has(x)), ...(add[k] ?? []).filter((x) => !mem[k].includes(x))];
      }
      for (const d of add.decisions ?? []) mem.decisions.push({ at: Date.now(), text: d });
      const saved: ProjectMemory = await store.setMemory(ctx.projectId, mem);
      return ok("Memory updated", `Memory now has ${saved.goals.length} goals, ${saved.architecture.length} architecture notes, ${saved.decisions.length} decisions, ${saved.knownBugs.length} known bugs.`);
    },
  }),
  tool({
    name: "finish",
    description:
      "Declare the request complete with a short summary for the user of what was built, how to use it, and anything that could not be verified here. Automatic verification runs after this; if it finds errors you will be asked to fix them.",
    schema: z.object({ summary: z.string().min(1).max(4000) }),
    async run(input, ctx) {
      ctx.state.finished = input.summary;
      return ok("Finished", "Summary recorded. Final verification will run now.");
    },
  }),
];

export type AnyTool = (typeof TOOLS)[number];

export function toolByName(name: string): AnyTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toolSpecs(): { name: string; description: string; inputSchema: Record<string, unknown> }[] {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, inputSchema: schema };
  });
}

export function describeToolCall(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "write_file":
    case "edit_file":
    case "read_file":
    case "delete_file":
    case "inspect_asset":
    case "validate_asset":
      return `${name.replace("_", " ")} ${String(i.path ?? "")}`;
    case "generate_luau":
      return `generating Luau: ${String(i.name ?? "")} (${String(i.role ?? "")})`;
    case "run_command":
      return `$ ${String(i.command ?? "")}`;
    case "install_dependency":
      return `installing ${(i.packages as string[] | undefined)?.join(", ") ?? ""}`;
    case "create_asset":
      return `creating asset ${String((i.spec as { name?: string } | undefined)?.name ?? "")}`;
    case "modify_roblox_hierarchy":
      return `editing hierarchy (${(i.ops as unknown[] | undefined)?.length ?? 0} ops)`;
    case "search_files":
      return `searching "${String(i.query ?? "")}"`;
    default:
      return name.replace(/_/g, " ");
  }
}
