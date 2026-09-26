// Folds the run event stream into the items the agent panel renders.

import type { IndexedEvent, Phase, PlanStep, RunSummary } from "@/core/agent/events";

export type TimelineItem =
  | { kind: "user"; key: string; text: string; at: number }
  | { kind: "text"; key: string; text: string; streaming: boolean }
  | { kind: "reasoning"; key: string; text: string; streaming: boolean }
  | { kind: "tool"; key: string; id: string; name: string; summary: string; status: "running" | "done" | "error" | "rejected"; detail?: string; durationMs?: number; output: string }
  | { kind: "activity"; key: string; id: string; label: string; status: "running" | "done" | "error"; detail?: string }
  | { kind: "approval"; key: string; id: string; tool: string; description: string; detail?: string; resolved?: boolean }
  | { kind: "checks"; key: string; errors: number; warnings: number; infos: number; groups: { id: string; label: string; status: "pass" | "warn" | "fail" }[] }
  | { kind: "snapshot"; key: string; id: string; label: string }
  | { kind: "error"; key: string; message: string }
  | { kind: "final"; key: string; text: string; status: string };

export interface RunView {
  runId: string;
  items: TimelineItem[];
  plan: PlanStep[];
  phase: Phase;
  phasesSeen: Phase[];
  phaseDetail?: string;
  pendingApprovals: { id: string; tool: string; description: string; detail?: string }[];
  summary?: RunSummary;
  usage: { inputTokens: number; outputTokens: number };
  changedFiles: Set<string>;
}

export function emptyRunView(runId: string, prompt: string): RunView {
  return {
    runId,
    items: [{ kind: "user", key: `u-${runId}`, text: prompt, at: Date.now() }],
    plan: [],
    phase: "planning",
    phasesSeen: ["planning"],
    pendingApprovals: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    changedFiles: new Set(),
  };
}

export function applyEvent(view: RunView, ie: IndexedEvent): RunView {
  const e = ie.event;
  const items = view.items;
  const last = items[items.length - 1];
  const key = `${view.runId}-${ie.seq}`;
  switch (e.type) {
    case "text": {
      if (last?.kind === "text" && last.streaming) {
        return { ...view, items: [...items.slice(0, -1), { ...last, text: last.text + e.delta }] };
      }
      return { ...view, items: [...items, { kind: "text", key, text: e.delta, streaming: true }] };
    }
    case "reasoning": {
      if (last?.kind === "reasoning" && last.streaming) {
        return { ...view, items: [...items.slice(0, -1), { ...last, text: last.text + e.delta }] };
      }
      return { ...view, items: [...items, { kind: "reasoning", key, text: e.delta, streaming: true }] };
    }
    case "turn-end":
      return { ...view, items: items.map((i) => (i.kind === "text" || i.kind === "reasoning" ? { ...i, streaming: false } : i)).filter((i) => !(i.kind === "text" && !i.text.trim())) };
    case "tool": {
      const idx = items.findIndex((i) => i.kind === "tool" && i.id === e.id);
      const closed = items.map((i) => (i.kind === "text" || i.kind === "reasoning" ? { ...i, streaming: false } : i));
      if (idx >= 0) {
        const cur = closed[idx] as Extract<TimelineItem, { kind: "tool" }>;
        closed[idx] = { ...cur, status: e.status, detail: e.detail ?? cur.detail, durationMs: e.durationMs };
        return { ...view, items: closed };
      }
      return { ...view, items: [...closed, { kind: "tool", key, id: e.id, name: e.name, summary: e.summary, status: e.status, detail: e.detail, durationMs: e.durationMs, output: "" }] };
    }
    case "output": {
      const idx = items.findIndex((i) => i.kind === "tool" && i.id === e.toolId);
      if (idx < 0) return view;
      const cur = items[idx] as Extract<TimelineItem, { kind: "tool" }>;
      const next = [...items];
      next[idx] = { ...cur, output: (cur.output + e.chunk).slice(-20000) };
      return { ...view, items: next };
    }
    case "activity": {
      const idx = items.findIndex((i) => i.kind === "activity" && i.id === e.id);
      if (idx >= 0) {
        const next = [...items];
        next[idx] = { ...(next[idx] as Extract<TimelineItem, { kind: "activity" }>), status: e.status, detail: e.detail };
        return { ...view, items: next };
      }
      return { ...view, items: [...items, { kind: "activity", key, id: e.id, label: e.label, status: e.status, detail: e.detail }] };
    }
    case "approval":
      return {
        ...view,
        items: [...items, { kind: "approval", key, id: e.id, tool: e.tool, description: e.description, detail: e.detail }],
        pendingApprovals: [...view.pendingApprovals, { id: e.id, tool: e.tool, description: e.description, detail: e.detail }],
      };
    case "approval-resolved":
      return {
        ...view,
        items: items.map((i) => (i.kind === "approval" && i.id === e.id ? { ...i, resolved: e.approved } : i)),
        pendingApprovals: view.pendingApprovals.filter((a) => a.id !== e.id),
      };
    case "phase":
      return {
        ...view,
        phase: e.phase,
        phaseDetail: e.detail,
        phasesSeen: view.phasesSeen.includes(e.phase) ? view.phasesSeen : [...view.phasesSeen, e.phase],
      };
    case "plan":
      return { ...view, plan: e.steps };
    case "checks":
      return { ...view, items: [...items, { kind: "checks", key, errors: e.errors, warnings: e.warnings, infos: e.infos, groups: e.groups }] };
    case "snapshot":
      return { ...view, items: [...items, { kind: "snapshot", key, id: e.id, label: e.label }] };
    case "file": {
      const changed = new Set(view.changedFiles);
      changed.add(e.path);
      return { ...view, changedFiles: changed };
    }
    case "usage":
      return { ...view, usage: { inputTokens: e.inputTokens, outputTokens: e.outputTokens } };
    case "error":
      return { ...view, items: [...items, { kind: "error", key, message: e.message }] };
    case "run": {
      if (e.status === "completed" || e.status === "failed" || e.status === "cancelled") {
        const closed = items.map((i) => (i.kind === "text" || i.kind === "reasoning" ? { ...i, streaming: false } : i));
        return { ...view, items: [...closed, { kind: "final", key, text: e.message ?? "", status: e.status }], pendingApprovals: [] };
      }
      return view;
    }
    default:
      return view;
  }
}
