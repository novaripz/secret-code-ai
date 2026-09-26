// Events an agent run emits. The server streams them over SSE; the workspace
// renders the build timeline, activity feed, live file updates and approval
// prompts from them. Shared by both sides so they cannot drift.

export const PHASES = ["planning", "generating", "installing", "coding", "testing", "debugging", "optimizing", "validating", "complete"] as const;
export type Phase = (typeof PHASES)[number];

export type RunMode = "chat" | "autopilot";
export type RunStatus = "running" | "waiting-approval" | "completed" | "failed" | "cancelled";

export interface PlanStep {
  text: string;
  status: "pending" | "active" | "done" | "skipped";
}

export type RunEvent =
  | { type: "run"; status: RunStatus; runId: string; mode: RunMode; prompt: string; branch: string; provider?: string; model?: string; message?: string }
  | { type: "phase"; phase: Phase; detail?: string }
  | { type: "activity"; id: string; label: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "turn-end"; text: string }
  | { type: "tool"; id: string; name: string; status: "running" | "done" | "error" | "rejected"; summary: string; detail?: string; durationMs?: number }
  | { type: "file"; path: string; change: "added" | "modified" | "deleted" }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "checks"; errors: number; warnings: number; infos: number; groups: { id: string; label: string; status: "pass" | "warn" | "fail" }[] }
  | { type: "approval"; id: string; tool: string; description: string; detail?: string }
  | { type: "approval-resolved"; id: string; approved: boolean }
  | { type: "output"; toolId: string; stream: "stdout" | "stderr"; chunk: string }
  | { type: "snapshot"; id: string; label: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string };

export interface IndexedEvent {
  seq: number;
  at: number;
  event: RunEvent;
}

export interface RunSummary {
  runId: string;
  projectId: string;
  branch: string;
  mode: RunMode;
  prompt: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  phase: Phase;
  startSnapshot?: string;
  endSnapshot?: string;
  changedFiles: string[];
  finalText?: string;
  checks?: { errors: number; warnings: number };
  provider?: string;
  model?: string;
  usage: { inputTokens: number; outputTokens: number };
  forgeBatch?: string;
  label?: string;
}
