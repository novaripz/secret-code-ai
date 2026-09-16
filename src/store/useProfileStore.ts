"use client";

import { create } from "zustand";
import { accountScope, useAuthStore } from "./useAuthStore";
import type { BuildEffort, ExplainDepth } from "@/lib/ai/systemPrompt";
import { DEFAULT_LOCALE, findLocale } from "@/lib/i18n/locales";

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

/**
 * More than two colours, because "dark or light" is not the only preference a
 * student has. Each name here maps to a complete token set in globals.css;
 * THEMES is the single list the picker, the store's validation and the
 * before-paint script in layout.tsx all read from, so adding a palette is one
 * edit rather than four.
 */
export const THEMES = ["dark", "light", "ocean", "forest", "sepia"] as const;
export type Theme = (typeof THEMES)[number];
export type ThemeName = Theme | "system";

/** Dark-family themes, for the few places that need light-or-dark rather than a
 *  palette name (an embedded editor, a preview frame). */
const DARK_THEMES = new Set<string>(["dark", "ocean", "forest"]);

export function isDarkTheme(theme: ThemeName): boolean {
  if (theme !== "system") return DARK_THEMES.has(theme);
  if (typeof window === "undefined") return true;
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

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

/**
 * What the student can turn on themselves.
 *
 * Humanize and Chill mode used to live here and are gone. A saved profile from
 * before the removal still has those keys in localStorage, which is fine and
 * deliberately not migrated away: `hydrate` spreads the saved object over
 * DEFAULT_MODES, so an unknown key is carried as dead weight on an object
 * nothing reads, while every key that still means something falls back to its
 * default. The student lands in the default voice rather than in a mode that no
 * longer exists — no crash, no stuck state, and nothing to clean up on disk.
 */
export interface Modes {
  /** How much explaining, when Explain is on. */
  explainDepth: ExplainDepth;
  /** Explanation mode: extra-simple, step-by-step explanations. */
  explainMode: boolean;
  /**
   * How hard Panda works in the build studio. Deliberately separate from
   * explainDepth even though they share their five words: one is about how much
   * project gets built, the other about how much prose explains it, and a
   * student who wants a big build with a short note is not confused.
   */
  buildEffort: BuildEffort;
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
  explainMode: true,
  buildEffort: "normal",
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
function resolveTheme(theme: ThemeName): Theme {
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
      // Nobody who has never chosen gets overruled: no saved theme means
      // "system", which follows prefers-color-scheme and matches what the
      // before-paint script in layout.tsx already put on <html>. Anything
      // unrecognised (an older build, a hand-edited key) falls back to dark
      // rather than leaving <html> with a data-theme nothing styles.
      const theme: ThemeName =
        saved.theme === undefined
          ? "system"
          : saved.theme === "system" || (THEMES as readonly string[]).includes(saved.theme)
            ? saved.theme
            : "dark";
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

    // The top-bar switch is still a two-way light/dark flip; from a palette
    // theme it lands on the plain opposite of whatever that palette reads as.
    toggleTheme: () => get().setTheme(isDarkTheme(get().theme) ? "light" : "dark"),

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

    /**
     * Everything Panda is told about who it is talking to.
     *
     * The account email and the language settings are in here for one reason:
     * the app already shows them on the settings screen, so a student asking
     * "what's my email" and hearing "I don't know" does not read as privacy,
     * it reads as the memory feature being fake. Nothing new is collected and
     * nothing leaves the device that was not already on it — this is the same
     * profile the student is looking at, handed to the assistant that is
     * supposed to know them. The email comes from the signed-in account rather
     * than from anything typed, so a guest simply has no line for it.
     */
    memoryBlock: () => {
      const { profile, memory, languages } = get();
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
      const email = useAuthStore.getState().account?.email;
      if (email) lines.push(`Signed in as: ${email}`);
      const ui = findLocale(languages.interface);
      if (ui) lines.push(`App language: ${ui.englishName}`);
      // "auto" is not a language and saying so is more useful than resolving it
      // silently: it tells Panda the student has expressed no preference, which
      // is exactly when following the language they write in matters most.
      const reply = languages.reply === "auto" ? ui : findLocale(languages.reply);
      if (reply) {
        lines.push(
          languages.reply === "auto"
            ? `Answers in: ${reply.englishName} (following the app language; they have not set one)`
            : `Answers in: ${reply.englishName} (their own choice)`,
        );
      }
      for (const fact of memory.slice(-40)) lines.push(`Remembered: ${fact.text}`);
      return lines.join("\n");
    },
  };
});
