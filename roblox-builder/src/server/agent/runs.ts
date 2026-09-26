// Agent runs: the registry the API talks to, and the loop that drives a model
// through the tools until the request is done and verified.
//
// The loop does not take the model's word for "done". When the model stops
// (or calls finish) after changing files, the harness runs the real checks
// itself: the Roblox compatibility check (after applying safe auto-repairs)
// or the web test suite. Errors go back to the model as a new message and the
// loop continues, up to a bounded number of repair rounds. Only then is the
// run complete, and the user is told exactly what did and did not pass.

import { z } from "zod";
import type { IndexedEvent, Phase, PlanStep, RunEvent, RunMode, RunStatus, RunSummary } from "@/core/agent/events";
import { isRobloxKind } from "@/core/roblox/template";
import { applyRepairs, planRepairs } from "@/core/roblox/repair";
import { validateRobloxProject } from "@/core/roblox/validate";
import { compareFileSets } from "@/core/versions/diff";
import * as store from "../store";
import { runProjectTests } from "../testing";
import { buildProjectContext } from "./context";
import { SYSTEM_PROMPT } from "./prompt";
import { getProvider } from "./providers";
import { ProviderError, type AgentMessage, type Provider, type ToolResult } from "./providers/types";
import { describeToolCall, toolByName, toolSpecs, type ToolContext } from "./tools";

const MAX_TURNS: Record<RunMode, number> = { chat: 50, autopilot: 90 };
const MAX_REPAIR_ROUNDS: Record<RunMode, number> = { chat: 2, autopilot: 4 };
const MAX_OUTPUT_TOKENS_PER_RUN = 600_000;
const EVENT_LIMIT = 20_000;

interface PendingApproval {
  id: string;
  tool: string;
  description: string;
  resolve: (approved: boolean) => void;
}

export class Run {
  readonly events: IndexedEvent[] = [];
  readonly listeners = new Set<(e: IndexedEvent) => void>();
  readonly abort = new AbortController();
  readonly approvals = new Map<string, PendingApproval>();
  readonly summary: RunSummary;

  constructor(init: Omit<RunSummary, "status" | "startedAt" | "phase" | "changedFiles" | "usage">) {
    this.summary = { ...init, status: "running", startedAt: Date.now(), phase: "planning", changedFiles: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }

  get id() {
    return this.summary.runId;
  }

  emit(event: RunEvent): void {
    const indexed: IndexedEvent = { seq: this.events.length, at: Date.now(), event };
    if (this.events.length < EVENT_LIMIT || event.type !== "text") this.events.push(indexed);
    if (event.type === "phase") this.summary.phase = event.phase;
    for (const l of this.listeners) {
      try {
        l(indexed);
      } catch {
        /* a dead listener must not break the run */
      }
    }
  }

  setStatus(status: RunStatus, message?: string): void {
    this.summary.status = status;
    this.emit({ type: "run", status, runId: this.id, mode: this.summary.mode, prompt: this.summary.prompt, branch: this.summary.branch, provider: this.summary.provider, model: this.summary.model, message });
  }
}

// Survive dev-server hot reloads.
const g = globalThis as unknown as { __rbRuns?: Map<string, Run> };
const runs: Map<string, Run> = (g.__rbRuns ??= new Map());

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export function listRuns(projectId: string): RunSummary[] {
  return [...runs.values()].filter((r) => r.summary.projectId === projectId).map((r) => r.summary).sort((a, b) => b.startedAt - a.startedAt);
}

export function activeRun(projectId: string, branch: string): Run | undefined {
  return [...runs.values()].find(
    (r) => r.summary.projectId === projectId && r.summary.branch === branch && (r.summary.status === "running" || r.summary.status === "waiting-approval"),
  );
}

export function resolveApproval(runId: string, approvalId: string, approved: boolean): boolean {
  const run = runs.get(runId);
  const pending = run?.approvals.get(approvalId);
  if (!run || !pending) return false;
  run.approvals.delete(approvalId);
  pending.resolve(approved);
  run.emit({ type: "approval-resolved", id: approvalId, approved });
  if (run.approvals.size === 0 && run.summary.status === "waiting-approval") {
    run.summary.status = "running";
  }
  return true;
}

export function cancelRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run) return false;
  run.abort.abort();
  for (const [id, a] of run.approvals) {
    a.resolve(false);
    run.approvals.delete(id);
  }
  return true;
}

