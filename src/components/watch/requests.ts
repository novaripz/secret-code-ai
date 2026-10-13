"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { WatchFailure } from "./api";

// One small store for every request Watch makes, read with useSyncExternalStore.
//
// Each answer is filed under the exact question it answers (a key built from
// the query, the filters, the language). That alone fixes the old page's worst
// race: feed and search used to share one `loading` and one `trouble`, so a
// slow feed landing after a search painted its error over the search results,
// and Retry re-ran the wrong thing. Under a key, a late answer just fills its
// own slot and nobody is looking at it.
//
// The other job is "keep showing the last thing while the next one loads".
// Each view on the page is a *slot* ("results", "feed", …) that remembers the
// last key it had data for, so a new search keeps the old results on screen,
// dimmed under a progress bar, instead of blanking to skeletons — and coming
// Back to a search is instant because its answer is still here.

export type Status = "idle" | "loading" | "success" | "error";

export interface View<T> {
  status: Status;
  data: T | null;
  error: WatchFailure | null;
  /** Data is on screen and a newer answer is on its way. */
  refreshing: boolean;
}

interface Entry {
  status: Status;
  data: unknown;
  error: WatchFailure | null;
  at: number;
}

const MAX_ENTRIES = 120;
const DEFAULT_MAX_AGE = 10 * 60_000;

const entries = new Map<string, Entry>();
const lastGood = new Map<string, string>();
const listeners = new Set<() => void>();
const views = new Map<string, View<unknown>>();

const IDLE: View<never> = { status: "idle", data: null, error: null, refreshing: false };

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function remember(key: string, entry: Entry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function compute(slot: string, key: string | null): View<unknown> {
  if (!key) return IDLE;
  const entry = entries.get(key);
  if (entry && entry.data != null && entry.status !== "error") {
    return { status: entry.status === "loading" ? "loading" : "success", data: entry.data, error: null, refreshing: entry.status === "loading" };
  }
  if (entry?.status === "error") return { status: "error", data: null, error: entry.error, refreshing: false };
  const previous = lastGood.get(slot);
  const fallback = previous && previous !== key ? entries.get(previous) : undefined;
  if (fallback?.data != null) return { status: "loading", data: fallback.data, error: null, refreshing: true };
  return { status: "loading", data: null, error: null, refreshing: false };
}

function same(a: View<unknown>, b: View<unknown>) {
  return a.status === b.status && a.data === b.data && a.error === b.error && a.refreshing === b.refreshing;
}

/**
 * The view for (slot, key), as the same object for as long as nothing in it
 * changed — useSyncExternalStore re-renders on every new object, so handing out
 * a fresh one each time would re-render every list on every request.
 */
function readView(slot: string, key: string | null): View<unknown> {
  const id = `${slot}\u0000${key ?? ""}`;
  const next = compute(slot, key);
  const cached = views.get(id);
  if (cached && same(cached, next)) return cached;
  views.set(id, next);
  if (views.size > MAX_ENTRIES * 2) views.delete(views.keys().next().value!);
  return next;
}

function toFailure(err: unknown): WatchFailure {
  return err instanceof WatchFailure ? err : new WatchFailure("failed", "");
}

export function load<T>(slot: string, key: string, fetcher: () => Promise<T>, opts: { maxAge?: number; force?: boolean } = {}) {
  const entry = entries.get(key);
  const fresh = entry?.status === "success" && Date.now() - entry.at < (opts.maxAge ?? DEFAULT_MAX_AGE);
  if (entry?.status === "loading") return;
  if (fresh && !opts.force) {
    lastGood.set(slot, key);
    return;
  }

  remember(key, { status: "loading", data: entry?.status === "success" ? entry.data : null, error: null, at: entry?.at ?? 0 });
  emit();

  fetcher().then(
    (data) => {
      remember(key, { status: "success", data, error: null, at: Date.now() });
      lastGood.set(slot, key);
      emit();
    },
    (err) => {
      remember(key, { status: "error", data: null, error: toFailure(err), at: Date.now() });
      emit();
    },
  );
}

/** Reads a finished answer without subscribing, e.g. to append a page to it. */
export function peek<T>(key: string): T | null {
  const entry = entries.get(key);
  return entry?.status === "success" ? (entry.data as T) : null;
}

/**
 * The hook every list uses. `key` null means "nothing to ask yet". The fetcher
 * is read through a ref so a new closure each render doesn't refetch; the key
 * is what decides that.
 */
export function useWatchRequest<T>(
  slot: string,
  key: string | null,
  fetcher: () => Promise<T>,
  maxAge?: number,
): View<T> & { retry: () => void } {
  const view = useSyncExternalStore(
    subscribe,
    () => readView(slot, key) as View<T>,
    () => IDLE as View<T>,
  );

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key) load(slot, key, () => fetcherRef.current(), { maxAge });
  }, [slot, key, maxAge]);

  const retry = useCallback(() => {
    if (key) load(slot, key, () => fetcherRef.current(), { force: true });
  }, [slot, key]);

  return { ...view, retry };
}
