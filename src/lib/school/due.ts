import type { StringKey } from "@/lib/i18n/strings";

// Due dates: what "overdue" means, and how a due date is said out loud.
//
// There used to be two definitions of overdue. Students counted whole days
// (overdue once the due *day* had passed) while teachers compared against the
// clock (`dueAt < now`) -- and since date-only deadlines were stored at noon,
// a teacher saw a whole class "behind" at 12:01 on the day a student was told
// the same work was "due today". One rule now, here, used by both.
//
// The rule rests on one distinction: a deadline with a real time ("8:00 am")
// and a deadline that is just a day ("Friday"). A day means the end of that
// day, so it becomes overdue at midnight; a time means that time. Date-only
// deadlines are stored at 23:59 local. Rows written before due times existed
// were stored at exactly 12:00:00.000 as a stand-in for "some time that day",
// and they are read the same way. The cost is that a deadline deliberately set
// at exactly noon reads as "that day" too -- lenient by half a day, which is
// the right direction to be wrong in for a student.
//
// Three formatters of due dates on two clocks (one of them frozen in 2026)
// became `formatDue` below, which takes the clock and the translator as
// arguments so the same words come out on every screen and in every language.

export const DAY_MS = 86_400_000;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Calendar arithmetic, so a daylight-saving night is still one day. */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole days from today. Negative is past, 0 is today, 1 is tomorrow. */
export function daysUntil(dueAt: number, now = Date.now()): number {
  return Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY_MS);
}

/** `yyyy-mm-dd` in local time: the key for "this day" in planner storage. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a `yyyy-mm-dd` key, or null when it is not one. */
export function fromDayKey(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * True when the stored value means "that day" rather than a time of day.
 * See the note at the top of this file for the noon case.
 */
export function isDateOnly(dueAt: number): boolean {
  const d = new Date(dueAt);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ms = d.getMilliseconds();
  if (h === 12 && m === 0 && s === 0 && ms === 0) return true;
  if (h === 23 && m === 59 && ((s === 0 && ms === 0) || (s === 59 && ms === 999))) return true;
  return false;
}

/** The moment work stops being on time. */
export function deadlineOf(dueAt: number): number {
  return isDateOnly(dueAt) ? endOfDay(dueAt) : dueAt;
}

/** The one definition of "past due", for students and teachers alike. */
export function isPastDue(dueAt: number | null, now = Date.now()): boolean {
  return dueAt !== null && now > deadlineOf(dueAt);
}

/** A date-only deadline: 23:59 local on that day. */
export function dateOnlyDue(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

/**
 * From a date input and an optional time input to a stored deadline. A blank
 * time is a date-only deadline, not midnight: "due Friday" means by the end
 * of Friday, and midnight at the start of it would make it overdue all day.
 */
export function dueFromInputs(date: string, time: string): number | null {
  const day = fromDayKey(date);
  if (day === null) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return dateOnlyDue(day);
  const d = new Date(day);
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d.getTime();
}

/** A date input wants `yyyy-mm-dd` in local time, which toISOString will not give. */
export function toDateInput(ms: number | null): string {
  return ms === null ? "" : dayKey(ms);
}

/** `HH:MM` for a time input, or "" for a date-only deadline. */
export function toTimeInput(ms: number | null): string {
  if (ms === null || isDateOnly(ms)) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- display

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

/** How urgent a due date is. Every tone also changes the words, never only the colour. */
export type DueTone = "none" | "later" | "soon" | "today" | "overdue";

export interface DueLabel {
  text: string;
  tone: DueTone;
  /** Past its deadline. Done work is never overdue; callers pass status separately. */
  overdue: boolean;
  /** Whole days away, or null for no deadline. */
  days: number | null;
}

export interface FormatDueOptions {
  t: Translate;
  now?: number;
  /** BCP 47, for the weekday, the date and the time. */
  locale?: string;
}

function timeText(ms: number, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(ms);
}

function dateText(ms: number, now: number, locale: string | undefined): string {
  const days = daysUntil(ms, now);
  // Within the coming week a weekday is what a person says ("due Friday");
  // further out, the date is.
  if (days >= 2 && days <= 6) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(ms);
  }
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(ms);
}

/** A due date said the way a person would say it, with its urgency. */
export function formatDue(dueAt: number | null, { t, now = Date.now(), locale }: FormatDueOptions): DueLabel {
  if (dueAt === null) return { text: t("classes.noDue"), tone: "none", overdue: false, days: null };

  const days = daysUntil(dueAt, now);
  const timed = !isDateOnly(dueAt);
  const time = timed ? timeText(dueAt, locale) : "";

  if (isPastDue(dueAt, now)) {
    const text =
      days >= 0
        ? t("classes.overdueSince", { time })
        : days === -1
          ? t("classes.overdueOne")
          : t("classes.overdueDays", { count: -days });
    return { text, tone: "overdue", overdue: true, days };
  }
  if (days === 0) {
    return { text: timed ? t("classes.dueTodayAt", { time }) : t("assignments.dueToday"), tone: "today", overdue: false, days };
  }
  if (days === 1) {
    return { text: timed ? t("classes.dueTomorrowAt", { time }) : t("assignments.dueTomorrow"), tone: "soon", overdue: false, days };
  }
  const date = dateText(dueAt, now, locale);
  return {
    text: timed ? t("classes.dueOnAt", { date, time }) : t("classes.dueOn", { date }),
    tone: "later",
    overdue: false,
    days,
  };
}
