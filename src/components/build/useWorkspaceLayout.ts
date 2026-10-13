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
//
// THE SHAPE, since the redesign
//
// The left column is ONE view at a time — Files, Search or History — chosen
// from the activity rail, the way every desktop editor a student will meet
// later works. Files and History used to be stacked in a 232px column with a
// title bar each, which gave both of them half a column and the workspace two
// more headers than it needed. Changes, the preview and Panda are panes that
// open beside the editor, each with its own switch on the rail.
//
// On a phone none of that applies: one pane fills the screen, picked from a bar
// along the bottom, and `phonePane` says which. It is not saved — a phone
// always reopens on the code, which is the one thing every visit is for.

const STORAGE_KEY = "panda:workspace:v2";
const LEGACY_KEY = "panda:workspace:v1";

export type SideView = "files" | "search" | "history";
export type PanelKey = "changes" | "preview" | "chat";
export type PhonePane = SideView | "changes" | "editor" | "preview" | "chat";

/** Pixel floors. Below these a pane is a sliver you can see but not use. */
export const MIN_SIDEBAR = 200;
export const MAX_SIDEBAR = 480;
export const MIN_CHAT = 300;
export const MAX_CHAT = 620;
/**
 * Changes is a reading surface — two versions of a line, side by side, with
 * their numbers — so it is sized like one: wider than the chat by default, and
 * allowed to go wider still.
 */
export const MIN_CHANGES = 320;
export const MAX_CHANGES = 760;
/** The editor keeps this much room no matter what else is open or dragged. */
export const MIN_CENTER = 360;
/** Floor for the editor/preview split, in pixels of the centre column. */
export const MIN_STACKED = 120;

export interface LayoutState {
  sidebarWidth: number;
  chatWidth: number;
  changesWidth: number;
  /** Share of the centre column given to the editor when the preview is open. */
  editorRatio: number;
  /** The open left-hand view, or null when the column is folded away. */
  side: SideView | null;
  visible: Record<PanelKey, boolean>;
  phonePane: PhonePane;

  setSidebarWidth: (px: number) => void;
  setChatWidth: (px: number) => void;
  setChangesWidth: (px: number) => void;
  setEditorRatio: (ratio: number) => void;
  /** Opens a left-hand view; asking for the one already open folds the column away. */
  toggleSide: (view: SideView) => void;
  showSide: (view: SideView) => void;
  closeSide: () => void;
  toggle: (key: PanelKey) => void;
  close: (key: PanelKey) => void;
  open: (key: PanelKey) => void;
  /**
   * Brings something into view on whatever device this is: opens it as a pane
   * on a laptop and makes it THE pane on a phone. Everything that says "go
   * and show the student X" — Ask Panda, a problem's file, a search result —
   * goes through here so it works on both.
   */
  reveal: (target: PhonePane) => void;
  setPhonePane: (pane: PhonePane) => void;
  reset: () => void;
}

type Persisted = Pick<LayoutState, "sidebarWidth" | "chatWidth" | "changesWidth" | "editorRatio" | "side" | "visible">;

