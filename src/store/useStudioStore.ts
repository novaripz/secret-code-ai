"use client";

import { create } from "zustand";
import type { ConsoleEntry, FileOperation, Project } from "@/types";
import {
  createFile,
  createFolder,
  deleteNode,
  findByPath,
  renameNode,
  updateFileContent,
} from "@/lib/fileSystem";
import { saveProject } from "@/lib/storage";

interface Tab {
  path: string;
  dirty: boolean;
}

interface StudioState {
  project: Project | null;
  tabs: Tab[];
  activeTab: string | null;
  consoleEntries: ConsoleEntry[];
  saving: boolean;
  lastSavedAt: number | null;

  setProject: (project: Project) => void;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;

  editFileContent: (path: string, content: string) => void;
  addFile: (path: string, content?: string) => void;
  addFolder: (path: string) => void;
  removeNode: (path: string) => void;
  renamePath: (path: string, newPath: string) => void;

  applyOperations: (ops: FileOperation[]) => { applied: FileOperation[]; failed: { op: FileOperation; error: string }[] };

  pushConsoleEntry: (entry: Omit<ConsoleEntry, "id" | "timestamp">) => void;
  clearConsole: () => void;

  persist: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(get: () => StudioState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    get().persist();
  }, 800);
}

export const useStudioStore = create<StudioState>((set, get) => ({
  project: null,
  tabs: [],
  activeTab: null,
  consoleEntries: [],
  saving: false,
  lastSavedAt: null,

  setProject: (project) => set({ project, tabs: [], activeTab: null, consoleEntries: [] }),

  openFile: (path) =>
    set((s) => {
      if (s.tabs.some((t) => t.path === path)) return { activeTab: path };
      return { tabs: [...s.tabs, { path, dirty: false }], activeTab: path };
    }),

  closeTab: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activeTab = s.activeTab;
      if (activeTab === path) {
        activeTab = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
      }
      return { tabs, activeTab };
    }),

  setActiveTab: (path) => set({ activeTab: path }),

  editFileContent: (path, content) => {
    const { project } = get();
    if (!project) return;
    try {
      updateFileContent(project, path, content);
    } catch {
      return;
    }
    set((s) => ({
      project: { ...project },
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: true } : t)),
    }));
    scheduleAutosave(get);
  },

  addFile: (path, content = "") => {
    const { project } = get();
    if (!project) return;
    createFile(project, path, content);
    set({ project: { ...project } });
    scheduleAutosave(get);
  },

  addFolder: (path) => {
    const { project } = get();
    if (!project) return;
    createFolder(project, path);
    set({ project: { ...project } });
    scheduleAutosave(get);
  },

  removeNode: (path) => {
    const { project } = get();
    if (!project) return;
    deleteNode(project, path);
    set((s) => ({
      project: { ...project },
      tabs: s.tabs.filter((t) => !t.path.startsWith(path)),
      activeTab: s.activeTab && s.activeTab.startsWith(path) ? null : s.activeTab,
    }));
    scheduleAutosave(get);
  },

  renamePath: (path, newPath) => {
    const { project } = get();
    if (!project) return;
    renameNode(project, path, newPath);
    set((s) => ({
      project: { ...project },
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, path: newPath } : t)),
      activeTab: s.activeTab === path ? newPath : s.activeTab,
    }));
    scheduleAutosave(get);
  },

  applyOperations: (ops) => {
    const { project } = get();
    const applied: FileOperation[] = [];
    const failed: { op: FileOperation; error: string }[] = [];
    if (!project) {
      return { applied, failed: ops.map((op) => ({ op, error: "No project loaded." })) };
    }
    for (const op of ops) {
      try {
        if (op.type === "create") {
          if (findByPath(project, op.path)) {
            updateFileContent(project, op.path, op.content ?? "");
          } else {
            createFile(project, op.path, op.content ?? "");
          }
        } else if (op.type === "modify") {
          if (findByPath(project, op.path)) {
            updateFileContent(project, op.path, op.content ?? "");
          } else {
            createFile(project, op.path, op.content ?? "");
          }
        } else if (op.type === "delete") {
          if (findByPath(project, op.path)) deleteNode(project, op.path);
        } else if (op.type === "rename") {
          if (op.newPath) renameNode(project, op.path, op.newPath);
        }
        applied.push(op);
      } catch (err) {
        failed.push({ op, error: err instanceof Error ? err.message : String(err) });
      }
    }
    set((s) => ({
      project: { ...project },
      tabs: s.tabs.map((t) => {
        const rename = applied.find((a) => a.type === "rename" && a.path === t.path);
        return rename ? { ...t, path: rename.newPath! } : t;
      }),
    }));
    get().persist();
    return { applied, failed };
  },

  pushConsoleEntry: (entry) =>
    set((s) => ({
      consoleEntries: [
        ...s.consoleEntries,
        { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now() },
      ].slice(-300),
    })),

  clearConsole: () => set({ consoleEntries: [] }),

  persist: async () => {
    const { project } = get();
    if (!project) return;
    set({ saving: true });
    try {
      await saveProject(project);
      set((s) => ({
        saving: false,
        lastSavedAt: Date.now(),
        tabs: s.tabs.map((t) => ({ ...t, dirty: false })),
      }));
    } catch (err) {
      console.error("Failed to save project", err);
      set({ saving: false });
    }
  },
}));
