"use client";

import { create } from "zustand";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";

// The user's identity, preferences, modes, and long-term memory. This is the
// one piece of state that follows them everywhere — chat, the build studio,
// settings — so it lives in localStorage (small, synchronous, no first-paint
// flash for the theme) rather than IndexedDB.

const STORAGE_KEY = "sca:profile:v1";

export type ThemeName = "dark" | "light";

export interface Birthday {
  /** 1-12 */
  month: number | null;
  /** 1-31 */
  day: number | null;
  /** Optional on purpose — plenty of people don't want to share the year. */
  year: number | null;
}

export interface MemoryFact {
  id: string;
  text: string;
  /** Where the fact came from, so Settings can show it honestly. */
  source: "you" | "chat";
  createdAt: number;
}

export interface Profile {
  name: string;
  nickname: string;
  birthday: Birthday;
  /** Free-form things they like: games, sports, music, whatever. */
  likes: string[];
  /** Anything else they want the AI to always know. */
  aboutMe: string;
  /** Profile picture, stored as a data URL. Kept small on the way in. */
  avatar?: string;
}

export interface Modes {
  /** How much explaining, when Explain is on. */
  explainDepth: ExplainDepth;
  /** Plain everyday writing for essays and emails. */
  humanize: boolean;
  /** Homework help: the AI coaches toward the answer instead of handing it over. */
  /** Explanation mode: extra-simple, step-by-step explanations. */
  explainMode: boolean;
  /** AI homie: casual, Gen-Z, chill tone. */
  aiHomie: boolean;
}

export interface ProfileState {
  hydrated: boolean;
  onboarded: boolean;
  theme: ThemeName;
  profile: Profile;
  modes: Modes;
  memory: MemoryFact[];

  hydrate: () => void;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setModes: (patch: Partial<Modes>) => void;
  completeOnboarding: (profile: Partial<Profile>) => void;
  resetOnboarding: () => void;

  addLike: (like: string) => void;
  removeLike: (like: string) => void;

  addMemory: (text: string, source?: MemoryFact["source"]) => void;
  removeMemory: (id: string) => void;
  clearMemory: () => void;

  /** What to call them in the UI and in chat. */
  displayName: () => string;
  /** Their age in years, or null when we don't have a birth year. */
  age: () => number | null;
  /** Compact text block handed to the AI on every request. */
  memoryBlock: () => string;
}

const EMPTY_PROFILE: Profile = {
  name: "",
  nickname: "",
  birthday: { month: null, day: null, year: null },
  likes: [],
  aboutMe: "",
};

const DEFAULT_MODES: Modes = {
  explainDepth: "normal",
  humanize: false,
  explainMode: true,
  aiHomie: false,
};

interface Persisted {
  onboarded: boolean;
  theme: ThemeName;
  profile: Profile;
  modes: Modes;
  memory: MemoryFact[];
}

function readPersisted(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writePersisted(state: ProfileState) {
  if (typeof window === "undefined") return;
  const payload: Persisted = {
    onboarded: state.onboarded,
    theme: state.theme,
    profile: state.profile,
    modes: state.modes,
    memory: state.memory,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked (private mode) — the app still works, it just forgets.
  }
}

function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useProfileStore = create<ProfileState>((set, get) => {
  /** Save after a mutation, then hand the patch back to zustand. */
  const commit = (patch: Partial<ProfileState>) => {
    set(patch);
    writePersisted(get());
  };

  return {
    hydrated: false,
    onboarded: false,
    theme: "dark",
    profile: EMPTY_PROFILE,
    modes: DEFAULT_MODES,
    memory: [],

    hydrate: () => {
      if (get().hydrated) return;
      const saved = readPersisted();
      const theme = saved.theme === "light" ? "light" : "dark";
      applyTheme(theme);
      set({
        hydrated: true,
        onboarded: saved.onboarded === true,
        theme,
        profile: { ...EMPTY_PROFILE, ...(saved.profile ?? {}), birthday: { ...EMPTY_PROFILE.birthday, ...(saved.profile?.birthday ?? {}) } },
        modes: { ...DEFAULT_MODES, ...(saved.modes ?? {}) },
        memory: Array.isArray(saved.memory) ? saved.memory : [],
      });
    },

    setTheme: (theme) => {
      applyTheme(theme);
      commit({ theme });
    },

    toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

    updateProfile: (patch) => commit({ profile: { ...get().profile, ...patch } }),

    setModes: (patch) => commit({ modes: { ...get().modes, ...patch } }),

    completeOnboarding: (profile) =>
      commit({ onboarded: true, profile: { ...get().profile, ...profile } }),

    resetOnboarding: () => commit({ onboarded: false }),

    addLike: (like) => {
      const trimmed = like.trim();
      if (!trimmed) return;
      const likes = get().profile.likes;
      if (likes.some((l) => l.toLowerCase() === trimmed.toLowerCase())) return;
      commit({ profile: { ...get().profile, likes: [...likes, trimmed] } });
    },

    removeLike: (like) =>
      commit({ profile: { ...get().profile, likes: get().profile.likes.filter((l) => l !== like) } }),

    addMemory: (text, source = "you") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (get().memory.some((m) => m.text.toLowerCase() === trimmed.toLowerCase())) return;
      const fact: MemoryFact = { id: newId(), text: trimmed, source, createdAt: Date.now() };
      commit({ memory: [...get().memory, fact].slice(-100) });
    },

    removeMemory: (id) => commit({ memory: get().memory.filter((m) => m.id !== id) }),

    clearMemory: () => commit({ memory: [] }),

    displayName: () => {
      const { nickname, name } = get().profile;
      return (nickname.trim() || name.trim().split(/\s+/)[0] || "").trim();
    },

    age: () => {
      const { month, day, year } = get().profile.birthday;
      if (!year) return null;
      const now = new Date();
      let years = now.getFullYear() - year;
      const m = (month ?? 1) - 1;
      const d = day ?? 1;
      if (now.getMonth() < m || (now.getMonth() === m && now.getDate() < d)) years -= 1;
      return years >= 0 && years < 130 ? years : null;
    },

    memoryBlock: () => {
      const { profile, memory } = get();
      const age = get().age();
      const lines: string[] = [];
      if (profile.name) lines.push(`Name: ${profile.name}`);
      if (profile.nickname) lines.push(`Goes by: ${profile.nickname}`);
      if (age !== null) lines.push(`Age: ${age}`);
      if (profile.birthday.month && profile.birthday.day) {
        lines.push(`Birthday: ${profile.birthday.month}/${profile.birthday.day}`);
      }
      if (profile.likes.length) lines.push(`Into: ${profile.likes.join(", ")}`);
      if (profile.aboutMe.trim()) lines.push(`About them: ${profile.aboutMe.trim()}`);
      for (const fact of memory.slice(-40)) lines.push(`Remembered: ${fact.text}`);
      return lines.join("\n");
    },
  };
});