const DEFAULTS: Persisted = {
  sidebarWidth: 248,
  chatWidth: 400,
  changesWidth: 460,
  editorRatio: 0.6,
  side: "files",
  // Changes starts closed: it is somewhere you go when you have a question
  // ("what did that actually do?"), and on a brand-new project it has nothing
  // to say yet.
  visible: { changes: false, preview: true, chat: true },
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function read(): Persisted {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Persisted>;
      const side = saved.side === null || saved.side === "files" || saved.side === "search" || saved.side === "history"
        ? saved.side
        : DEFAULTS.side;
      return {
        sidebarWidth: clamp(Number(saved.sidebarWidth) || DEFAULTS.sidebarWidth, MIN_SIDEBAR, MAX_SIDEBAR),
        chatWidth: clamp(Number(saved.chatWidth) || DEFAULTS.chatWidth, MIN_CHAT, MAX_CHAT),
        changesWidth: clamp(Number(saved.changesWidth) || DEFAULTS.changesWidth, MIN_CHANGES, MAX_CHANGES),
        editorRatio: clamp(Number(saved.editorRatio) || DEFAULTS.editorRatio, 0.15, 0.85),
        side,
        visible: { ...DEFAULTS.visible, ...(saved.visible ?? {}) },
      };
    }
    // The first visit after the redesign keeps the sizes the student dragged.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Partial<{
        sidebarWidth: number;
        chatWidth: number;
        changesWidth: number;
        editorRatio: number;
        visible: Record<string, boolean>;
      }>;
      return {
        ...DEFAULTS,
        sidebarWidth: clamp(Number(old.sidebarWidth) || DEFAULTS.sidebarWidth, MIN_SIDEBAR, MAX_SIDEBAR),
        chatWidth: clamp(Number(old.chatWidth) || DEFAULTS.chatWidth, MIN_CHAT, MAX_CHAT),
        changesWidth: clamp(Number(old.changesWidth) || DEFAULTS.changesWidth, MIN_CHANGES, MAX_CHANGES),
        editorRatio: clamp(Number(old.editorRatio) || DEFAULTS.editorRatio, 0.15, 0.85),
        side: old.visible?.files === false ? (old.visible?.history ? "history" : null) : "files",
        visible: {
          changes: old.visible?.changes ?? DEFAULTS.visible.changes,
          preview: old.visible?.preview ?? DEFAULTS.visible.preview,
          chat: old.visible?.chat ?? DEFAULTS.visible.chat,
        },
      };
    }
    return DEFAULTS;
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
    changesWidth: state.changesWidth,
    editorRatio: state.editorRatio,
    side: state.side,
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
    phonePane: "editor",

    setSidebarWidth: (px) => commit({ sidebarWidth: clamp(px, MIN_SIDEBAR, MAX_SIDEBAR) }),
    setChatWidth: (px) => commit({ chatWidth: clamp(px, MIN_CHAT, MAX_CHAT) }),
    setChangesWidth: (px) => commit({ changesWidth: clamp(px, MIN_CHANGES, MAX_CHANGES) }),
    setEditorRatio: (ratio) => commit({ editorRatio: clamp(ratio, 0.15, 0.85) }),

    toggleSide: (view) => commit({ side: get().side === view ? null : view }),
    showSide: (view) => commit({ side: view }),
    closeSide: () => commit({ side: null }),

    toggle: (key) => commit({ visible: { ...get().visible, [key]: !get().visible[key] } }),
    close: (key) => commit({ visible: { ...get().visible, [key]: false } }),
    open: (key) => commit({ visible: { ...get().visible, [key]: true } }),

    reveal: (target) => {
      if (target === "files" || target === "search" || target === "history") {
        commit({ side: target, phonePane: target });
      } else if (target === "editor") {
        set({ phonePane: "editor" });
      } else {
        commit({ visible: { ...get().visible, [target]: true }, phonePane: target });
      }
    },
    setPhonePane: (pane) => set({ phonePane: pane }),

    reset: () => commit({ ...DEFAULTS, visible: { ...DEFAULTS.visible }, phonePane: "editor" }),
  };
});

/**
 * Side widths after making room for the editor.
 *
 * Every column used to keep its dragged width whatever the window did, so on a
 * 1366px Chromebook with files, changes and the chat all open the editor —
 * the thing the student came to use — was left about 200px. Here the side
 * columns give way first, each in proportion to how far it is above its own
 * floor, until the centre has MIN_CENTER. The saved widths are untouched, so
 * widening the window brings them straight back.
 */
export function fitColumns(
  available: number,
  columns: { width: number; min: number }[],
  minCenter = MIN_CENTER,
): number[] {
  const widths = columns.map((c) => c.width);
  const overflow = widths.reduce((a, b) => a + b, 0) + minCenter - available;
  if (overflow <= 0) return widths;
  const slack = columns.map((c) => Math.max(0, c.width - c.min));
  const totalSlack = slack.reduce((a, b) => a + b, 0);
  if (totalSlack <= 0) return columns.map((c) => c.min);
  const take = Math.min(overflow, totalSlack);
  return columns.map((c, i) => Math.round(c.width - (slack[i] / totalSlack) * take));
}