export interface StartRunOptions {
  projectId: string;
  branch: string;
  prompt: string;
  mode: RunMode;
  origin?: string;
  focus?: { file?: string; instance?: string };
  forgeBatch?: string;
  label?: string;
  provider?: string;
  /** In-process callers only (tests): use this provider instead of the configured one. */
  providerOverride?: Provider;
}

export async function startRun(opts: StartRunOptions): Promise<Run> {
  const existing = activeRun(opts.projectId, opts.branch);
  if (existing) throw new store.StoreError("An agent run is already working on this branch; wait for it or cancel it", 409);
  await store.getProject(opts.projectId);
  const run = new Run({
    runId: store.newId("r"),
    projectId: opts.projectId,
    branch: opts.branch,
    mode: opts.mode,
    prompt: opts.prompt,
    forgeBatch: opts.forgeBatch,
    label: opts.label,
  });
  runs.set(run.id, run);
  // Old finished runs are only kept in memory for a while; the record is on disk.
  for (const [id, r] of runs) {
    if (r.summary.endedAt && Date.now() - r.summary.endedAt > 6 * 3600_000) runs.delete(id);
  }
  void execute(run, opts).catch((err) => {
    run.emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
    run.summary.endedAt = Date.now();
    run.setStatus("failed", err instanceof Error ? err.message : String(err));
  });
  return run;
}

function activityId(): string {
  return store.newId("a");
}

