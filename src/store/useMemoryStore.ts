"use client";

import { create } from "zustand";
import localforage from "localforage";

// "Working memory" for the AI tutor: a cross-project student profile (facts
// that persist no matter which project is open) and a per-project build log
// (a plain-language running summary of what's been built), plus the
// explain-mode preference. All local to this browser.

const memoryStore = localforage.createInstance({ name: "ai-code-studio", storeName: "memory" });

const PROFILE_KEY = "student-profile";
const SETTINGS_KEY = "settings";
const MAX_PROFILE_FACTS = 40;
const MAX_LOG_ENTRIES = 60;

export interface BuildLogEntry {
  id: string;
  text: string;
  timestamp: number;
}

interface Settings {
  explainMode: boolean;
}

interface MemoryState {
  profileFacts: string[];
  buildLog: BuildLogEntry[];
  explainMode: boolean;
  hydrated: boolean;

  hydrate: (projectId: string) => Promise<void>;
  addProfileFact: (fact: string) => void;
  addBuildLogEntry: (projectId: string, text: string) => void;
  setExplainMode: (on: boolean) => void;

  /** Short text block to hand to the AI: what we know about the student. */
  profileSummary: () => string;
  /** Short text block to hand to the AI: what's been built in this project so far. */
  projectMemorySummary: () => string;
}

let currentProjectId: string | null = null;

async function persistProfile(facts: string[]) {
  await memoryStore.setItem(PROFILE_KEY, facts);
}

async function persistBuildLog(projectId: string, log: BuildLogEntry[]) {
  await memoryStore.setItem(`buildlog:${projectId}`, log);
}

async function persistSettings(settings: Settings) {
  await memoryStore.setItem(SETTINGS_KEY, settings);
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  profileFacts: [],
  buildLog: [],
  explainMode: true,
  hydrated: false,

  hydrate: async (projectId) => {
    currentProjectId = projectId;
    const [facts, log, settings] = await Promise.all([
      memoryStore.getItem<string[]>(PROFILE_KEY),
      memoryStore.getItem<BuildLogEntry[]>(`buildlog:${projectId}`),
      memoryStore.getItem<Settings>(SETTINGS_KEY),
    ]);
    set({
      profileFacts: facts ?? [],
      buildLog: log ?? [],
      explainMode: settings?.explainMode ?? true,
      hydrated: true,
    });
  },

  addProfileFact: (fact) => {
    const trimmed = fact.trim();
    if (!trimmed) return;
    set((s) => {
      if (s.profileFacts.includes(trimmed)) return s;
      const facts = [...s.profileFacts, trimmed].slice(-MAX_PROFILE_FACTS);
      persistProfile(facts);
      return { profileFacts: facts };
    });
  },

  addBuildLogEntry: (projectId, text) => {
    if (!text.trim()) return;
    const entry: BuildLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: text.trim(),
      timestamp: Date.now(),
    };
    set((s) => {
      const buildLog = [...s.buildLog, entry].slice(-MAX_LOG_ENTRIES);
      persistBuildLog(projectId, buildLog);
      return { buildLog };
    });
  },

  setExplainMode: (on) => {
    set({ explainMode: on });
    persistSettings({ explainMode: on });
  },

  profileSummary: () => {
    const facts = get().profileFacts;
    if (facts.length === 0) return "";
    return facts.map((f) => `- ${f}`).join("\n");
  },

  projectMemorySummary: () => {
    const log = get().buildLog;
    if (log.length === 0) return "";
    return log
      .slice(-15)
      .map((e) => `- ${e.text}`)
      .join("\n");
  },
}));

export function currentMemoryProjectId() {
  return currentProjectId;
}
