"use client";

// The workspace's window events, named in one place.
//
// Panes talk to each other through these rather than through props threaded
// down from the Workspace: the editor owns Monaco, the agent panel owns its
// composer, the preview owns its frame, and each listens for the requests only
// it can carry out. They used to be string literals at every call site, which
// is how a typo becomes a button that silently does nothing.

export const WORKSPACE_EVENTS = {
  /** Open the command palette, optionally in a mode. */
  openPalette: "panda:open-palette",
  /** Run a built-in Monaco action by id. */
  editorAction: "panda:editor-action",
  /** "Ask Panda about / to fix" the current selection. */
  askSelection: "panda:ask-selection",
  /** Prefill the agent's composer. See askPanda.ts. */
  ask: "panda:ask",
  focusComposer: "panda:focus-composer",
  /** Open a file and put the cursor on a line (and select a match, if given). */
  reveal: "panda:reveal",
  /** Show a file or folder in the Files view: expand to it and scroll it into sight. */
  revealInTree: "panda:reveal-in-tree",
  /** Open Find in files, optionally with a query to start from. */
  findInFiles: "panda:find-in-files",
  /** Rebuild and rerun the preview now. */
  runPreview: "panda:run-preview",
  /** Switch the preview pane to one of its tabs ("preview", "console", "problems"). */
  showPreviewTab: "panda:preview-tab",
  openSettings: "panda:open-settings",
  openShortcuts: "panda:open-shortcuts",
} as const;

export interface RevealDetail {
  path: string;
  line?: number;
  col?: number;
  /** Characters to select from `col`, for a search match. */
  length?: number;
}

export function emit<T>(name: string, detail?: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Is the student typing somewhere a single-key shortcut would get in the way? */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.isContentEditable) return true;
  if (el.closest(".monaco-editor")) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** "Ctrl" or "⌘", for shortcut hints that say what is printed on the student's own keyboard. */
export function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}