async function execute(run: Run, opts: StartRunOptions): Promise<void> {
  const { projectId, branch, mode } = run.summary;
  const signal = run.abort.signal;
  let provider: Provider;
  try {
    provider = opts.providerOverride ?? getProvider(opts.provider);
  } catch (err) {
    run.summary.endedAt = Date.now();
    run.setStatus("failed", err instanceof Error ? err.message : String(err));
    return;
  }
  run.summary.provider = provider.label;
  run.summary.model = provider.model;
  run.setStatus("running");

  await store.appendChat(projectId, branch, { role: "user", text: opts.prompt, runId: run.id });

  const setPhase = (phase: Phase, detail?: string) => {
    if (run.summary.phase === phase && !detail) return;
    run.emit({ type: "phase", phase, detail });
  };
  const activity = (label: string) => {
    const id = activityId();
    run.emit({ type: "activity", id, label, status: "running" });
    return {
      done: (detail?: string) => run.emit({ type: "activity", id, label, status: "done", detail }),
      error: (detail?: string) => run.emit({ type: "activity", id, label, status: "error", detail }),
    };
  };

  setPhase("planning");
  const a0 = activity("Analyzing request");
  const start = await store.createSnapshot(projectId, branch, { label: `Before: ${opts.prompt.slice(0, 80)}`, reason: "agent-start", runId: run.id, force: true });
  run.summary.startSnapshot = start.id;
  run.emit({ type: "snapshot", id: start.id, label: start.label });

  const meta = await store.getProject(projectId);
  const metaForBranch = { ...meta, activeBranch: branch };
  const memory = await store.getMemory(projectId);
  const files = await store.readTree(projectId, branch);
  const history = (await store.getChat(projectId, branch)).slice(-13, -1);
  const recentRuns = history.map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text.slice(0, 400)}`);
  const context = buildProjectContext(metaForBranch, memory, files, { recentRuns, focus: opts.focus });
  a0.done(`${files.size} files${context.report ? `, ${context.report.stats.instances} instances` : ""}`);

  const messages: AgentMessage[] = [
    {
      role: "user",
      content:
        `${context.text}\n\n# Mode\n${mode === "autopilot" ? "AUTOPILOT: work fully autonomously through plan, build, test, fix and polish until the result works; destructive tools are pre-approved." : "INTERACTIVE: the user is watching; destructive tools ask for approval. Answer questions directly without changing files when no change is requested."}\n\n# Request\n${opts.prompt}`,
    },
  ];

  const plan: PlanStep[] = [];
  const touched = new Set<string>();
  const state: ToolContext["state"] = {};
  const tools = toolSpecs();
  let finalText = "";
  let repairRounds = 0;
  let warningRoundDone = false;
  let malformedRetries = 0;

  const requestApproval = async (toolName: string, description: string, detail?: string): Promise<boolean> => {
    if (mode === "autopilot" || meta.settings.autoApproveDestructive) return true;
    const id = store.newId("p");
    run.summary.status = "waiting-approval";
    run.emit({ type: "approval", id, tool: toolName, description, detail });
    return new Promise<boolean>((resolve) => run.approvals.set(id, { id, tool: toolName, description, resolve }));
  };

  let turns = 0;
  outer: while (!signal.aborted) {
    if (turns++ >= MAX_TURNS[mode]) {
      run.emit({ type: "error", message: `Stopped after ${MAX_TURNS[mode]} model turns without finishing` });
      break;
    }
    if (run.summary.usage.outputTokens > MAX_OUTPUT_TOKENS_PER_RUN) {
      run.emit({ type: "error", message: "Stopped: this run reached its token budget" });
      break;
    }

    let result;
    let attempt = 0;
    for (;;) {
      try {
        result = await provider.turn({
          system: SYSTEM_PROMPT,
          messages,
          tools,
          signal,
          onText: (delta) => run.emit({ type: "text", delta }),
          onReasoning: (delta) => run.emit({ type: "reasoning", delta }),
        });
        break;
      } catch (err) {
        if (signal.aborted) break outer;
        const pe = err instanceof ProviderError ? err : new ProviderError(String(err), "other");
        const retryable = pe.kind === "rate-limit" || pe.kind === "overloaded" || pe.kind === "network" || (pe.kind === "other" && pe.message.startsWith("Malformed") && malformedRetries++ < 2);
        if (!retryable || attempt++ >= 4) throw pe;
        const wait = Math.min(pe.retryAfterMs ?? 2000 * 2 ** attempt, 60_000);
        run.emit({ type: "activity", id: activityId(), label: `${pe.message} Retrying in ${Math.round(wait / 1000)}s`, status: "error" });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    if (!result) break;
    if (result.usage) {
      run.summary.usage.inputTokens += result.usage.inputTokens;
      run.summary.usage.outputTokens += result.usage.outputTokens;
      run.emit({ type: "usage", inputTokens: run.summary.usage.inputTokens, outputTokens: run.summary.usage.outputTokens });
    }
    messages.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls, raw: result.raw, provider: provider.id });
    run.emit({ type: "turn-end", text: result.text });
    if (result.text.trim()) finalText = result.text.trim();

    if (result.stopReason === "refusal") {
      run.emit({ type: "error", message: "The model declined this request." });
      break;
    }

    const results: ToolResult[] = [];
    for (const bad of result.invalidToolInputs ?? []) {
      results.push({ id: bad.id, name: bad.name, isError: true, content: JSON.stringify({ INVALID_JSON: bad.raw.slice(0, 2000) }) });
    }

    if (result.stopReason === "max_tokens" && result.toolCalls.length) {
      // A tool input cut off mid-way must never run.
      for (const c of result.toolCalls) {
        results.push({ id: c.id, name: c.name, isError: true, content: "Your output hit the length limit and this call was cut off, so it was not run. Split large files into several smaller write_file/edit_file calls." });
      }
      messages.push({ role: "tool", results });
      continue;
    }

    for (const call of result.toolCalls) {
      if (signal.aborted) break outer;
      const def = toolByName(call.name);
      const label = describeToolCall(call.name, call.input);
      if (!def) {
        results.push({ id: call.id, name: call.name, isError: true, content: `There is no tool named ${call.name}.` });
        continue;
      }
      const parsed = (def.schema as z.ZodType).safeParse(call.input);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; ");
        run.emit({ type: "tool", id: call.id, name: call.name, status: "error", summary: label, detail: `Invalid input: ${msg}` });
        results.push({ id: call.id, name: call.name, isError: true, content: JSON.stringify({ INVALID_INPUT: msg }) });
        continue;
      }
      const destructive = (def as { destructive?: (i: unknown) => string | undefined }).destructive?.(parsed.data);
      if (destructive) {
        const approved = await requestApproval(call.name, destructive, JSON.stringify(parsed.data, null, 2).slice(0, 4000));
        if (signal.aborted) break outer;
        if (!approved) {
          run.emit({ type: "tool", id: call.id, name: call.name, status: "rejected", summary: label });
          results.push({ id: call.id, name: call.name, isError: true, content: "The user rejected this action. Do not retry it; continue another way or explain." });
          continue;
        }
      }
      if (["write_file", "edit_file", "generate_luau", "modify_roblox_hierarchy", "delete_file", "rename_file"].includes(call.name) && run.summary.phase === "planning") {
        setPhase("coding");
      }
      run.emit({ type: "tool", id: call.id, name: call.name, status: "running", summary: label });
      const t0 = Date.now();
      try {
        const ctx: ToolContext = {
          projectId,
          branch,
          meta: metaForBranch,
          runId: run.id,
          mode,
          signal,
          origin: opts.origin,
          toolCallId: call.id,
          emit: (e) => run.emit(e),
          requestApproval,
          setPhase,
          plan,
          touched,
          state,
        };
        const out = await (def.run as (i: unknown, c: ToolContext) => Promise<{ content: string; isError?: boolean; summary: string }>)(parsed.data, ctx);
        run.emit({ type: "tool", id: call.id, name: call.name, status: out.isError ? "error" : "done", summary: label, detail: out.summary, durationMs: Date.now() - t0 });
        results.push({ id: call.id, name: call.name, content: out.content.slice(0, 60_000), isError: out.isError });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        run.emit({ type: "tool", id: call.id, name: call.name, status: "error", summary: label, detail: message, durationMs: Date.now() - t0 });
        results.push({ id: call.id, name: call.name, isError: true, content: `Tool failed: ${message}` });
      }
    }
    if (results.length) messages.push({ role: "tool", results });

    const stopped = result.toolCalls.length === 0 || state.finished !== undefined;
    if (!stopped) continue;

    // ---------------------------------------------------------- verification gate
    if (touched.size === 0) break; // a question, not a build: nothing to verify
    const verdict = await verify(run, projectId, branch, meta.kind, opts.origin, setPhase, activity, touched);
    if (verdict.ok && (warningRoundDone || mode !== "autopilot" || !verdict.warnings)) break;
    if (!verdict.ok && repairRounds >= MAX_REPAIR_ROUNDS[mode]) {
      run.emit({ type: "error", message: `Verification still reports ${verdict.errors} error(s) after ${repairRounds} repair rounds` });
      break;
    }
    if (verdict.ok) {
      warningRoundDone = true;
      setPhase("optimizing", `${verdict.warnings} warning(s)`);
    } else {
      repairRounds++;
      setPhase("debugging", `${verdict.errors} error(s)`);
    }
    state.finished = undefined;
    messages.push({
      role: "user",
      content: verdict.ok
        ? `Automatic verification passed with no errors, but found ${verdict.warnings} warning(s). Fix the ones that matter (security, UI breaking on phones, broken references, missing listeners); explain any you deliberately leave. Then call finish again.\n\n${verdict.report}`
        : `Automatic verification found ${verdict.errors} error(s) that must be fixed before this is done. Fix them, re-check, then call finish again.\n\n${verdict.report}`,
    });
  }

  // ------------------------------------------------------------ wrap up
  const end = await store.createSnapshot(projectId, branch, { label: `After: ${opts.prompt.slice(0, 80)}`, reason: "agent-end", runId: run.id });
  run.summary.endSnapshot = end.id;
  if (end.id !== start.id) run.emit({ type: "snapshot", id: end.id, label: end.label });
  const before = (await store.getSnapshot(projectId, start.id)).files;
  const after = end.id === start.id ? before : (await store.getSnapshot(projectId, end.id)).files;
  run.summary.changedFiles = compareFileSets(before, after).map((c) => c.path);

  const summaryText = state.finished ?? finalText ?? "";
  run.summary.finalText = summaryText;
  if (summaryText) await store.appendChat(projectId, branch, { role: "assistant", text: summaryText, runId: run.id });
  run.summary.endedAt = Date.now();

  if (signal.aborted) {
    run.setStatus("cancelled", "Cancelled");
  } else {
    const failed = run.events.some((e) => e.event.type === "error") && !state.finished && touched.size > 0;
    if (!failed) {
      setPhase("complete");
      const a = activity("Project ready");
      a.done(run.summary.changedFiles.length ? `${run.summary.changedFiles.length} files changed` : undefined);
    }
    run.setStatus(failed ? "failed" : "completed");
  }
  await store.saveRunRecord(projectId, run.id, { ...run.summary, events: run.events.filter((e) => e.event.type !== "text" && e.event.type !== "reasoning" && e.event.type !== "output").slice(-3000) });
}

