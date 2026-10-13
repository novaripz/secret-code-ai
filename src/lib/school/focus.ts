// The focus timer, as arithmetic over one timestamp.
//
// The first version counted down with setInterval, one tick per second. Browsers
// throttle intervals in background tabs -- to once a minute, in some cases --
// so a student who switched to their essay came back to a timer that had
// barely moved, and navigating away threw it out entirely. This version stores
// when the session ENDS and works out what is left from the clock whenever it
// is asked. A hidden tab, a page change or a reload all read the same answer,
// because the answer was never in the ticking.
//
// Pausing is the one time the end moves: the time left is set aside, and
// resuming puts a new end that far into the future.

export type FocusKind = "focus" | "break";

export interface FocusSession {
  id: string;
  kind: FocusKind;
  title: string;
  assignmentId?: string;
  classId?: string;
  /** The planned length, including any minutes added since. */
  durationMs: number;
  /** When it ends while running; null while paused. */
  endAt: number | null;
  /** What was left at the moment of pausing. */
  pausedLeftMs: number | null;
  startedAt: number;
  /** Set once the end has been noticed, so the chime plays exactly once. */
  finishedAt: number | null;
}

/** The two lengths almost every student uses: a pomodoro and its break. */
export const FOCUS_PRESETS = { focus: 25, break: 5 } as const;

/** What "+5 min" adds. */
export const EXTEND_MINUTES = 5;

const MINUTE = 60_000;

export function startSession(input: {
  id: string;
  kind: FocusKind;
  minutes: number;
  title: string;
  now: number;
  assignmentId?: string;
  classId?: string;
}): FocusSession {
  const durationMs = Math.max(1, Math.round(input.minutes)) * MINUTE;
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    assignmentId: input.assignmentId,
    classId: input.classId,
    durationMs,
    endAt: input.now + durationMs,
    pausedLeftMs: null,
    startedAt: input.now,
    finishedAt: null,
  };
}

export function remainingMs(s: FocusSession, now: number): number {
  if (s.endAt === null) return Math.max(0, s.pausedLeftMs ?? 0);
  return Math.max(0, s.endAt - now);
}

export function isPaused(s: FocusSession): boolean {
  return s.endAt === null && s.finishedAt === null;
}

/** Ran down to zero, whether or not anyone has noticed yet. */
export function hasEnded(s: FocusSession, now: number): boolean {
  return s.finishedAt !== null || (s.endAt !== null && now >= s.endAt);
}

export function pause(s: FocusSession, now: number): FocusSession {
  if (s.endAt === null || hasEnded(s, now)) return s;
  return { ...s, endAt: null, pausedLeftMs: Math.max(0, s.endAt - now) };
}

export function resume(s: FocusSession, now: number): FocusSession {
  if (s.endAt !== null || s.finishedAt !== null) return s;
  return { ...s, endAt: now + (s.pausedLeftMs ?? 0), pausedLeftMs: null };
}

/**
 * More time. On a running or paused session it lengthens what is left; on one
 * that has already ended it starts the clock again for that long, which is
 * what "+5 min" means to someone who has just heard the chime mid-sentence.
 */
export function extend(s: FocusSession, minutes: number, now: number): FocusSession {
  const add = Math.max(1, Math.round(minutes)) * MINUTE;
  if (hasEnded(s, now)) {
    return { ...s, durationMs: s.durationMs + add, endAt: now + add, pausedLeftMs: null, finishedAt: null };
  }
  if (s.endAt === null) return { ...s, durationMs: s.durationMs + add, pausedLeftMs: (s.pausedLeftMs ?? 0) + add };
  return { ...s, durationMs: s.durationMs + add, endAt: s.endAt + add };
}

export function markFinished(s: FocusSession, now: number): FocusSession {
  return s.finishedAt !== null ? s : { ...s, finishedAt: s.endAt ?? now, endAt: s.endAt, pausedLeftMs: null };
}

/** Time actually sat through, for the minutes the progress line counts. */
export function elapsedMs(s: FocusSession, now: number): number {
  return Math.max(0, Math.min(s.durationMs, s.durationMs - remainingMs(s, now)));
}

/** 0 to 1, for the ring. */
export function progressFraction(s: FocusSession, now: number): number {
  return s.durationMs > 0 ? Math.min(1, elapsedMs(s, now) / s.durationMs) : 1;
}

/** "24:59", or "1:04:59" past an hour. Rounds up, so it never reads 00:00 with time left. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The tab title while a session runs: "(12:34) Panda". */
const TITLE_PREFIX = /^\((?:\d{1,2}:)?\d{2}:\d{2}\) |^\(\S[^)]{0,24}\) /;

export function titleWithClock(base: string, clock: string | null): string {
  const clean = base.replace(TITLE_PREFIX, "");
  return clock ? `(${clock}) ${clean}` : clean;
}
