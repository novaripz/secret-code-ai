// Typed client for the server API.

import type { IndexedEvent, RunMode, RunSummary } from "@/core/agent/events";
import type { CheckGroup } from "@/core/roblox/validate";
import type { Diagnostic, Severity } from "@/core/diagnostics";
import type { BranchInfo, FileEntry, ProjectMemory, ProjectMeta, ProjectSettings, SnapshotInfo } from "@/core/project/types";
import type { FileChange, Hunk } from "@/core/versions/diff";
import type { ProjectKind } from "@/core/roblox/template";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) window.location.replace("/login");
    throw new ApiError((data as { error?: string }).error ?? `${res.status} ${res.statusText}`, res.status, data);
  }
  return data as T;
}

const q = (branch?: string) => (branch ? `branch=${encodeURIComponent(branch)}` : "");

export interface StatusInfo {
  ai: { configured: boolean; active?: { id: string; label: string; model: string }; available: { id: string; label: string; model: string }[]; hint?: string };
  commands: boolean;
  tools: Record<string, boolean>;
  browser: boolean;
  robloxCloud: boolean;
  auth: boolean;
}

export interface BundleFile {
  text?: string;
  base64?: string;
  size: number;
  binary: boolean;
}

export interface ValidationResponse {
  diagnostics: Diagnostic[];
  checks: CheckGroup[];
  stats: { instances: number; scripts: number; remotes: number; guis: number; parts: number; modules: number };
  summary: Record<Severity, number>;
  unmappedFiles: string[];
}

export interface TestCaseInfo {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail?: string;
  durationMs: number;
}

export interface TestReportInfo {
  projectKind: string;
  startedAt: number;
  durationMs: number;
  cases: TestCaseInfo[];
  passed: number;
  failed: number;
  skipped: number;
  warned: number;
  diagnostics?: Diagnostic[];
  hasScreenshot?: boolean;
}

