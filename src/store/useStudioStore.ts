"use client";

import { create } from "zustand";
import type { ConsoleEntry, FileOperation, Project } from "@/types";
import {
  copyNode,
  createFile,
  createFolder,
  deleteNode,
  findByPath,
  listAllFiles,
  moveNode as moveNodeInProject,
  renameNode,
  restoreSubtree,
  snapshotSubtree,
  updateFileContent,
  type NodeSnapshot,
} from "@/lib/fileSystem";
import { normalizePath } from "@/lib/paths";
import { saveProject } from "@/lib/storage";
import { generateAsset } from "@/lib/assetGen";
import {
  defaultFile,
  neighbourAfterClosing,
  reconcileTabs,
  renameActive,
  renameTabs,
} from "@/components/build/tabState";

export interface Tab {
  path: string;
  dirty: boolean;
}

/**
 * A console line from the preview, with where it came from when the page knew.
 * Kept here rather than widening the shared ConsoleEntry type, which other
 * surfaces use and none of them need a line number on.
 */
export interface StudioConsoleEntry extends ConsoleEntry {
  file?: string;
  line?: number;
  col?: number;
  /** "input" is what the student typed into the console; "result" is its answer. */
  kind?: "input" | "result";
}

/**
 * Where the student's work is, in the words the top bar uses.
 * "unsaved" is the second or so between a keystroke and the write.
 */
export type SaveState = "saved" | "saving" | "unsaved" | "error";

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
  /**
   * The web page the student was last editing. The preview shows this page,
   * so editing about.html shows about.html — and keeps showing it while they
   * hop over to the stylesheet, rather than jumping back to the home page.
   */
  lastHtmlTab: string | null;
  consoleEntries: StudioConsoleEntry[];
  saveState: SaveState;
  lastSavedAt: number | null;
  lastDeleted: DeletedSubtree | null;

  /**
   * Opens a project. Opening the SAME project again (a restored version, say)
   * keeps the tabs that still exist; a different project gets the tabs it had
   * last time, or its front page.
   */
  setProject: (project: Project) => void;
  /** Renames the open project without touching its tabs, its console or anything else. */
  renameProject: (name: string) => void;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  closeOtherTabs: (path: string) => void;
  setActiveTab: (path: string) => void;

  editFileContent: (path: string, content: string) => void;
  addFile: (path: string, content?: string, mimeType?: string) => void;
  addFolder: (path: string) => void;
  removeNode: (path: string) => void;
  renamePath: (path: string, newPath: string) => void;
  /** Moves a file or folder into another folder ("" is the top level). Returns the new path. */
  moveNode: (path: string, targetFolder: string) => string;
  /** Copies a file or folder beside itself. Returns the new path, or null if it could not. */
  duplicateNode: (path: string, newPath: string) => string | null;
  /** Puts back whatever the last removeNode took. */
  undoDelete: () => void;

  applyOperations: (ops: FileOperation[]) => { applied: FileOperation[]; failed: { op: FileOperation; error: string }[] };

  pushConsoleEntry: (entry: Omit<StudioConsoleEntry, "id" | "timestamp">) => void;
  /** Several at once — the preview batches a frame's worth so a chatty game cannot re-render the console sixty times a second. */
  pushConsoleEntries: (entries: Omit<StudioConsoleEntry, "id" | "timestamp">[]) => void;
  clearConsole: () => void;

  /** Writes now instead of waiting for the autosave. Ctrl/Cmd-S. */
  persist: () => Promise<void>;
}

const MAX_CONSOLE = 300;

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
//
// AND WHAT THE TOP BAR SAYS ABOUT IT
//
// The autosave used to write without telling anyone: the dots on edited tabs
// never cleared and the "Saved" label never moved, so every file a student
// touched said "not saved yet" forever — which teaches them to distrust the
// one indicator that matters. The write now reports back. Each edit takes a
// number, and a finished save clears the dots only on files whose last edit
// is no newer than what that save wrote, so typing during a save never
// marks the newest keystrokes as safe.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let editSeq = 0;
const dirtyAt = new Map<string, number>();
let inFlight = 0;

