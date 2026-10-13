// The week ahead, one column per day.
//
// Built from facts the student can see -- when each thing is due and roughly
// how long it takes -- plus the one thing only they know: which day they mean
// to do it. A piece of work sits on the day they chose, or failing that on the
// day it is due. Nothing here moves work on the student's behalf except one
// case: something planned for a day that has passed, or already overdue, comes
// forward to today rather than vanishing off the left edge of the strip. That
// is a fact ("this is still open"), not a nag, and the label says which it is.

import { addDays, daysUntil, dayKey, fromDayKey, startOfDay } from "./due";
import { isOverdue, type Assignment } from "./types";

export const WEEK_DAYS = 7;

export interface WeekEntry {
  assignment: Assignment;
  minutes: number;
  /** On this day because the student put it here. */
  planned: boolean;
  /** This is the day it is due. */
  dueThisDay: boolean;
  overdue: boolean;
  /** Planned for an earlier day and still open, so carried to today. */
  carried: boolean;
}

export interface WeekDay {
  key: string;
  start: number;
  isToday: boolean;
  entries: WeekEntry[];
  minutes: number;
}

export interface Week {
  days: WeekDay[];
  /** Due after this week, and not planned inside it. */
  later: WeekEntry[];
  /** No due date and no planned day. */
  undated: WeekEntry[];
}

export interface WeekOptions {
  now?: number;
  /** `yyyy-mm-dd` by assignment id. */
  doOn?: Record<string, string>;
  minutesFor?: (a: Assignment) => number;
}

function order(a: WeekEntry, b: WeekEntry): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const pa = a.assignment.teacherPinned === true;
  const pb = b.assignment.teacherPinned === true;
  if (pa !== pb) return pa ? -1 : 1;
  return (a.assignment.dueAt ?? Infinity) - (b.assignment.dueAt ?? Infinity);
}

export function buildWeek(assignments: Assignment[], { now = Date.now(), doOn = {}, minutesFor }: WeekOptions = {}): Week {
  const today = startOfDay(now);
  const days: WeekDay[] = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const start = addDays(today, i);
    return { key: dayKey(start), start, isToday: i === 0, entries: [], minutes: 0 };
  });
  const later: WeekEntry[] = [];
  const undated: WeekEntry[] = [];

  for (const a of assignments) {
    if (a.status === "done") continue;
    const minutes = minutesFor ? minutesFor(a) : (a.estimateMinutes ?? 30);
    const overdue = isOverdue(a, now);
    const dueIndex = a.dueAt === null ? null : daysUntil(a.dueAt, now);
    const plannedDay = doOn[a.id] ? fromDayKey(doOn[a.id]) : null;

    let index: number | null = null;
    let planned = false;
    let carried = false;

    if (plannedDay !== null) {
      const offset = daysUntil(plannedDay, now);
      planned = true;
      if (offset < 0) {
        index = 0;
        carried = true;
      } else if (offset < WEEK_DAYS) {
        index = offset;
      }
    } else if (overdue) {
      index = 0;
    } else if (dueIndex !== null && dueIndex >= 0 && dueIndex < WEEK_DAYS) {
      index = dueIndex;
    }

    const entry: WeekEntry = {
      assignment: a,
      minutes,
      planned,
      dueThisDay: index !== null && dueIndex === index && !overdue,
      overdue,
      carried,
    };

    if (index !== null) days[index].entries.push(entry);
    else if (a.dueAt === null && plannedDay === null) undated.push(entry);
    else later.push(entry);
  }

  for (const day of days) {
    day.entries.sort(order);
    day.minutes = day.entries.reduce((n, e) => n + e.minutes, 0);
  }
  later.sort(order);
  undated.sort(order);
  return { days, later, undated };
}
