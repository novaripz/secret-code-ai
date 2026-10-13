"use client";

import { useSyncExternalStore } from "react";
import type { StringKey } from "@/lib/i18n";
import type { Video } from "@/lib/watch/types";

// The small bits of Watch state that outlive one view but not the tab:
//
// * the list a video was opened from, so the watch page's Up next can carry on
//   through it (and so a reload keeps it — it lives in sessionStorage);
// * every video card the student has seen, so the watch page can draw the
//   title and thumbnail instantly while the full details load;
// * theater mode, which is a preference and so lives in localStorage;
// * a short-lived toast.
//
// All of them are tiny external stores read with useSyncExternalStore, which
// keeps them out of effects and makes the server render a plain default.

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    /** Fills in a lazily-read starting value without telling anyone: it is
        called from inside a snapshot read, where notifying would re-enter React. */
    prime(initialValue: T) {
      value = initialValue;
    },
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// --- Where a video was opened from ----------------------------------------------

export interface Queue {
  /** Says where these came from: "From your search", "From Watch later". */
  label: StringKey;
  videos: Video[];
}

const QUEUE_KEY = "panda:watch:queue";

function readQueue(): Queue | null {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Queue) : null;
    return parsed && Array.isArray(parsed.videos) ? parsed : null;
  } catch {
    return null;
  }
}

const queueStore = createStore<Queue | null | undefined>(undefined);

function queueSnapshot(): Queue | null {
  let q = queueStore.get();
  if (q === undefined) {
    q = readQueue();
    queueStore.prime(q);
  }
  return q;
}

export function setQueue(queue: Queue) {
  // Long lists are trimmed: Up next only ever shows a few dozen.
  const trimmed = { label: queue.label, videos: queue.videos.slice(0, 60) };
  queueStore.set(trimmed);
  for (const v of trimmed.videos) known.set(v.id, v);
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage blocked: the queue lasts as long as the page, which is fine.
  }
}

export function useQueue(): Queue | null {
  return useSyncExternalStore(queueStore.subscribe, queueSnapshot, () => null);
}

// --- Videos already seen ------------------------------------------------------------

const known = new Map<string, Video>();
const knownStore = createStore(0);

/** Remembers cards so opening one draws instantly. */
export function rememberVideos(videos: Video[]) {
  let added = false;
  for (const v of videos) {
    if (!known.has(v.id)) added = true;
    known.set(v.id, v);
  }
  if (added) knownStore.set(knownStore.get() + 1);
}

export function useKnownVideo(id: string | null): Video | null {
  return useSyncExternalStore(
    knownStore.subscribe,
    () => (id ? (known.get(id) ?? queueSnapshot()?.videos.find((v) => v.id === id) ?? null) : null),
    () => null,
  );
}

// --- Did we get here from inside Watch? -------------------------------------------
//
// Esc on the watch page means "back". When the student came from a Watch list,
// that is the browser's Back; when they arrived from a shared link, Back would
// leave the tab, so it goes to the Watch home instead.

let internalNav = false;
export function markInternalNavigation() {
  internalNav = true;
}
export function cameFromWatch() {
  return internalNav;
}

// --- Theater mode -------------------------------------------------------------------

const THEATER_KEY = "panda:watch:theater";
const theaterStore = createStore<boolean | undefined>(undefined);

function theaterSnapshot(): boolean {
  let v = theaterStore.get();
  if (v === undefined) {
    try {
      v = localStorage.getItem(THEATER_KEY) === "1";
    } catch {
      v = false;
    }
    theaterStore.prime(v);
  }
  return v;
}

export function setTheater(on: boolean) {
  theaterStore.set(on);
  try {
    localStorage.setItem(THEATER_KEY, on ? "1" : "0");
  } catch {
    // Remembered for this page only.
  }
}

export function useTheater(): boolean {
  return useSyncExternalStore(theaterStore.subscribe, theaterSnapshot, () => false);
}

// --- Toast ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const toastStore = createStore<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;

export function showToast(text: string, action?: Toast["action"]) {
  if (toastTimer) clearTimeout(toastTimer);
  toastStore.set({ id: ++toastId, text, action });
  toastTimer = setTimeout(() => toastStore.set(null), action ? 6_000 : 3_000);
}

export function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toastStore.set(null);
}

export function useToast(): Toast | null {
  return useSyncExternalStore(toastStore.subscribe, toastStore.get, () => null);
}

// --- The page's origin, for the player's postMessage handshake ----------------------

const noop = () => () => {};
export function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}
