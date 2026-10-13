"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { accountScope } from "./useAuthStore";
import { useSchoolStore } from "./useSchoolStore";
import {
  EXTEND_MINUTES,
  FOCUS_PRESETS,
  elapsedMs,
  extend,
  formatClock,
  hasEnded,
  markFinished,
  pause,
  remainingMs,
  resume,
  startSession,
  titleWithClock,
  type FocusKind,
  type FocusSession,
} from "@/lib/school/focus";
import { playChime, primeAudio } from "@/lib/school/chime";

// The focus timer, as app state rather than page state.
//
// It used to live inside the plan page, so leaving the page ended the session
// and coming back started from scratch. Now the session (really just when it
// ends -- see lib/school/focus.ts) is in browser storage, and the ticking is
// done here at module level: a store module outlives every page change in the
// app, so the tab-title countdown keeps counting and the chime still plays at
// zero while the student is reading their assignment or looking something up
// in Watch. A reload loses the ticker but not the session; the next school
// page that opens picks it up where the clock says it is.
//
// Minutes are logged to the school store when a session is put away, however
// that happens, so the progress line and the planner's "time already spent"
// both see them.

const KEY_BASE = "sca:focus:v1";

interface Persisted {
  session: FocusSession | null;
  sound: boolean;
}

function key() {
  return KEY_BASE + accountScope();
}

function read(): Persisted {
  if (typeof window === "undefined") return { session: null, sound: true };
  try {
    const raw = window.localStorage.getItem(key());
    if (!raw) return { session: null, sound: true };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const s = parsed.session;
    const valid = s && typeof s === "object" && typeof s.durationMs === "number" && typeof s.title === "string";
    return { session: valid ? (s as FocusSession) : null, sound: parsed.sound !== false };
  } catch {
    return { session: null, sound: true };
  }
}

function write(data: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(), JSON.stringify(data));
  } catch {
    // Not persisted; this tab still runs the timer.
  }
}

interface FocusState extends Persisted {
  hydrated: boolean;
  /** The clock the screens render against; moves once a second while a session exists. */
  now: number;
  hydrate: () => void;
  start: (input: { kind?: FocusKind; minutes?: number; title: string; assignmentId?: string; classId?: string }) => void;
  pause: () => void;
  resume: () => void;
  /** +5 minutes, or a fresh five after the chime. */
  extend: (minutes?: number) => void;
  /** Put the session away: log the minutes and, when asked, tick the assignment done. */
  finish: (opts?: { markDone?: boolean }) => void;
  startBreak: (minutes?: number) => void;
  setSound: (on: boolean) => void;
  /** Re-read storage after another tab changed it. */
  resync: () => void;
}

let ticker: ReturnType<typeof setInterval> | null = null;

export const useFocusStore = create<FocusState>((set, get) => {
  const commit = (patch: Partial<Persisted>) => {
    set(patch);
    write({ session: get().session, sound: get().sound });
  };

  /** One pass of the clock: notice the end, chime once, keep the title honest. */
  const tick = () => {
    const now = Date.now();
    const s = get().session;
    if (s && s.finishedAt === null && hasEnded(s, now)) {
      commit({ session: markFinished(s, now) });
      if (get().sound) playChime();
    }
    set({ now });
    updateTitle();
    if (!get().session) stopTicker();
  };

  const updateTitle = () => {
    if (typeof document === "undefined") return;
    const s = get().session;
    let clock: string | null = null;
    if (s && s.finishedAt === null) clock = formatClock(remainingMs(s, get().now));
    else if (s) clock = "00:00";
    const next = titleWithClock(document.title, clock);
    if (next !== document.title) document.title = next;
  };

  const startTicker = () => {
    if (ticker || typeof window === "undefined") return;
    ticker = setInterval(tick, 1000);
    tick();
  };

  const stopTicker = () => {
    if (ticker) clearInterval(ticker);
    ticker = null;
    updateTitle();
  };

  /** Logs what was actually sat through, for focus sessions only. */
  const logCurrent = () => {
    const s = get().session;
    if (!s || s.kind !== "focus") return;
    const minutes = elapsedMs(s, Date.now()) / 60_000;
    useSchoolStore.getState().logFocus(s.assignmentId, minutes);
  };

  return {
    session: null,
    sound: true,
    hydrated: false,
    now: Date.now(),

    hydrate: () => {
      if (get().hydrated) return;
      const saved = read();
      set({ ...saved, hydrated: true, now: Date.now() });
      // A session that ran out while nobody was looking is finished quietly:
      // a chime on page load, long after the fact, would only startle.
      const s = saved.session;
      if (s && s.finishedAt === null && hasEnded(s, Date.now())) commit({ session: markFinished(s, Date.now()) });
      if (get().session) startTicker();
    },

    start: ({ kind = "focus", minutes, title, assignmentId, classId }) => {
      primeAudio();
      // Starting something new puts the old one away properly, minutes and all.
      if (get().session) logCurrent();
      const now = Date.now();
      commit({
        session: startSession({
          id: nanoid(8),
          kind,
          minutes: minutes ?? FOCUS_PRESETS[kind],
          title,
          assignmentId,
          classId,
          now,
        }),
      });
      set({ now });
      startTicker();
    },

    pause: () => {
      const s = get().session;
      if (s) commit({ session: pause(s, Date.now()) });
      updateTitle();
    },

    resume: () => {
      primeAudio();
      const s = get().session;
      if (s) commit({ session: resume(s, Date.now()) });
      startTicker();
    },

    extend: (minutes = EXTEND_MINUTES) => {
      primeAudio();
      const s = get().session;
      if (s) commit({ session: extend(s, minutes, Date.now()) });
      startTicker();
    },

    finish: ({ markDone = false } = {}) => {
      const s = get().session;
      if (!s) return;
      logCurrent();
      if (markDone && s.assignmentId) useSchoolStore.getState().setStatus(s.assignmentId, "done");
      commit({ session: null });
      stopTicker();
    },

    startBreak: (minutes = FOCUS_PRESETS.break) => {
      get().start({ kind: "break", minutes, title: "" });
    },

    setSound: (on) => {
      if (on) primeAudio();
      commit({ sound: on });
    },

    resync: () => {
      const saved = read();
      set({ session: saved.session, sound: saved.sound, now: Date.now() });
      if (saved.session) startTicker();
      else stopTicker();
    },
  };
});

// Another tab started, paused or finished the timer: follow it, so two tabs
// never show two different clocks for one session.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === key() && useFocusStore.getState().hydrated) useFocusStore.getState().resync();
  });
}
