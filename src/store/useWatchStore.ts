"use client";

import { create } from "zustand";
import localforage from "localforage";
import { accountScope } from "./useAuthStore";
import {
  addRecent,
  addSaved,
  recordPlay,
  recordProgress,
  type HistoryEntry,
  type SavedVideo,
} from "@/lib/watch/library";
import { STARTER_TERMS, titleWords } from "@/lib/watch/query";
import type { Video } from "@/lib/watch/types";

export type { HistoryEntry, SavedVideo } from "@/lib/watch/library";
export { toVideo } from "@/lib/watch/library";

// The student's own corner of Watch: Watch later, History, Continue watching
// and recent searches. None of it costs a single unit of YouTube quota, and
// none of it leaves the device.
//
// Storage is IndexedDB through localforage, in a store named per account, the
// same way threads are — two students sharing a school laptop must not see
// each other's saves or history. Each list is one row rather than a row per
// video: they are counted in tens or a couple of hundred, and one row means a
// change is one atomic write with no index to fall out of step.
//
// Watch later is the list that used to be called "Saved". It keeps the same
// store and the same key, so everything a student saved before is still there.

const savedStore = localforage.createInstance({
  name: "ai-code-studio",
  storeName: `watch_saved${accountScope().replace(/[^a-zA-Z0-9]/g, "_")}`,
});

const SAVED_KEY = "__saved_videos__";
const HISTORY_KEY = "__watch_history__";
const PAUSED_KEY = "__watch_history_paused__";
const RECENT_KEY = "__watch_recent_searches__";

/**
 * How the feed is built, in full:
 *
 * Count the channels in what they saved, take the two that come up most, and
 * search YouTube for those channel names. Then take the words that repeat
 * across the saved titles — minus the ones every title has — and search for the
 * most common one. That is the whole mechanism. It is keyword matching against
 * YouTube's own search, not a model of anybody's taste, and the UI says so in
 * those words. The upside of it being this plain is that every card can carry
 * a true sentence about why it is there.
 *
 * The sentence itself is written by the page, in the student's language, from
 * the `reason` here.
 */
export type SeedReason =
  | { kind: "channel"; channel: string; count: number }
  | { kind: "word"; word: string }
  | { kind: "starter" };

export interface SeedPlan {
  term: string;
  reason: SeedReason;
}

/**
 * Saved videos in, search terms out. Two channels at most, one topic word,
 * three terms total, because each one can cost a YouTube search.
 */
