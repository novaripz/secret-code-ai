// Gentle progress: what got done today, a run of days, time spent focused.
//
// The rules that keep this kind rather than a guilt machine:
//   - Only ever counts up. There is no "you missed yesterday", no red, no
//     number that goes down in front of the student.
//   - A streak survives a day that has not happened yet. If the student did
//     something yesterday and nothing yet today, the streak still reads as it
//     was: the day is not over, and showing 0 at 7am would be a scold.
//   - Either finishing something or sitting a focus session counts. A night
//     spent on one big essay is a good night even with nothing ticked off.

import { addDays, dayKey, startOfDay } from "./due";
import type { ActivityEvent } from "./types";

/** Long enough for any streak worth celebrating, short enough to stay small. */
export const ACTIVITY_KEEP_DAYS = 120;
const MAX_EVENTS = 2000;

export interface Progress {
  doneToday: number;
  focusMinutesToday: number;
  /** Today and the six days before it. */
  focusMinutesWeek: number;
  doneWeek: number;
  /** Consecutive days with something done or a focus session, ending today or yesterday. */
  streak: number;
  activeToday: boolean;
}

export function summarizeProgress(events: readonly ActivityEvent[], now = Date.now()): Progress {
  const today = startOfDay(now);
  const weekStart = addDays(today, -6);
  const todayKey = dayKey(today);
  const activeDays = new Set<string>();

  let doneToday = 0;
  let focusMinutesToday = 0;
  let focusMinutesWeek = 0;
  let doneWeek = 0;

  for (const e of events) {
    if (e.at > now + 60_000) continue;
    const key = dayKey(e.at);
    activeDays.add(key);
    const isToday = key === todayKey;
    const inWeek = e.at >= weekStart;
    if (e.kind === "done") {
      if (isToday) doneToday += 1;
      if (inWeek) doneWeek += 1;
    } else {
      const minutes = Math.max(0, Math.round(e.minutes ?? 0));
      if (isToday) focusMinutesToday += minutes;
      if (inWeek) focusMinutesWeek += minutes;
    }
  }

  const activeToday = activeDays.has(todayKey);
  let streak = 0;
  let cursor = activeToday ? today : addDays(today, -1);
  while (activeDays.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return { doneToday, focusMinutesToday, focusMinutesWeek, doneWeek, streak, activeToday };
}

/** Drops what no summary will ever read again. */
export function pruneActivity(events: readonly ActivityEvent[], now = Date.now()): ActivityEvent[] {
  const from = addDays(startOfDay(now), -ACTIVITY_KEEP_DAYS);
  const kept = events.filter((e) => e.at >= from);
  return kept.length > MAX_EVENTS ? kept.slice(kept.length - MAX_EVENTS) : kept;
}

/**
 * Taking a tick back takes its event back too -- the most recent "done" for
 * that assignment -- so a student cannot build a streak by toggling one box,
 * and an accidental tick leaves no trace.
 */
export function withdrawDone(events: readonly ActivityEvent[], assignmentId: string): ActivityEvent[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "done" && e.assignmentId === assignmentId) {
      return [...events.slice(0, i), ...events.slice(i + 1)];
    }
  }
  return [...events];
}

/** Minutes of focus logged per assignment, for the planner's remaining time. */
export function focusedMinutesByAssignment(events: readonly ActivityEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.kind !== "focus" || !e.assignmentId) continue;
    out[e.assignmentId] = (out[e.assignmentId] ?? 0) + Math.max(0, e.minutes ?? 0);
  }
  return out;
}
