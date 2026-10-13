"use client";

import { useSyncExternalStore } from "react";

// "3 min ago" that actually moves.
//
// The history list said "just now" for as long as it stayed open, because the
// time was worked out once, when the row was drawn. One shared clock ticks
// every half minute for every component that asks, and nothing re-renders
// when nobody is listening.

const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot(): number {
  if (now === 0) now = Date.now();
  return now;
}

/** The current time, refreshed every 30 seconds. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** "just now", "4 min ago", or a clock time — the same phrasing everywhere in the workspace. */
export function ago(at: number, current: number): string {
  if (!current) return "";
  const minutes = Math.round((current - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const sameDay = new Date(at).toDateString() === new Date(current).toDateString();
  const time = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
