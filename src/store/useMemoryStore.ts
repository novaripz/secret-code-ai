"use client";

import { create } from "zustand";
import localforage from "localforage";
import { accountScope } from "./useAuthStore";

// Per-project "working memory" for the AI: a plain-language running summary of
// what's been built. The user's own profile, modes, and cross-project memory
// live in useProfileStore — this is only ever about one project.

/**
 * One object store per account, matching useAssistantStore and useWatchStore.
 *
 * This module used to skip scoping entirely: PROFILE_KEY and `buildlog:<id>`
 * were bare keys in a shared "memory" store, so on a classroom machine the
 * next student to sign in inherited the previous one's build log — and that
 * log is not inert data, it is handed to the model as `projectMemory` (see
 * ChatPanel and AgentPanel), so Panda would cheerfully describe one student's
 * project to another. Scoping the store rather than each key fixes both
 * PROFILE_KEY and every buildlog key in one place, and leaves the key names
 * themselves readable.
 *
 * Exported so a check can assert two accounts never share a store without
 * standing up IndexedDB. Sanitised for the same reason as in lib/storage.ts:
 * this becomes an IndexedDB object-store name.
 */
export function memoryStoreName(scope: string): string {
  return `memory${scope.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * Existing build logs are not migrated, for the same reasons set out at length
 * in lib/storage.ts: accountScope() is "" for a guest, so memoryStoreName("")
 * is still the original "memory" store and a room where nobody signs in sees
 * no change at all. Moving the old store into whichever account signs in first
 * would hand one student the class's pooled memory under their own name, which
 * is the leak rather than a fix, and deleting it would destroy work. Nothing
 * here removes or rewrites the legacy store; signing out reaches it.
 */
const memoryStore = localforage.createInstance({
  name: "ai-code-studio",
  // Read once at module load; useAuthStore.adopt() reloads the page when the
  // scope changes, so this never goes stale mid-session.
  storeName: memoryStoreName(accountScope()),
});

const PROFILE_KEY = "student-profile";
const MAX_PROFILE_FACTS = 40;
const MAX_LOG_ENTRIES = 60;

export interface BuildLogEntry {
  id: string;
  text: string;
  timestamp: number;
}

interface MemoryState {
  profileFacts: string[];
  buildLog: BuildLogEntry[];
  hydrated: boolean;

  hydrate: (projectId: string) => Promise<void>;
  addProfileFact: (fact: string) => void;
  addBuildLogEntry: (projectId: string, text: string) => void;

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

export const useMemoryStore = create<MemoryState>((set, get) => ({
  profileFacts: [],
  buildLog: [],
  hydrated: false,

  hydrate: async (projectId) => {
    currentProjectId = projectId;
    const [facts, log] = await Promise.all([
      memoryStore.getItem<string[]>(PROFILE_KEY),
      memoryStore.getItem<BuildLogEntry[]>(`buildlog:${projectId}`),
    ]);
    set({ profileFacts: facts ?? [], buildLog: log ?? [], hydrated: true });
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
