"use client";

import { create } from "zustand";
import { accountScope } from "./useAuthStore";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// The user's identity, preferences, modes, and long-term memory. This is the
// one piece of state that follows them everywhere — chat, the build studio,
// settings — so it lives in localStorage (small, synchronous, no first-paint
// flash for the theme) rather than IndexedDB.

const STORAGE_KEY_BASE = "sca:profile:v1";

/**
 * Storage key for whoever is signed in. Signed out keeps the original key, so
 * anyone who never signs in keeps everything they already had.
 */
function storageKey() {
  return STORAGE_KEY_BASE + accountScope();
}

export type ThemeName = "dark" | "light" | "system";

/** Body text scale for the chat, for anyone who wants it bigger or tighter. */
export type TextSize = "small" | "normal" | "large";

export interface Languages {
  /** The language the interface is drawn in. */
  interface: string;
  /**
   * The language Panda answers in. "auto" follows the interface, which is what
   * most people want; setting it separately is for someone who wants the app in
   * Spanish but answers in English, or the reverse while learning.
   */
  reply: string | "auto";
}

const DEFAULT_LANGUAGES: Languages = { interface: DEFAULT_LOCALE, reply: "auto" };

export interface Appearance {
  textSize: TextSize;
  /** Honours the OS setting by default; this turns it on regardless. */
  reduceMotion: boolean;
  /** The mascot's idle movement. Off leaves it perfectly still. */
  pandaMotion: boolean;
}

const DEFAULT_APPEARANCE: Appearance = { textSize: "normal", pandaMotion: true, reduceMotion: false };

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
  appearance: Appearance;
  languages: Languages;
  profile: Profile;
  modes: Modes;
  memory: MemoryFact[];

  hydrate: () => void;
  setLanguages: (patch: Partial<Languages>) => void;
  setTheme: (theme: ThemeName) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
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
  appearance: Appearance;
  languages: Languages;
  profile: Profile;
  modes: Modes;
  memory: MemoryFact[];
}

function readPersisted(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey());
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
    appearance: state.appearance,
    languages: state.languages,
    profile: state.profile,
    modes: state.modes,
    memory: state.memory,
  };
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch {
    // Storage full or blocked (private mode) — the app still works, it just forgets.
  }
}

/** "system" has no stored colour of its own; it follows the OS setting. */
function resolveTheme(theme: ThemeName): "dark" | "light" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.textSize = a.textSize;
  document.documentElement.dataset.pandaMotion = a.pandaMotion ? "on" : "off";
  document.documentElement.dataset.reduceMotion = a.reduceMotion ? "on" : "off";
}

function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(theme);
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
    appearance: DEFAULT_APPEARANCE,
    languages: DEFAULT_LANGUAGES,
    profile: EMPTY_PROFILE,
    modes: DEFAULT_MODES,
    memory: [],

    hydrate: () => {
      if (get().hydrated) return;
      const saved = readPersisted();
      const theme: ThemeName =
        saved.theme === "light" || saved.theme === "system" ? saved.theme : "dark";
      const appearance = { ...DEFAULT_APPEARANCE, ...(saved.appearance ?? {}) };
      applyTheme(theme);
      applyAppearance(appearance);
      set({
        hydrated: true,
        onboarded: saved.onboarded === true,
        theme,
        appearance,
        languages: { ...DEFAULT_LANGUAGES, ...(saved.languages ?? {}) },
        profile: { ...EMPTY_PROFILE, ...(saved.profile ?? {}), birthday: { ...EMPTY_PROFILE.birthday, ...(saved.profile?.birthday ?? {}) } },
        modes: { ...DEFAULT_MODES, ...(saved.modes ?? {}) },
        memory: Array.isArray(saved.memory) ? saved.memory : [],
      });
    },

    setTheme: (theme) => {
      applyTheme(theme);
      commit({ theme });
    },

    toggleTheme: () => get().setTheme(resolveTheme(get().theme) === "dark" ? "light" : "dark"),

    setLanguages: (patch) => commit({ languages: { ...get().languages, ...patch } }),

    setAppearance: (patch) => {
      const appearance = { ...get().appearance, ...patch };
      applyAppearance(appearance);
      commit({ appearance });
    },

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
