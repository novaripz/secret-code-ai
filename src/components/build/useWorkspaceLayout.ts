"use client";

import { create } from "zustand";

// Where the workspace's panes sit, and which of them are open. This is the
// student's arrangement of their own desk, so it has to survive a reload —
// localStorage rather than IndexedDB because it's tiny and synchronous, which
// means the panes come back at the right size on the first frame instead of
// snapping into place a moment later.
//
// Reading storage at module scope is safe here only because the workspace never
// renders on the server: the project page shows a loading state until IndexedDB
// answers, so this component tree mounts client-side and there is no server
// render to mismatch.

const STORAGE_KEY = "panda:workspace:v1";

export type PanelKey = "files" | "history" | "preview" | "chat";

/** Pixel floors. Below these a pane is a sliver you can see but not use. */
export const MIN_SIDEBAR = 180;
export const MAX_SIDEBAR = 460;
export const MIN_CHAT = 280;
export const MAX_CHAT = 620;
/** The editor keeps this much room no matter what else is dragged. */
export const MIN_CENTER = 320;
/** Floor for the two stacked splits, applied as a fraction of the column. */
export const MIN_STACKED = 90;

export interface LayoutState {
  sidebarWidth: number;
  chatWidth: number;
  /** Share of the sidebar column given to Files when History is open too. */
  filesRatio: number;
  /** Share of the centre column given to the editor when Preview is open. */
  editorRatio: number;
  visible: Record<PanelKey, boolean>;

  setSidebarWidth: (px: number) => void;
  setChatWidth: (px: number) => void;
  setFilesRatio: (ratio: number) => void;
  setEditorRatio: (ratio: number) => void;
  toggle: (key: PanelKey) => void;
  close: (key: PanelKey) => void;
  open: (key: PanelKey) => void;
  reset: () => void;
}

type Persisted = Pick<
  LayoutState,
  "sidebarWidth" | "chatWidth" | "filesRatio" | "editorRatio" | "visible"
>;

const DEFAULTS: Persisted = {
  sidebarWidth: 232,
  chatWidth: 400,
  filesRatio: 0.55,
  editorRatio: 0.62,
  // History starts closed: it's the thing you go looking for, not the thing you
  // work in, and an empty list on first open explains nothing.
  visible: { files: true, history: false, preview: true, chat: true },
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function read(): Persisted {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Persisted>;
    return {
      sidebarWidth: clamp(saved.sidebarWidth ?? DEFAULTS.sidebarWidth, MIN_SIDEBAR, MAX_SIDEBAR),
      chatWidth: clamp(saved.chatWidth ?? DEFAULTS.chatWidth, MIN_CHAT, MAX_CHAT),
      filesRatio: clamp(saved.filesRatio ?? DEFAULTS.filesRatio, 0.15, 0.85),
      editorRatio: clamp(saved.editorRatio ?? DEFAULTS.editorRatio, 0.15, 0.85),
      visible: { ...DEFAULTS.visible, ...(saved.visible ?? {}) },
    };
  } catch {
    // Private browsing, or a storage entry from an older layout. Defaults are
    // always a usable desk.
    return DEFAULTS;
  }
}

function write(state: LayoutState) {
  if (typeof window === "undefined") return;
  const payload: Persisted = {
    sidebarWidth: state.sidebarWidth,
    chatWidth: state.chatWidth,
    filesRatio: state.filesRatio,
    editorRatio: state.editorRatio,
    visible: state.visible,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Full or blocked. The layout still works, it just forgets.
  }
}

export const useWorkspaceLayout = create<LayoutState>((set, get) => {
  const commit = (patch: Partial<LayoutState>) => {
    set(patch);
    write(get());
  };

  return {
    ...read(),

    setSidebarWidth: (px) => commit({ sidebarWidth: clamp(px, MIN_SIDEBAR, MAX_SIDEBAR) }),
    setChatWidth: (px) => commit({ chatWidth: clamp(px, MIN_CHAT, MAX_CHAT) }),
    setFilesRatio: (ratio) => commit({ filesRatio: clamp(ratio, 0.15, 0.85) }),
    setEditorRatio: (ratio) => commit({ editorRatio: clamp(ratio, 0.15, 0.85) }),

    toggle: (key) => commit({ visible: { ...get().visible, [key]: !get().visible[key] } }),
    close: (key) => commit({ visible: { ...get().visible, [key]: false } }),
    open: (key) => commit({ visible: { ...get().visible, [key]: true } }),

    reset: () => commit({ ...DEFAULTS, visible: { ...DEFAULTS.visible } }),
  };
});
