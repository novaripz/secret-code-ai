"use client";

import { create } from "zustand";
import localforage from "localforage";
import { accountScope } from "./useAuthStore";
import type { Seed, Video } from "@/app/api/watch/route";

// Saved videos, and the search terms they turn into.
//
// Two things live here because they are the same thing seen twice: the list a
// student sees under "Saved", and the handful of words that list becomes when
// the feed asks what to show them. Keeping the derivation next to the data is
// what lets the UI say out loud where a recommendation came from.
//
// Storage is IndexedDB through localforage, in a store named per account, the
// same way threads are — two students sharing a school laptop must not see
// each other's saves. The whole list is one row rather than a row per video:
// saves are counted in tens, never thousands, and one row means a save is one
// atomic write with no index to fall out of step.

const savedStore = localforage.createInstance({
  name: "ai-code-studio",
  storeName: `watch_saved${accountScope().replace(/[^a-zA-Z0-9]/g, "_")}`,
});

const SAVED_KEY = "__saved_videos__";
/** A cap, so a stuck finger can't grow the row without bound. */
const MAX_SAVED = 200;

/**
 * Everything the Saved tab needs to draw a card without asking YouTube again —
 * which is the point: saved videos still list when the API key is missing, out
 * of quota, or the network is having a bad day.
 */
export interface SavedVideo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  seconds: number | null;
  viewCount: number | null;
  savedAt: number;
}

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
 */
const STOPWORDS = new Set([
  // English function words, plus the ones every video title is made of.
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "how", "what", "why", "when",
  "are", "was", "were", "his", "her", "its", "our", "their", "they", "them", "but", "not", "all",
  "can", "will", "just", "about", "into", "out", "get", "got", "make", "made", "does", "did", "done",
  "video", "videos", "full", "part", "episode", "official", "new", "best", "top", "watch", "free",
  "tutorial", "lesson", "class", "course", "guide", "intro", "introduction", "crash", "review",
  "minutes", "minute", "hour", "hours", "explained", "explain", "learn", "easy", "simple", "quick",
  // Spanish, because plenty of Panda's students are working in it.
  "los", "las", "una", "unos", "unas", "por", "para", "con", "que", "como", "del", "más", "muy",
  "este", "esta", "esto", "son", "ser", "todo", "toda", "sobre", "hacer", "video", "clase",
]);

/** Words that carry meaning in a title: long enough, not numbers, not noise. */
function words(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/**
 * Saved videos in, search terms out. Exported rather than hidden in the store
 * so the rule is readable in one place: two channels at most, one topic word,
 * three terms total, because each one costs a YouTube search.
 */
export function deriveSeeds(saved: SavedVideo[]): Seed[] {
  if (saved.length === 0) return [];

  const seeds: Seed[] = [];

  const byChannel = new Map<string, number>();
  for (const v of saved) {
    if (!v.channel) continue;
    byChannel.set(v.channel, (byChannel.get(v.channel) ?? 0) + 1);
  }

  const channels = [...byChannel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [channel, count] of channels) {
    seeds.push({
      term: channel,
      because: `Because you saved ${count} ${plural(count, "video", "videos")} from ${channel}`,
    });
  }

  // One topic word, and only if it turns up in more than one saved title —
  // a word from a single video is a coincidence, not an interest.
  const byWord = new Map<string, number>();
  for (const v of saved) {
    for (const w of new Set(words(v.title))) byWord.set(w, (byWord.get(w) ?? 0) + 1);
  }

  const [topic] = [...byWord.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (topic && seeds.length < 3) {
    seeds.push({
      term: topic[0],
      because: `Because “${topic[0]}” keeps coming up in the titles you save`,
    });
  }

  return seeds;
}

/**
 * What a student sees before they have saved anything. It is a real search for
 * real study videos, and it says so on every card rather than pretending to be
 * personal.
 */
export const STARTER_SEEDS: Seed[] = [
  { term: "study skills for high school students", because: "A starting point — save a video and this changes" },
  { term: "algebra explained step by step", because: "A starting point — save a video and this changes" },
  { term: "how to write a better essay", because: "A starting point — save a video and this changes" },
];

function toSaved(video: Video): SavedVideo {
  return {
    id: video.id,
    title: video.title,
    channel: video.channel,
    channelId: video.channelId,
    thumbnail: video.thumbnail,
    publishedAt: video.publishedAt,
    seconds: video.seconds,
    viewCount: video.viewCount,
    savedAt: Date.now(),
  };
}

/** Back the other way, so one card component can draw both lists. */
export function toVideo(saved: SavedVideo): Video {
  return { ...saved, because: null };
}

interface WatchState {
  saved: SavedVideo[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  save: (video: Video) => Promise<void>;
  remove: (id: string) => Promise<void>;
  isSaved: (id: string) => boolean;
}

export const useWatchStore = create<WatchState>((set, get) => {
  const persist = async (saved: SavedVideo[]) => {
    set({ saved });
    try {
      await savedStore.setItem(SAVED_KEY, saved);
    } catch {
      // Private mode, or storage full. The tab keeps working; the save just
      // won't survive a reload, which is better than throwing at them.
    }
  };

  return {
    saved: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const stored = await savedStore.getItem<SavedVideo[]>(SAVED_KEY);
        set({ saved: Array.isArray(stored) ? stored : [], hydrated: true });
      } catch {
        set({ saved: [], hydrated: true });
      }
    },

    save: async (video) => {
      const saved = get().saved;
      if (saved.some((v) => v.id === video.id)) return;
      // Newest first: the Saved tab is mostly used to get back to the thing
      // they saved a minute ago.
      await persist([toSaved(video), ...saved].slice(0, MAX_SAVED));
    },

    remove: async (id) => {
      await persist(get().saved.filter((v) => v.id !== id));
    },

    isSaved: (id) => get().saved.some((v) => v.id === id),
  };
});
