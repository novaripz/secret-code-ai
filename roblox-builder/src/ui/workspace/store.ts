"use client";

// Workspace state: the project, its files (as the core's FileMap), editor
// buffers, selection, checks, logs, layout and agent runs. Panels read from
// here; nothing is duplicated between them.

import { create } from "zustand";
import type { RunMode, RunSummary } from "@/core/agent/events";
import type { FileMap } from "@/core/project/files";
import type { BranchInfo, ProjectMeta } from "@/core/project/types";
import { buildDataModel, type DataModelBuild } from "@/core/roblox/rojo";
import { isRobloxKind } from "@/core/roblox/template";
import { api, subscribeRun, type BundleFile, type StatusInfo, type TestReportInfo, type ValidationResponse } from "../api";
import { toast } from "../common/ui";
import { applyEvent, emptyRunView, type RunView } from "./timeline";

export interface LogEntry {
  id: number;
  at: number;
  level: "log" | "info" | "warn" | "error";
  source: "preview" | "agent" | "system" | "terminal";
  text: string;
}

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  runId?: string;
}

interface State {
  projectId: string;
  meta?: ProjectMeta;
  branches: BranchInfo[];
  branch: string;
  status?: StatusInfo;
  loaded: boolean;
  loadError?: string;

  files: Map<string, BundleFile>;
  filesVersion: number;
  fileMap: FileMap;
  build?: DataModelBuild;

  tabs: string[];
  activeTab?: string;
  buffers: Record<string, string>;
  diskChanged: Record<string, boolean>;

  selectedInstance?: string;
  selectedFile?: string;

  report?: ValidationResponse;
  validating: boolean;
  testReport?: TestReportInfo;
  testing: boolean;

  logs: LogEntry[];
  chat: ChatEntry[];
  runs: Record<string, RunView>;
  runOrder: string[];
  activeRunId?: string;
  pastRuns: RunSummary[];
  focusPanel?: { id: string; nonce: number };

  init(projectId: string): Promise<void>;
  refreshFiles(): Promise<void>;
  refreshMeta(): Promise<void>;
  switchBranch(name: string): Promise<void>;
  openFile(path: string): void;
  closeTab(path: string): void;
  setBuffer(path: string, text: string): void;
  save(path?: string): Promise<void>;
  reloadFromDisk(path: string): void;
  selectInstance(id?: string): void;
  validate(): Promise<ValidationResponse | undefined>;
  runTests(): Promise<void>;
  repair(): Promise<void>;
  log(level: LogEntry["level"], source: LogEntry["source"], text: string): void;
  clearLogs(): void;
  startRun(prompt: string, mode: RunMode): Promise<void>;
  attachRun(summary: RunSummary): void;
  cancelRun(): Promise<void>;
  approve(approvalId: string, ok: boolean): Promise<void>;
  showPanel(id: string): void;
}