function isOpen(project: Project): boolean {
  return useStudioStore.getState().project?.id === project.id;
}

async function flushAutosave(): Promise<void> {
  const project = pendingProject;
  pendingProject = null;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!project) return;
  const seq = editSeq;
  inFlight++;
  if (isOpen(project)) useStudioStore.setState({ saveState: "saving" });
  try {
    await saveProject(project);
    if (isOpen(project)) {
      useStudioStore.setState((s) => ({
        saveState: pendingProject ? "unsaved" : inFlight > 1 ? "saving" : "saved",
        lastSavedAt: Date.now(),
        tabs: s.tabs.some((t) => t.dirty && (dirtyAt.get(t.path) ?? 0) <= seq)
          ? s.tabs.map((t) => (t.dirty && (dirtyAt.get(t.path) ?? 0) <= seq ? { ...t, dirty: false } : t))
          : s.tabs,
      }));
    }
  } catch (err) {
    console.error("Failed to save project", err);
    if (isOpen(project)) useStudioStore.setState({ saveState: "error" });
  } finally {
    inFlight--;
  }
}

function scheduleAutosave(project: Project) {
  pendingProject = project;
  if (useStudioStore.getState().saveState !== "unsaved") useStudioStore.setState({ saveState: "unsaved" });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushAutosave();
  }, 800);
}

/**
 * Writes whatever the autosave is holding, right now.
 *
 * For the moments the debounce cannot wait for: the tab being hidden or closed,
 * the workspace unmounting. Returns whether there was anything to write, so a
 * `beforeunload` handler can decide whether to ask the student to wait.
 */
export function flushPendingSave(): boolean {
  const had = pendingProject !== null || inFlight > 0;
  void flushAutosave();
  return had;
}

// THE TABS EACH PROJECT HAD OPEN
//
// Remembered per project in localStorage: a tab strip is a few short strings,
// it has to be back on the first frame, and it is a convenience — losing it
// costs a click, never work.
const TABS_KEY = (projectId: string) => `panda:tabs:v1:${projectId}`;

