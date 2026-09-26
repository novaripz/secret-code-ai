"use client";

import { create } from "zustand";

export type DockId = "left" | "center" | "right" | "bottom";

export interface DockState {
  panels: string[];
  active?: string;
  size: number;
  collapsed: boolean;
}

export type Layout = Record<DockId, DockState>;

export const DEFAULT_LAYOUT: Layout = {
  left: { panels: ["files", "hierarchy", "assets"], active: "files", size: 272, collapsed: false },
  center: { panels: ["editor", "preview", "ui-editor", "viewport", "history", "forge", "export", "settings"], active: "editor", size: 0, collapsed: false },
  right: { panels: ["agent"], active: "agent", size: 440, collapsed: false },
  bottom: { panels: ["checks", "terminal", "logs", "tests"], active: "checks", size: 230, collapsed: false },
};

const LIMITS: Record<DockId, [number, number]> = { left: [200, 560], right: [320, 760], bottom: [120, 640], center: [0, 0] };
const KEY = "rb-layout-v2";

function load(): Layout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_LAYOUT);
    const parsed = JSON.parse(raw) as Layout;
    // Panels added in newer versions appear in their default dock.
    const known = new Set(Object.values(parsed).flatMap((d) => d.panels));
    for (const [dock, def] of Object.entries(DEFAULT_LAYOUT) as [DockId, DockState][]) {
      for (const p of def.panels) if (!known.has(p)) parsed[dock].panels.push(p);
    }
    return parsed;
  } catch {
    return structuredClone(DEFAULT_LAYOUT);
  }
}

function persist(l: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* layout is a per-viewer convenience */
  }
}

interface LayoutStore {
  layout: Layout;
  hydrated: boolean;
  hydrate(): void;
  setActive(dock: DockId, panel: string): void;
  toggle(dock: DockId, open?: boolean): void;
  resize(dock: DockId, size: number): void;
  move(panel: string, to: DockId, index?: number): void;
  open(panel: string): void;
  close(panel: string): void;
  reset(): void;
}

function update(set: (fn: (s: LayoutStore) => Partial<LayoutStore>) => void, fn: (l: Layout) => void) {
  set((s) => {
    const next = structuredClone(s.layout);
    fn(next);
    persist(next);
    return { layout: next };
  });
}

export const useLayout = create<LayoutStore>((set, get) => ({
  layout: structuredClone(DEFAULT_LAYOUT),
  hydrated: false,
  hydrate() {
    if (get().hydrated) return;
    set({ layout: load(), hydrated: true });
  },
  setActive(dock, panel) {
    update(set, (l) => {
      l[dock].active = panel;
      l[dock].collapsed = false;
    });
  },
  toggle(dock, open) {
    update(set, (l) => {
      l[dock].collapsed = open === undefined ? !l[dock].collapsed : !open;
    });
  },
  resize(dock, size) {
    const [min, max] = LIMITS[dock];
    update(set, (l) => {
      l[dock].size = Math.round(Math.max(min, Math.min(max, size)));
    });
  },
  move(panel, to, index) {
    update(set, (l) => {
      for (const d of Object.values(l)) {
        const i = d.panels.indexOf(panel);
        if (i >= 0) {
          d.panels.splice(i, 1);
          if (d.active === panel) d.active = d.panels[Math.max(0, i - 1)];
        }
      }
      const dest = l[to];
      dest.panels.splice(index ?? dest.panels.length, 0, panel);
      dest.active = panel;
      dest.collapsed = false;
    });
  },
  open(panel) {
    update(set, (l) => {
      const dock = (Object.keys(l) as DockId[]).find((d) => l[d].panels.includes(panel));
      if (dock) {
        l[dock].active = panel;
        l[dock].collapsed = false;
        return;
      }
      const home = (Object.keys(DEFAULT_LAYOUT) as DockId[]).find((d) => DEFAULT_LAYOUT[d].panels.includes(panel)) ?? "center";
      l[home].panels.push(panel);
      l[home].active = panel;
      l[home].collapsed = false;
    });
  },
  close(panel) {
    update(set, (l) => {
      for (const d of Object.values(l)) {
        const i = d.panels.indexOf(panel);
        if (i >= 0) {
          d.panels.splice(i, 1);
          if (d.active === panel) d.active = d.panels[Math.max(0, i - 1)];
        }
      }
    });
  },
  reset() {
    const l = structuredClone(DEFAULT_LAYOUT);
    persist(l);
    set({ layout: l });
  },
}));
