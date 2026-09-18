"use client";

import { create } from "zustand";
import type { ConsoleEntry, FileOperation, Project } from "@/types";
import {
  copyNode,
  createFile,
  createFolder,
  deleteNode,
  findByPath,
  renameNode,
  restoreSubtree,
  snapshotSubtree,
  updateFileContent,
  type NodeSnapshot,
} from "@/lib/fileSystem";
import { saveProject } from "@/lib/storage";

interface Tab {
  path: string;
  dirty: boolean;
}

/**
 * What the last delete took away, kept so it can be put back.
 *
 * History (useVersionStore) was already the safety net here, and on paper it
 * covers a delete — but only on paper. Snapshots fold into the previous one for
 * ninety seconds, so a file written and then deleted inside that window is
 * folded out of the only checkpoint that ever held it, and no amount of
 * scrolling the history brings it back. A student deleting the wrong file
 * thirty seconds after making it is not an exotic case; it is Tuesday.
 *
 * So the delete itself carries its own undo, which does not depend on a timer
 * having fired. It is in memory only and lasts until the next delete: this is
 * "I just did that by mistake", not a second version history.
 */
interface DeletedSubtree {
  path: string;
  snapshot: NodeSnapshot[];
  /** Tabs that were open on it, so undo puts the student back where they were. */
  openPaths: string[];
}

interface StudioState {
  project: Project | null;
  tabs: Tab[];
  activeTab: string | null;
  consoleEntries: ConsoleEntry[];
  saving: boolean;
  lastSavedAt: number | null;
  lastDeleted: DeletedSubtree | null;

  setProject: (project: Project) => void;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;

  editFileContent: (path: string, content: string) => void;
  addFile: (path: string, content?: string, mimeType?: string) => void;
  addFolder: (path: string) => void;
  removeNode: (path: string) => void;
  renamePath: (path: string, newPath: string) => void;
  /** Copies a file or folder beside itself. Returns the new path, or null if it could not. */
  duplicateNode: (path: string, newPath: string) => string | null;
  /** Puts back whatever the last removeNode took. */
  undoDelete: () => void;

  applyOperations: (ops: FileOperation[]) => { applied: FileOperation[]; failed: { op: FileOperation; error: string }[] };

  pushConsoleEntry: (entry: Omit<ConsoleEntry, "id" | "timestamp">) => void;
  clearConsole: () => void;

  persist: () => Promise<void>;
}

// AUTOSAVE, AND THE PROJECT IT BELONGS TO
//
// The debounce used to fire a callback that read `get().project` -- whatever
// project the store held 800ms later. Open a project, type, and click through
// to another project inside that window, and the timer woke up pointing at the
// wrong one: the edit that was waiting to be written was dropped on the floor,
// and the student came back to a file that had silently lost their last few
// keystrokes. Nothing was written into the other project (saveProject keys on
// project.id), so nothing leaked -- it was quieter than that, and worse.
//
// The pending edit is now held by reference rather than looked up again, so a
// save always writes the project the edit was made in. Switching projects
// flushes it first instead of cancelling it.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;

async function flushAutosave(): Promise<void> {
  const project = pendingProject;
  pendingProject = null;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!project) return;
  try {
    await saveProject(project);
  } catch (err) {
    console.error("Failed to save project", err);
  }
}

function scheduleAutosave(project: Project) {
  pendingProject = project;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushAutosave();
  }, 800);
}

export const useStudioStore = create<StudioState>((set, get) => ({
  project: null,
  tabs: [],
  activeTab: null,
  consoleEntries: [],
  saving: false,
  lastSavedAt: null,
  lastDeleted: null,

  setProject: (project) => {
    // The outgoing project's unsaved edit is written before the store forgets
    // it exists. Deliberately not awaited: the new project should open now, and
    // the write is already pointed at the right record.
    void flushAutosave();
    // The undo goes with the project it belonged to: offering to restore
    // another project's file into this one would be a data bug wearing a
    // helpful label.
    set({ project, tabs: [], activeTab: null, consoleEntries: [], lastDeleted: null });
  },

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
    scheduleAutosave(project);
  },

  addFile: (path, content = "", mimeType) => {
    const { project } = get();
    if (!project) return;
    createFile(project, path, content, mimeType);
    set({ project: { ...project } });
    scheduleAutosave(project);
  },

  addFolder: (path) => {
    const { project } = get();
    if (!project) return;
    createFolder(project, path);
    set({ project: { ...project } });
    scheduleAutosave(project);
  },

  removeNode: (path) => {
    const { project } = get();
    if (!project) return;
    // Taken BEFORE the delete, obviously, but worth saying: this is the only
    // moment the contents still exist.
    const snapshot = snapshotSubtree(project, path);
    const openPaths = get().tabs.filter((t) => t.path === path || t.path.startsWith(`${path}/`)).map((t) => t.path);
    deleteNode(project, path);
    set((s) => ({
      project: { ...project },
      // Compared as a path segment, not as a string prefix: "styles" must not
      // close the tab holding "styles-old.css".
      tabs: s.tabs.filter((t) => !(t.path === path || t.path.startsWith(`${path}/`))),
      activeTab:
        s.activeTab && (s.activeTab === path || s.activeTab.startsWith(`${path}/`)) ? null : s.activeTab,
      lastDeleted: { path, snapshot, openPaths },
    }));
    scheduleAutosave(project);
  },

  duplicateNode: (path, newPath) => {
    const { project } = get();
    if (!project) return null;
    const created = copyNode(project, path, newPath);
    set({ project: { ...project } });
    scheduleAutosave(project);
    return created.path;
  },

  undoDelete: () => {
    const { project, lastDeleted } = get();
    if (!project || !lastDeleted) return;
    restoreSubtree(project, lastDeleted.snapshot);
    set((s) => ({
      project: { ...project },
      // Reopening the tabs is half the point: the student was working in that
      // file a second ago and should land back in it, not in an empty editor
      // wondering whether the undo did anything.
      tabs: [
        ...s.tabs,
        ...lastDeleted.openPaths
          .filter((p) => !s.tabs.some((t) => t.path === p))
          .map((p) => ({ path: p, dirty: false })),
      ],
      activeTab: lastDeleted.openPaths[0] ?? s.activeTab,
      lastDeleted: null,
    }));
    scheduleAutosave(project);
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
    scheduleAutosave(project);
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
    // An explicit save supersedes whatever the debounce was holding; letting it
    // fire afterwards would write the same bytes a second time.
    pendingProject = null;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
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