function readRememberedTabs(projectId: string): { open: string[]; active: string | null } | null {
  try {
    const raw = window.localStorage.getItem(TABS_KEY(projectId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { open?: unknown; active?: unknown };
    const open = Array.isArray(saved.open) ? saved.open.filter((p): p is string => typeof p === "string") : [];
    return { open, active: typeof saved.active === "string" ? saved.active : null };
  } catch {
    return null;
  }
}

function rememberTabs(projectId: string, tabs: Tab[], active: string | null) {
  try {
    window.localStorage.setItem(TABS_KEY(projectId), JSON.stringify({ open: tabs.map((t) => t.path), active }));
  } catch {
    // Private browsing or a full quota. The tabs just will not come back.
  }
}

function isFile(project: Project, path: string): boolean {
  return findByPath(project, path)?.kind === "file";
}

/** The tabs a project opens with: what it had last time, or its front page. */
function initialTabs(project: Project): { tabs: Tab[]; activeTab: string | null } {
  const remembered = typeof window === "undefined" ? null : readRememberedTabs(project.id);
  const open = (remembered?.open ?? []).filter((p) => isFile(project, p));
  if (open.length > 0) {
    const active = remembered?.active && open.includes(remembered.active) ? remembered.active : open[0];
    return { tabs: open.map((path) => ({ path, dirty: false })), activeTab: active };
  }
  const first = defaultFile(listAllFiles(project).map((f) => f.path));
  return first ? { tabs: [{ path: first, dirty: false }], activeTab: first } : { tabs: [], activeTab: null };
}

const isPage = (path: string | null) => !!path && /\.html?$/i.test(path);

export const useStudioStore = create<StudioState>((set, get) => ({
  project: null,
  tabs: [],
  activeTab: null,
  lastHtmlTab: null,
  consoleEntries: [],
  saveState: "saved",
  lastSavedAt: null,
  lastDeleted: null,

  setProject: (project) => {
    // The outgoing project's unsaved edit is written before the store forgets
    // it exists. Deliberately not awaited: the new project should open now, and
    // the write is already pointed at the right record.
    void flushAutosave();
    const current = get();
    if (current.project?.id === project.id) {
      // The same project with different files: a version put back, or a
      // project re-read. Everything the student had open that still exists
      // stays open, and nothing else about the workspace moves.
      const next = reconcileTabs(current.tabs, current.activeTab, (path) => isFile(project, path));
      set({ project, ...next });
      return;
    }
    dirtyAt.clear();
    const opened = initialTabs(project);
    // The undo goes with the project it belonged to: offering to restore
    // another project's file into this one would be a data bug wearing a
    // helpful label.
    set({
      project,
      ...opened,
      lastHtmlTab: isPage(opened.activeTab) ? opened.activeTab : null,
      consoleEntries: [],
      lastDeleted: null,
      saveState: "saved",
      lastSavedAt: null,
    });
  },

  renameProject: (name) => {
    const { project } = get();
    const trimmed = name.trim();
    if (!project || !trimmed || trimmed === project.name) return;
    // In place, like every other edit, rather than through setProject: going
    // through setProject used to reset the tabs, the console and the undo,
    // so renaming a project closed everything the student had open.
    project.name = trimmed;
    project.updatedAt = Date.now();
    set({ project: { ...project } });
    scheduleAutosave(project);
  },

  openFile: (rawPath) =>
    set((s) => {
      const path = normalizePath(rawPath);
      // Only real files get tabs. Panda's "open these" list and a typed path
      // can both name something that is not there, and a tab on nothing is
      // a blank editor with a filename on it.
      if (!path || (s.project && !isFile(s.project, path))) return s;
      const lastHtmlTab = isPage(path) ? path : s.lastHtmlTab;
      if (s.tabs.some((t) => t.path === path)) return { activeTab: path, lastHtmlTab };
      return { tabs: [...s.tabs, { path, dirty: false }], activeTab: path, lastHtmlTab };
    }),

  closeTab: (path) =>
    set((s) => ({
      tabs: s.tabs.filter((t) => t.path !== path),
      activeTab: neighbourAfterClosing(s.tabs, s.activeTab, (p) => p === path),
    })),

  closeOtherTabs: (path) =>
    set((s) => ({ tabs: s.tabs.filter((t) => t.path === path), activeTab: path })),

  setActiveTab: (path) => set((s) => ({ activeTab: path, lastHtmlTab: isPage(path) ? path : s.lastHtmlTab })),

  editFileContent: (path, content) => {
    const { project } = get();
    if (!project) return;
    try {
      updateFileContent(project, path, content);
    } catch {
      return;
    }
    editSeq++;
    dirtyAt.set(path, editSeq);
    set((s) => ({
      project: { ...project },
      tabs: s.tabs.some((t) => t.path === path && !t.dirty)
        ? s.tabs.map((t) => (t.path === path ? { ...t, dirty: true } : t))
        : s.tabs,
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
    // Compared as a path segment, not as a string prefix: "styles" must not
    // close the tab holding "styles-old.css".
    const inside = (p: string) => p === path || p.startsWith(`${path}/`);
    const openPaths = get().tabs.filter((t) => inside(t.path)).map((t) => t.path);
    deleteNode(project, path);
    set((s) => ({
      project: { ...project },
      tabs: s.tabs.filter((t) => !inside(t.path)),
      // The tab beside it, not an empty editor: the student was working a
      // second ago and should still be looking at code.
      activeTab: neighbourAfterClosing(s.tabs, s.activeTab, inside),
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
    const from = findByPath(project, path)?.path ?? normalizePath(path);
    const node = renameNode(project, path, newPath);
    // Every tab INSIDE a renamed folder moves with it, not just a tab whose
    // path is exactly the folder's — which no tab ever is.
    set((s) => ({
      project: { ...project },
      tabs: renameTabs(s.tabs, from, node.path),
      activeTab: renameActive(s.activeTab, from, node.path),
      lastHtmlTab: renameActive(s.lastHtmlTab, from, node.path),
    }));
    scheduleAutosave(project);
  },

  moveNode: (path, targetFolder) => {
    const { project } = get();
    if (!project) return path;
    const from = findByPath(project, path)?.path ?? normalizePath(path);
    const node = moveNodeInProject(project, path, targetFolder);
    set((s) => ({
      project: { ...project },
      tabs: renameTabs(s.tabs, from, node.path),
      activeTab: renameActive(s.activeTab, from, node.path),
      lastHtmlTab: renameActive(s.lastHtmlTab, from, node.path),
    }));
    scheduleAutosave(project);
    return node.path;
  },

  applyOperations: (ops) => {
    const { project } = get();
    const applied: FileOperation[] = [];
    const failed: { op: FileOperation; error: string }[] = [];
    if (!project) {
      return { applied, failed: ops.map((op) => ({ op, error: "No project loaded." })) };
    }
    let tabs = get().tabs;
    let activeTab = get().activeTab;
    let lastHtmlTab = get().lastHtmlTab;
    for (const op of ops) {
      try {
        if (op.type === "create" || op.type === "modify") {
          if (findByPath(project, op.path)) {
            updateFileContent(project, op.path, op.content ?? "");
          } else {
            createFile(project, op.path, op.content ?? "");
          }
        } else if (op.type === "delete") {
          if (findByPath(project, op.path)) deleteNode(project, op.path);
        } else if (op.type === "rename") {
          if (op.newPath) {
            const from = findByPath(project, op.path)?.path ?? normalizePath(op.path);
            const node = renameNode(project, op.path, op.newPath);
            tabs = renameTabs(tabs, from, node.path);
            activeTab = renameActive(activeTab, from, node.path);
            lastHtmlTab = renameActive(lastHtmlTab, from, node.path);
          }
        } else if (op.type === "generate") {
          // The generator runs HERE, at apply time, not when the operation was
          // proposed. That is what makes a generated asset honest: the student
          // approved a described file, and the bytes are made from that exact
          // description at the moment they said yes. Generating early and
          // holding the result would mean the thing applied could drift from
          // the thing shown.
          const made = generateAsset(op.generator ?? "", op.path, op.spec ?? {});
          if (findByPath(project, op.path)) {
            updateFileContent(project, op.path, made.content);
          } else {
            createFile(project, op.path, made.content, made.mimeType);
          }
        }
        applied.push(op);
      } catch (err) {
        failed.push({ op, error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Deleted files lose their tabs here, whoever deleted them — Panda, or the
    // Changes panel undoing a file that did not exist before. Those tabs used
    // to stay open on nothing.
    const next = reconcileTabs(tabs, activeTab, (path) => isFile(project, path));
    set({ project: { ...project }, ...next, lastHtmlTab });
    void get().persist();
    return { applied, failed };
  },

  pushConsoleEntry: (entry) => get().pushConsoleEntries([entry]),

  pushConsoleEntries: (entries) => {
    if (entries.length === 0) return;
    const now = Date.now();
    set((s) => ({
      consoleEntries: [
        ...s.consoleEntries,
        ...entries.map((entry, i) => ({ ...entry, id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`, timestamp: now })),
      ].slice(-MAX_CONSOLE),
    }));
  },

  clearConsole: () => set({ consoleEntries: [] }),

  persist: async () => {
    const { project } = get();
    if (!project) return;
    // An explicit save supersedes whatever the debounce was holding; it is the
    // same write, made now, and it reports back the same way.
    pendingProject = project;
    await flushAutosave();
  },
}));

// The tab strip is remembered whenever it changes. A subscription rather than a
// line in every action, so no action can forget to do it.
if (typeof window !== "undefined") {
  useStudioStore.subscribe((state, previous) => {
    if (!state.project) return;
    if (state.tabs === previous.tabs && state.activeTab === previous.activeTab) return;
    rememberTabs(state.project.id, state.tabs, state.activeTab);
  });
}