export const api = {
  status: () => call<StatusInfo>("/api/status"),
  listProjects: () => call<{ projects: ProjectMeta[] }>("/api/projects"),
  createProject: (input: { name: string; kind: ProjectKind; description?: string }) =>
    call<{ project: ProjectMeta }>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  getProject: (id: string) => call<{ project: ProjectMeta; branches: BranchInfo[] }>(`/api/projects/${id}`),
  updateProject: (id: string, patch: { name?: string; description?: string; activeBranch?: string; settings?: ProjectSettings }) =>
    call<{ project: ProjectMeta }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (id: string) => call<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),

  bundle: (id: string, branch?: string) => call<{ files: Record<string, BundleFile> }>(`/api/projects/${id}/bundle?${q(branch)}`),
  files: (id: string, branch?: string) => call<{ files: FileEntry[] }>(`/api/projects/${id}/files?${q(branch)}`),
  writeFile: (id: string, branch: string, path: string, content: string, encoding?: "utf8" | "base64") =>
    call<{ path: string }>(`/api/projects/${id}/file?${q(branch)}`, { method: "PUT", body: JSON.stringify({ path, content, encoding }) }),
  deleteFile: (id: string, branch: string, path: string) =>
    call<{ ok: true }>(`/api/projects/${id}/file?${q(branch)}&path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  renameFile: (id: string, branch: string, from: string, to: string) =>
    call<{ path: string }>(`/api/projects/${id}/file/rename?${q(branch)}`, { method: "POST", body: JSON.stringify({ from, to }) }),
  rawFileUrl: (id: string, branch: string, path: string) => `/api/projects/${id}/file?${q(branch)}&path=${encodeURIComponent(path)}&raw=1`,

  validate: (id: string, branch?: string) => call<ValidationResponse>(`/api/projects/${id}/validate?${q(branch)}`, { method: "POST" }),
  repair: (id: string, branch: string, rules?: string[]) =>
    call<{ applied: string[]; failed: string[]; changed: string[]; summary: Record<Severity, number> }>(`/api/projects/${id}/repair?${q(branch)}`, {
      method: "POST",
      body: JSON.stringify({ rules }),
    }),
  hierarchy: (id: string, branch: string, ops: unknown[]) =>
    call<{ changed: string[]; summary: string }>(`/api/projects/${id}/hierarchy?${q(branch)}`, { method: "POST", body: JSON.stringify({ ops }) }),
  tests: (id: string, branch: string) => call<{ report: TestReportInfo }>(`/api/projects/${id}/tests?${q(branch)}`, { method: "POST" }),

  snapshots: (id: string, branch?: string) => call<{ snapshots: SnapshotInfo[] }>(`/api/projects/${id}/snapshots?${q(branch)}`),
  createSnapshot: (id: string, branch: string, label: string) =>
    call<{ snapshot: SnapshotInfo }>(`/api/projects/${id}/snapshots?${q(branch)}`, { method: "POST", body: JSON.stringify({ label }) }),
  restoreSnapshot: (id: string, branch: string, sid: string, paths?: string[]) =>
    call<{ changed: string[] }>(`/api/projects/${id}/snapshots/${sid}/restore?${q(branch)}`, { method: "POST", body: JSON.stringify({ paths }) }),
  diff: (id: string, branch: string, sid: string, against: string, path?: string) =>
    call<{ changes: FileChange[]; hunks?: Hunk[] | null }>(
      `/api/projects/${id}/snapshots/${sid}/diff?${q(branch)}&against=${encodeURIComponent(against)}${path ? `&path=${encodeURIComponent(path)}` : ""}`,
    ),

  branches: (id: string) => call<{ branches: BranchInfo[] }>(`/api/projects/${id}/branches`),
  createBranch: (id: string, input: { name: string; fromBranch?: string; fromSnapshot?: string; label?: string }) =>
    call<{ branch: BranchInfo }>(`/api/projects/${id}/branches`, { method: "POST", body: JSON.stringify(input) }),
  deleteBranch: (id: string, name: string) => call<{ ok: true }>(`/api/projects/${id}/branches?name=${encodeURIComponent(name)}`, { method: "DELETE" }),
  adopt: (id: string, from: string, into: string) =>
    call<{ changed: string[]; before: string; after: string }>(`/api/projects/${id}/branches/adopt`, { method: "POST", body: JSON.stringify({ from, into }) }),

  memory: (id: string) => call<{ memory: ProjectMemory }>(`/api/projects/${id}/memory`),
  setMemory: (id: string, memory: ProjectMemory) => call<{ memory: ProjectMemory }>(`/api/projects/${id}/memory`, { method: "PUT", body: JSON.stringify(memory) }),
  chat: (id: string, branch: string) => call<{ messages: { id: string; role: "user" | "assistant"; text: string; at: number; runId?: string }[] }>(`/api/projects/${id}/chat?${q(branch)}`),
  runs: (id: string) => call<{ runs: RunSummary[] }>(`/api/projects/${id}/runs`),

  createAsset: (id: string, branch: string, spec: unknown, formats?: string[], dryRun?: boolean) =>
    call<{ ok: boolean; steps: { step: string; ok: boolean; detail: string }[]; diagnostics: Diagnostic[]; files: string[]; robloxPath?: string; stats?: { parts: number; triangles: number; materials: number; size: number[] } }>(
      `/api/projects/${id}/assets?${q(branch)}`,
      { method: "POST", body: JSON.stringify({ spec, formats, dryRun }) },
    ),
  importAssets: async (id: string, branch: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("file", f));
    const res = await fetch(`/api/projects/${id}/assets/import?${q(branch)}`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error ?? "Import failed", res.status);
    return data as { results: { name: string; path?: string; error?: string; inspection?: Record<string, unknown>; diagnostics?: Diagnostic[] }[] };
  },
  exportCheck: (id: string, branch: string, format: "rbxlx" | "rbxmx", instance?: string) =>
    call<{ instances: number; bytes: number; warnings: string[]; buildErrors: string[] }>(
      `/api/projects/${id}/export?${q(branch)}&format=${format}&check=1${instance ? `&instance=${encodeURIComponent(instance)}` : ""}`,
    ),
  exportUrl: (id: string, branch: string, format: "zip" | "rbxlx" | "rbxmx", instance?: string) =>
    `/api/projects/${id}/export?${q(branch)}&format=${format}${instance ? `&instance=${encodeURIComponent(instance)}` : ""}`,
  publish: (id: string, branch: string, input: Record<string, unknown>) =>
    call<{ ok: boolean; data?: { versionNumber?: number; assetId?: string }; error?: string; status?: number }>(`/api/projects/${id}/publish?${q(branch)}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  startRun: (input: { projectId: string; branch: string; prompt: string; mode: RunMode; focus?: { file?: string; instance?: string } }) =>
    call<{ runId: string; summary: RunSummary }>("/api/agent", { method: "POST", body: JSON.stringify(input) }),
  approve: (runId: string, approvalId: string, approved: boolean) =>
    call<{ ok: boolean }>(`/api/agent/${runId}/approve`, { method: "POST", body: JSON.stringify({ approvalId, approved }) }),
  cancel: (runId: string) => call<{ ok: boolean }>(`/api/agent/${runId}/cancel`, { method: "POST" }),
  forge: (input: { projectId: string; prompt: string; count: number; directions?: { label: string; brief: string }[] }) =>
    call<{ batch: string; base: string; variants: { branch: string; runId: string; label: string; brief: string }[] }>("/api/forge", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

/** Subscribes to a run's events; reconnects from the last sequence number. */
export function subscribeRun(
  runId: string,
  onEvent: (e: IndexedEvent) => void,
  onSummary: (s: RunSummary) => void,
  onClose?: (reason: "done" | "missing") => void,
): () => void {
  let last = 0;
  let es: EventSource | undefined;
  let closed = false;
  let retry = 0;
  const open = () => {
    if (closed) return;
    es = new EventSource(`/api/agent/${runId}/events?from=${last}`);
    es.onmessage = (m) => {
      retry = 0;
      const data = JSON.parse(m.data) as IndexedEvent & { summary?: RunSummary };
      if (data.seq === -1 && data.summary) {
        onSummary(data.summary);
        if (["completed", "failed", "cancelled"].includes(data.summary.status)) {
          closed = true;
          es?.close();
          onClose?.("done");
        }
        return;
      }
      if (data.seq >= last) {
        last = data.seq + 1;
        onEvent(data);
      }
    };
    es.onerror = async () => {
      es?.close();
      if (closed) return;
      const probe = await fetch(`/api/agent/${runId}/events?from=${last}`, { method: "GET" }).catch(() => undefined);
      if (probe?.status === 404) {
        closed = true;
        onClose?.("missing");
        return;
      }
      probe?.body?.cancel().catch(() => undefined);
      setTimeout(open, Math.min(1000 * 2 ** retry++, 8000));
    };
  };
  open();
  return () => {
    closed = true;
    es?.close();
  };
}
