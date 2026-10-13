// The rules behind Watch later, History and Continue watching.
//
// All three live on the student's own device and cost no quota. The functions
// here are pure — list in, list out — so the store can stay a thin layer over
// IndexedDB and the checks can hold the numbers that matter: what counts as
// "started", what counts as "finished", and how long the lists may grow.

import type { Video } from "./types";

/**
 * Everything a library card needs to draw without asking YouTube again — which
 * is the point: saved and watched videos still list when the key is missing,
 * out of quota, or the network is having a bad day.
 *
 * The name and the fields up to `savedAt` are the shape Watch has always saved
 * under; the optional ones were added later and older rows simply lack them.
 */
export interface SavedVideo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  thumbnailHigh?: string;
  thumbnailMax?: string;
  publishedAt: string;
  seconds: number | null;
  viewCount: number | null;
  captions?: boolean;
  savedAt: number;
}

export interface HistoryEntry extends Omit<SavedVideo, "savedAt"> {
  /** When it was last opened, for ordering. */
  watchedAt: number;
  /** Where they got to, in seconds, from the player's own reports. */
  position: number;
}

export const MAX_SAVED = 200;
export const MAX_HISTORY = 200;
export const MAX_RECENT = 8;

/** Under this, they only peeked; it is not worth offering to resume. */
export const RESUME_AFTER = 30;
/** Past this share of the length, they have watched it; resuming would show the outro. */
export const DONE_FRACTION = 0.9;

function card(video: Video | SavedVideo | HistoryEntry) {
  return {
    id: video.id,
    title: video.title,
    channel: video.channel,
    channelId: video.channelId,
    thumbnail: video.thumbnail,
    thumbnailHigh: video.thumbnailHigh,
    thumbnailMax: video.thumbnailMax,
    publishedAt: video.publishedAt,
    seconds: video.seconds,
    viewCount: video.viewCount,
    captions: video.captions,
  };
}

export function toSaved(video: Video | SavedVideo | HistoryEntry, now = Date.now()): SavedVideo {
  return { ...card(video), savedAt: now };
}

/** Back the other way, so one card component can draw every list. */
export function toVideo(item: SavedVideo | HistoryEntry): Video {
  return { ...card(item), because: null };
}

/** Newest first, no duplicates, capped: the shape of every library list. */
export function addSaved(saved: SavedVideo[], video: Video, now = Date.now()): SavedVideo[] {
  if (saved.some((v) => v.id === video.id)) return saved;
  return [toSaved(video, now), ...saved].slice(0, MAX_SAVED);
}

/**
 * Opening a video moves it to the top of History. The position it reached
 * last time is kept, so opening it again is what offers the resume.
 */
export function recordPlay(history: HistoryEntry[], video: Video | HistoryEntry, now = Date.now()): HistoryEntry[] {
  const previous = history.find((h) => h.id === video.id);
  const entry: HistoryEntry = { ...card(video), watchedAt: now, position: previous?.position ?? 0 };
  return [entry, ...history.filter((h) => h.id !== video.id)].slice(0, MAX_HISTORY);
}

/**
 * Where the player got to. The length the player reports wins over the one
 * from the API, which is rounded and missing for some older rows.
 */
export function recordProgress(
  history: HistoryEntry[],
  id: string,
  position: number,
  duration: number | null,
): HistoryEntry[] {
  let changed = false;
  const next = history.map((h) => {
    if (h.id !== id) return h;
    const seconds = duration && duration > 0 ? Math.round(duration) : h.seconds;
    const at = Math.max(0, Math.floor(position));
    if (at === h.position && seconds === h.seconds) return h;
    changed = true;
    return { ...h, position: at, seconds };
  });
  return changed ? next : history;
}

/** Started properly but not finished. */
export function isResumable(entry: { position: number; seconds: number | null }): boolean {
  if (entry.position < RESUME_AFTER) return false;
  if (!entry.seconds || entry.seconds <= 0) return true;
  return entry.position < entry.seconds * DONE_FRACTION;
}

/** 0..1 for a progress bar, or null when there is nothing honest to draw. */
export function progressOf(entry: { position: number; seconds: number | null } | undefined): number | null {
  if (!entry || !entry.seconds || entry.seconds <= 0 || entry.position <= 0) return null;
  return Math.min(1, entry.position / entry.seconds);
}

export function continueWatching(history: HistoryEntry[]): HistoryEntry[] {
  return history.filter(isResumable);
}

/**
 * Where to start a resumed video: a few seconds early, so the sentence they
 * stopped in the middle of starts again from its beginning.
 */
export function resumeAt(entry: { position: number; seconds: number | null } | undefined): number {
  if (!entry || !isResumable(entry)) return 0;
  return Math.max(0, entry.position - 3);
}

/** Recent searches: newest first, one copy each, a short list. */
export function addRecent(recent: string[], query: string): string[] {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!q) return recent;
  const lower = q.toLowerCase();
  return [q, ...recent.filter((r) => r.toLowerCase() !== lower)].slice(0, MAX_RECENT);
}