async function verify(
  run: Run,
  projectId: string,
  branch: string,
  kind: string,
  origin: string | undefined,
  setPhase: (p: Phase, d?: string) => void,
  activity: (l: string) => { done: (d?: string) => void; error: (d?: string) => void },
  touched: Set<string>,
): Promise<{ ok: boolean; errors: number; warnings: number; report: string }> {
  setPhase("validating", "automatic verification");
  if (isRobloxKind(kind as never)) {
    const a = activity("Checking Roblox hierarchy and scripts");
    let files = await store.readTree(projectId, branch);
    let report = validateRobloxProject(files);
    const repairs = planRepairs(files, report);
    if (repairs.length) {
      const r = activity(`Repairing ${repairs.length} issue(s) automatically`);
      const res = applyRepairs(files, repairs);
      const changed = await store.applyFileMap(projectId, branch, res.files);
      for (const p of changed) {
        touched.add(p);
        run.emit({ type: "file", path: p, change: res.files.has(p) ? (files.has(p) ? "modified" : "added") : "deleted" });
      }
      files = res.files;
      report = validateRobloxProject(files);
      r.done(res.applied.map((x) => x.description).join("; ").slice(0, 300));
    }
    run.emit({
      type: "checks",
      errors: report.summary.error,
      warnings: report.summary.warning,
      infos: report.summary.info,
      groups: report.checks.map((c) => ({ id: c.id, label: c.label, status: c.status })),
    });
    const { error, warning } = report.summary;
    if (error || warning) a.error(`Found ${error} error(s), ${warning} warning(s)`);
    else a.done("All checks passed");
    run.summary.checks = { errors: error, warnings: warning };
    const text = report.diagnostics
      .filter((d) => d.severity !== "info")
      .slice(0, 50)
      .map((d) => `- [${d.severity}] ${d.file ? `${d.file}${d.line ? `:${d.line}` : ""} ` : ""}${d.message}`)
      .join("\n");
    return { ok: error === 0, errors: error, warnings: warning, report: text };
  }
  const a = activity("Running tests");
  setPhase("testing");
  const r = await runProjectTests(projectId, branch, { origin, signal: run.abort.signal });
  const failing = r.cases.filter((c) => c.status === "fail");
  if (failing.length) a.error(`${failing.length} failing`);
  else a.done(`${r.passed} passed, ${r.skipped} skipped`);
  run.summary.checks = { errors: failing.length, warnings: r.warned };
  return {
    ok: failing.length === 0,
    errors: failing.length,
    warnings: r.warned,
    report: r.cases.filter((c) => c.status !== "pass").map((c) => `- [${c.status}] ${c.name}${c.detail ? `: ${c.detail.slice(0, 1500)}` : ""}`).join("\n"),
  };
}