export function deriveSeeds(saved: SavedVideo[]): SeedPlan[] {
  if (saved.length === 0) return [];

  const seeds: SeedPlan[] = [];

  const byChannel = new Map<string, number>();
  for (const v of saved) {
    if (!v.channel) continue;
    byChannel.set(v.channel, (byChannel.get(v.channel) ?? 0) + 1);
  }

  const channels = [...byChannel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [channel, count] of channels) {
    seeds.push({ term: channel, reason: { kind: "channel", channel, count } });
  }

  // One topic word, and only if it turns up in more than one saved title —
  // a word from a single video is a coincidence, not an interest.
  const byWord = new Map<string, number>();
  for (const v of saved) {
    for (const w of new Set(titleWords(v.title))) byWord.set(w, (byWord.get(w) ?? 0) + 1);
  }

  const [topic] = [...byWord.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (topic && seeds.length < 3) seeds.push({ term: topic[0], reason: { kind: "word", word: topic[0] } });

  return seeds;
}

/**
 * What a student sees before they have saved anything. Real searches for real
 * study videos, the same for every student (so the server keeps them for most
 * of a day), and labelled as exactly that on every card.
 */
export const STARTER_SEEDS: SeedPlan[] = STARTER_TERMS.map((term) => ({ term, reason: { kind: "starter" } }));

interface WatchState {
  saved: SavedVideo[];
  history: HistoryEntry[];
  historyPaused: boolean;
  recent: string[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  save: (video: Video) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Saves or un-saves, and says which it did, for the toast. */
  toggleSaved: (video: Video) => Promise<"saved" | "removed">;
  isSaved: (id: string) => boolean;

  /** Called once a video actually starts playing. */
  recordPlay: (video: Video) => void;
  /** Called every few seconds while it plays, and once more on the way out. */
  recordProgress: (id: string, position: number, duration: number | null) => void;
  removeFromHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  setHistoryPaused: (paused: boolean) => Promise<void>;

  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}

async function write(key: string, value: unknown) {
  try {
    await savedStore.setItem(key, value);
  } catch {
    // Private mode, or storage full. The tab keeps working; the change just
    // won't survive a reload, which is better than throwing at them.
  }
}

// Progress arrives every few seconds while a video plays. Writing the whole
// history row to IndexedDB that often is wasted work, so the writes are
// gathered up and flushed a few seconds later (and on the way off the page).
let historyTimer: ReturnType<typeof setTimeout> | null = null;

export const useWatchStore = create<WatchState>((set, get) => {
  const persistSaved = async (saved: SavedVideo[]) => {
    set({ saved });
    await write(SAVED_KEY, saved);
  };

  const persistHistory = (history: HistoryEntry[], soon = false) => {
    set({ history });
    if (historyTimer) clearTimeout(historyTimer);
    if (!soon) {
      historyTimer = null;
      return write(HISTORY_KEY, history);
    }
    historyTimer = setTimeout(() => {
      historyTimer = null;
      void write(HISTORY_KEY, get().history);
    }, 4_000);
    return Promise.resolve();
  };

  return {
    saved: [],
    history: [],
    historyPaused: false,
    recent: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const [saved, history, paused, recent] = await Promise.all([
          savedStore.getItem<SavedVideo[]>(SAVED_KEY),
          savedStore.getItem<HistoryEntry[]>(HISTORY_KEY),
          savedStore.getItem<boolean>(PAUSED_KEY),
          savedStore.getItem<string[]>(RECENT_KEY),
        ]);
        set({
          saved: Array.isArray(saved) ? saved : [],
          history: Array.isArray(history) ? history : [],
          historyPaused: paused === true,
          recent: Array.isArray(recent) ? recent.filter((r) => typeof r === "string") : [],
          hydrated: true,
        });
      } catch {
        set({ hydrated: true });
      }
    },

    save: async (video) => {
      const next = addSaved(get().saved, video);
      if (next !== get().saved) await persistSaved(next);
    },

    remove: async (id) => {
      await persistSaved(get().saved.filter((v) => v.id !== id));
    },

    toggleSaved: async (video) => {
      if (get().saved.some((v) => v.id === video.id)) {
        await get().remove(video.id);
        return "removed";
      }
      await get().save(video);
      return "saved";
    },

    isSaved: (id) => get().saved.some((v) => v.id === id),

    recordPlay: (video) => {
      if (get().historyPaused) return;
      void persistHistory(recordPlay(get().history, video));
    },

    recordProgress: (id, position, duration) => {
      if (get().historyPaused) return;
      const next = recordProgress(get().history, id, position, duration);
      if (next !== get().history) void persistHistory(next, true);
    },

    removeFromHistory: async (id) => {
      await persistHistory(get().history.filter((h) => h.id !== id));
    },

    clearHistory: async () => {
      await persistHistory([]);
    },

    setHistoryPaused: async (paused) => {
      set({ historyPaused: paused });
      await write(PAUSED_KEY, paused);
    },

    addRecentSearch: (query) => {
      const recent = addRecent(get().recent, query);
      if (recent === get().recent) return;
      set({ recent });
      void write(RECENT_KEY, recent);
    },

    removeRecentSearch: (query) => {
      const recent = get().recent.filter((r) => r !== query);
      set({ recent });
      void write(RECENT_KEY, recent);
    },

    clearRecentSearches: () => {
      set({ recent: [] });
      void write(RECENT_KEY, []);
    },
  };
});

/** Writes any progress still waiting, e.g. when the watch page unmounts. */
export function flushWatchHistory() {
  if (!historyTimer) return;
  clearTimeout(historyTimer);
  historyTimer = null;
  void write(HISTORY_KEY, useWatchStore.getState().history);
}