function toFileMap(files: Map<string, BundleFile>): FileMap {
  const map: FileMap = new Map();
  for (const [p, f] of files) {
    if (!f.binary) map.set(p, f.text ?? "");
    else if (f.base64) {
      const bin = atob(f.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      map.set(p, bytes);
    } else map.set(p, new Uint8Array(0));
  }
  return map;
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let logId = 0;
const unsubscribers = new Map<string, () => void>();

export const useWorkspace = create<State>((set, get) => ({
  projectId: "",
  branches: [],
  branch: "main",
  loaded: false,
  files: new Map(),
  filesVersion: 0,
  fileMap: new Map(),
  tabs: [],
  buffers: {},
  diskChanged: {},
  validating: false,
  testing: false,
  logs: [],
  chat: [],
  runs: {},
  runOrder: [],
  pastRuns: [],

  async init(projectId) {
    for (const u of unsubscribers.values()) u();
    unsubscribers.clear();
    set({ projectId, loaded: false, loadError: undefined, tabs: [], buffers: {}, runs: {}, runOrder: [], activeRunId: undefined, report: undefined, testReport: undefined, logs: [] });
    try {
      const [{ project, branches }, status] = await Promise.all([api.getProject(projectId), api.status().catch(() => undefined)]);
      set({ meta: project, branches, branch: project.activeBranch, status });
      await get().refreshFiles();
      const [{ messages }, { runs }] = await Promise.all([api.chat(projectId, project.activeBranch), api.runs(projectId)]);
      set({ chat: messages, pastRuns: runs, loaded: true });
      const live = runs.find((r) => r.branch === project.activeBranch && (r.status === "running" || r.status === "waiting-approval"));
      if (live) get().attachRun(live);
      const files = get().files;
      const first = ["src/server/Main.server.luau", "index.html", "src/init.server.luau", "README.md"].find((p) => files.has(p));
      if (first) get().openFile(first);
      if (isRobloxKind(project.kind)) get().validate();
    } catch (e) {
      set({ loadError: e instanceof Error ? e.message : String(e), loaded: true });
    }
  },

  async refreshFiles() {
    const { projectId, branch } = get();
    const { files } = await api.bundle(projectId, branch);
    const map = new Map(Object.entries(files));
    const prev = get().files;
    const buffers = { ...get().buffers };
    const diskChanged = { ...get().diskChanged };
    for (const path of Object.keys(buffers)) {
      const now = map.get(path);
      const before = prev.get(path);
      if (!now) continue;
      if (before?.text !== now.text) {
        // Unsaved edits are never overwritten; the editor shows the conflict instead.
        if (buffers[path] === before?.text) delete buffers[path];
        else diskChanged[path] = true;
      }
    }
    const fileMap = toFileMap(map);
    const meta = get().meta;
    const build = meta && isRobloxKind(meta.kind) ? buildDataModel(fileMap) : undefined;
    set((s) => ({
      files: map,
      fileMap,
      build,
      filesVersion: s.filesVersion + 1,
      buffers,
      diskChanged,
      tabs: s.tabs.filter((t) => map.has(t)),
      activeTab: s.activeTab && map.has(s.activeTab) ? s.activeTab : s.tabs.find((t) => map.has(t)),
    }));
  },

  async refreshMeta() {
    const { project, branches } = await api.getProject(get().projectId);
    set({ meta: project, branches });
  },

  async switchBranch(name) {
    const { projectId } = get();
    await api.updateProject(projectId, { activeBranch: name });
    set({ branch: name, tabs: [], buffers: {}, activeTab: undefined, report: undefined, testReport: undefined, selectedInstance: undefined });
    await get().refreshMeta();
    await get().refreshFiles();
    const { messages } = await api.chat(projectId, name);
    set({ chat: messages });
    const { runs } = await api.runs(projectId);
    set({ pastRuns: runs });
    const live = runs.find((r) => r.branch === name && (r.status === "running" || r.status === "waiting-approval"));
    if (live) get().attachRun(live);
    if (get().meta && isRobloxKind(get().meta!.kind)) get().validate();
    toast.info(`Switched to ${name}`);
  },

  openFile(path) {
    set((s) => ({ tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path], activeTab: path, selectedFile: path }));
  },

  closeTab(path) {
    set((s) => {
      const tabs = s.tabs.filter((t) => t !== path);
      const buffers = { ...s.buffers };
      delete buffers[path];
      const idx = s.tabs.indexOf(path);
      return { tabs, buffers, activeTab: s.activeTab === path ? tabs[Math.max(0, idx - 1)] : s.activeTab };
    });
  },

  setBuffer(path, text) {
    const disk = get().files.get(path)?.text;
    set((s) => {
      const buffers = { ...s.buffers };
      if (text === disk) delete buffers[path];
      else buffers[path] = text;
      return { buffers };
    });
  },

  async save(path) {
    const { projectId, branch, buffers } = get();
    const paths = path ? [path] : Object.keys(buffers);
    for (const p of paths) {
      const text = buffers[p];
      if (text === undefined) continue;
      try {
        await api.writeFile(projectId, branch, p, text);
        set((s) => {
          const b = { ...s.buffers };
          delete b[p];
          const d = { ...s.diskChanged };
          delete d[p];
          return { buffers: b, diskChanged: d };
        });
      } catch (e) {
        toast.error(`Could not save ${p}: ${e instanceof Error ? e.message : e}`);
        return;
      }
    }
    await get().refreshFiles();
    if (get().meta && isRobloxKind(get().meta!.kind)) get().validate();
  },

  reloadFromDisk(path) {
    set((s) => {
      const b = { ...s.buffers };
      delete b[path];
      const d = { ...s.diskChanged };
      delete d[path];
      return { buffers: b, diskChanged: d };
    });
  },

  selectInstance(id) {
    set({ selectedInstance: id });
  },

  async validate() {
    const { projectId, branch, meta } = get();
    if (!meta || !isRobloxKind(meta.kind)) return undefined;
    set({ validating: true });
    try {
      const report = await api.validate(projectId, branch);
      set({ report });
      return report;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      set({ validating: false });
    }
  },

  async runTests() {
    const { projectId, branch } = get();
    set({ testing: true });
    try {
      const { report } = await api.tests(projectId, branch);
      set({ testReport: report });
      const msg = `${report.passed} passed · ${report.failed} failed · ${report.skipped} skipped`;
      if (report.failed) toast.error(`Tests: ${msg}`);
      else toast.ok(`Tests: ${msg}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      set({ testing: false });
    }
  },

  async repair() {
    const { projectId, branch } = get();
    try {
      const r = await api.repair(projectId, branch);
      if (!r.applied.length) toast.info("Nothing can be repaired automatically; the remaining findings need code changes.");
      else toast.ok(`Applied ${r.applied.length} repair(s). Now ${r.summary.error} errors, ${r.summary.warning} warnings.`);
      await get().refreshFiles();
      await get().validate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  },

  log(level, source, text) {
    set((s) => ({ logs: [...s.logs.slice(-1500), { id: ++logId, at: Date.now(), level, source, text }] }));
  },

  clearLogs() {
    set({ logs: [] });
  },

  async startRun(prompt, mode) {
    const { projectId, branch, activeTab, selectedInstance } = get();
    try {
      const { summary } = await api.startRun({ projectId, branch, prompt, mode, focus: { file: activeTab, instance: selectedInstance } });
      set((s) => ({ chat: [...s.chat, { id: `local-${summary.runId}`, role: "user", text: prompt, at: Date.now(), runId: summary.runId }] }));
      get().attachRun(summary);
      get().showPanel("agent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  },

  attachRun(summary) {
    const runId = summary.runId;
    if (unsubscribers.has(runId)) return;
    set((s) => ({
      runs: { ...s.runs, [runId]: s.runs[runId] ?? { ...emptyRunView(runId, summary.prompt), summary } },
      runOrder: s.runOrder.includes(runId) ? s.runOrder : [...s.runOrder, runId],
      activeRunId: summary.branch === s.branch ? runId : s.activeRunId,
    }));
    get().log("info", "agent", `Run started (${summary.mode}): ${summary.prompt.slice(0, 120)}`);
    const unsub = subscribeRun(
      runId,
      (ie) => {
        set((s) => ({ runs: { ...s.runs, [runId]: applyEvent(s.runs[runId] ?? emptyRunView(runId, summary.prompt), ie) } }));
        const e = ie.event;
        if (e.type === "file" && get().branch === summary.branch) {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => get().refreshFiles(), 350);
        }
        if (e.type === "tool" && e.status !== "running") get().log(e.status === "error" ? "error" : "info", "agent", `${e.summary}${e.detail ? ` — ${e.detail}` : ""}`);
        if (e.type === "error") get().log("error", "agent", e.message);
        if (e.type === "phase") get().log("info", "agent", `Phase: ${e.phase}${e.detail ? ` (${e.detail})` : ""}`);
      },
      (s2) => set((s) => ({ runs: { ...s.runs, [runId]: { ...(s.runs[runId] ?? emptyRunView(runId, summary.prompt)), summary: s2 } } })),
      async (reason) => {
        unsubscribers.delete(runId);
        if (reason === "missing") return;
        const view = get().runs[runId];
        const final = view?.summary;
        if (get().branch === (final?.branch ?? summary.branch)) {
          await get().refreshFiles();
          await get().validate();
          const { messages } = await api.chat(get().projectId, get().branch);
          set({ chat: messages });
        }
        const { runs } = await api.runs(get().projectId);
        set({ pastRuns: runs });
        if (final?.status === "completed") toast.ok(final.label ? `${final.label}: ready` : "Project ready");
        else if (final?.status === "failed") toast.error(`Run failed${final.finalText ? "" : ": see the timeline"}`);
      },
    );
    unsubscribers.set(runId, unsub);
  },

  async cancelRun() {
    const id = get().activeRunId;
    if (id) await api.cancel(id);
  },

  async approve(approvalId, ok) {
    const id = Object.values(get().runs).find((r) => r.pendingApprovals.some((a) => a.id === approvalId))?.runId;
    if (id) await api.approve(id, approvalId, ok);
  },

  showPanel(id) {
    set({ focusPanel: { id, nonce: Date.now() } });
  },
}));

export function useActiveRun(): RunView | undefined {
  return useWorkspace((s) => (s.activeRunId ? s.runs[s.activeRunId] : undefined));
}

export function isRunning(view?: RunView): boolean {
  const st = view?.summary?.status;
  return !!view && (!st || st === "running" || st === "waiting-approval") && !view.items.some((i) => i.kind === "final");
}
