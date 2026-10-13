"use client";

import { create } from "zustand";

// How the student likes their editor and their preview, remembered.
//
// localStorage for the same reasons as the pane layout: tiny, synchronous, and
// back on the first frame. A setting that resets on every reload is a setting
// a student stops bothering to change — and the two that matter most here
// (a bigger font on a projector, word wrap on a phone) are exactly the ones
// people set once and expect to stay set.

const STORAGE_KEY = "panda:editor:v1";

export type DevicePreset = "phone" | "tablet" | "desktop";

/** The widths the preview frame takes for each preset. Desktop fills the pane. */
export const DEVICE_WIDTH: Record<DevicePreset, number | null> = {
  phone: 390,
  tablet: 768,
  desktop: null,
};

export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22] as const;
export const TAB_SIZES = [2, 4] as const;

export interface EditorSettings {
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  tabSize: number;
  /** Rebuild the preview a moment after typing stops. Off means "only when I press Run". */
  autoRun: boolean;
  device: DevicePreset;
}

const DEFAULTS: EditorSettings = {
  fontSize: 14,
  // Off by default because code is written in lines; the phone layout turns it
  // on for itself (see CodeEditor), since horizontal scrolling inside a 360px
  // pane is how a student loses their place entirely.
  wordWrap: false,
  minimap: false,
  tabSize: 2,
  autoRun: true,
  device: "desktop",
};

function read(): EditorSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<EditorSettings>;
    return {
      fontSize: (FONT_SIZES as readonly number[]).includes(Number(saved.fontSize)) ? Number(saved.fontSize) : DEFAULTS.fontSize,
      wordWrap: typeof saved.wordWrap === "boolean" ? saved.wordWrap : DEFAULTS.wordWrap,
      minimap: typeof saved.minimap === "boolean" ? saved.minimap : DEFAULTS.minimap,
      tabSize: (TAB_SIZES as readonly number[]).includes(Number(saved.tabSize)) ? Number(saved.tabSize) : DEFAULTS.tabSize,
      autoRun: typeof saved.autoRun === "boolean" ? saved.autoRun : DEFAULTS.autoRun,
      device: saved.device === "phone" || saved.device === "tablet" || saved.device === "desktop" ? saved.device : DEFAULTS.device,
    };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState extends EditorSettings {
  update: (patch: Partial<EditorSettings>) => void;
  reset: () => void;
}

export const useEditorSettings = create<SettingsState>((set, get) => {
  const commit = (patch: Partial<EditorSettings>) => {
    set(patch);
    const { fontSize, wordWrap, minimap, tabSize, autoRun, device } = get();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize, wordWrap, minimap, tabSize, autoRun, device }));
    } catch {
      // Private browsing or a full quota: the setting works until reload.
    }
  };
  return {
    ...read(),
    update: commit,
    reset: () => commit({ ...DEFAULTS }),
  };
});
