"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { accountScope } from "./useAuthStore";
import { getSupabase } from "@/lib/supabase/browser";
import {
  DatabaseError,
  listAssignmentsForStudent,
  listEnrolledClasses,
  setStatus as saveStatus,
} from "@/lib/db";
import { mergeFromSchool } from "@/lib/school/sync";
import { pruneActivity, withdrawDone } from "@/lib/school/progress";
import {
  DEFAULT_RULES,
  EMPTY_SCHOOL,
  type ActivityEvent,
  type Assignment,
  type AssignmentRules,
  type AssignmentStatus,
  type Role,
  type SchoolClass,
  type SchoolData,
  type Subtask,
} from "@/lib/school/types";

// Classes, assignments and the rules attached to them.
//
// Every student screen reads this one store, and this store reads two places:
//
//   - This browser. Always. It is the whole story for a guest and for a
//     deployment with no database, and for everyone else it is the offline
//     cache that makes the pages open instantly and keep working on a train.
//   - The class database, when Supabase is configured and the student is
//     signed in. Their enrolled classes and the assignments their teachers set
//     are fetched on every school page open (throttled) and folded in by
//     `mergeFromSchool`, which never touches what the student made themselves.
//     Marking teacher-set work done is written through to `assignment_status`,
//     so the teacher's "behind" count is a fact rather than a guess.
//
// A failed write is not thrown away: it waits in `pendingStatus`, is laid over
// the next refresh, and is re-sent then. The screens say plainly when that is
// happening, so "saved here, not yet with your teacher" is never a secret.
//
// Scoped per account for the same reason chats are: a shared school laptop
// must not show one student another's work.

const KEY_BASE = "sca:school:v1";

function key() {
  return KEY_BASE + accountScope();
}

function asRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, T>) : {};
}

function read(): SchoolData {
  if (typeof window === "undefined") return EMPTY_SCHOOL;
  try {
    const raw = window.localStorage.getItem(key());
    if (!raw) return EMPTY_SCHOOL;
    const parsed = JSON.parse(raw) as Partial<SchoolData>;
    return {
      role: parsed.role === "teacher" ? "teacher" : "student",
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      steps: asRecord<Subtask[]>(parsed.steps),
      doOn: asRecord<string>(parsed.doOn),
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      pendingStatus: asRecord<AssignmentStatus>(parsed.pendingStatus),
    };
  } catch {
    return EMPTY_SCHOOL;
  }
}

function write(data: SchoolData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(), JSON.stringify(data));
  } catch {
    // Storage full or blocked. The session still works, it just won't persist.
  }
}

/** The class quick-add files things under when no class name was typed. */
export const PERSONAL_CLASS_ID = "personal";

/**
 * Where the device copy stands against the class database.
 *
 * "local" is not a failure: no database configured, or nobody signed in, both
 * mean this device is the whole story and the screens should not apologise.
 */
export type SyncState =
  | { kind: "idle" }
  | { kind: "local"; reason: "no-database" | "signed-out" }
  | { kind: "syncing"; lastAt: number | null }
  | { kind: "synced"; lastAt: number }
  | { kind: "failed"; lastAt: number | null; denied: boolean };

/** How often opening a page may refresh. Pages open far more often than teachers set work. */
const SYNC_THROTTLE_MS = 30_000;

interface SchoolState extends SchoolData {
  hydrated: boolean;
  sync: SyncState;

  hydrate: () => void;
  /** Refresh from the class database. Safe to call any time; it never throws. */
  syncFromSchool: (opts?: { force?: boolean }) => Promise<void>;
  setRole: (role: Role) => void;

  addClass: (input: { name: string; teacher?: string; color?: string; id?: string }) => SchoolClass;
  updateClass: (id: string, patch: Partial<SchoolClass>) => void;
  removeClass: (id: string) => void;

  addAssignment: (input: {
    classId: string;
    title: string;
    instructions?: string;
    dueAt?: number | null;
    points?: number;
    estimateMinutes?: number;
  }) => Assignment;
  updateAssignment: (id: string, patch: Partial<Assignment>) => void;
  setStatus: (id: string, status: AssignmentStatus) => void;
  removeAssignment: (id: string) => void;
  /** Puts back an assignment (and its notes) that was just removed. */
  restoreAssignment: (snapshot: AssignmentSnapshot) => void;

  setRules: (assignmentId: string, patch: Partial<AssignmentRules>) => void;

  setSteps: (assignmentId: string, steps: Subtask[]) => void;
  /** `yyyy-mm-dd`, or null to go back to the due day. */
  setDoOn: (assignmentId: string, day: string | null) => void;
  logFocus: (assignmentId: string | undefined, minutes: number) => void;

  /** Reads, with the lookups the UI actually needs. */
  classById: (id: string) => SchoolClass | undefined;
  assignmentById: (id: string) => Assignment | undefined;
  assignmentsFor: (classId: string) => Assignment[];
  rulesFor: (assignmentId: string) => AssignmentRules;
}

/** Everything that goes when an assignment is removed, so undo can bring it back whole. */
export interface AssignmentSnapshot {
  assignment: Assignment;
  rules?: AssignmentRules;
  steps?: Subtask[];
  doOn?: string;
}

// Module-level, not state: nothing renders these, and a re-render of every
// school screen each time a request starts would be work for nothing.
let inflight: Promise<void> | null = null;
let lastSyncAt = 0;

/** The signed-in student's id when the session matches this device's account scope. */
async function schoolSession() {
  const supabase = await getSupabase();
  if (!supabase) return { supabase: null, userId: null, reason: "no-database" as const };
  // getSession reads the stored session without a round trip; row-level
  // security checks the token on every query anyway.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id ?? null;
  // The device copy is stored under the account scope. If the session belongs
  // to anyone else -- a sign-in in another tab that has not reloaded this one
  // yet -- writing their classes into this scope would show one student
  // another's work, so it is treated as signed out until the page catches up.
  if (!userId || accountScope() !== `:${userId}`) return { supabase, userId: null, reason: "signed-out" as const };
  return { supabase, userId, reason: null };
}

export const useSchoolStore = create<SchoolState>((set, get) => {
  /** Persist the whole snapshot after any mutation. */
  const commit = (patch: Partial<SchoolData>) => {
    set(patch);
    const s = get();
    write({
      role: s.role,
      classes: s.classes,
      assignments: s.assignments,
      rules: s.rules,
      steps: s.steps,
      doOn: s.doOn,
      activity: s.activity,
      pendingStatus: s.pendingStatus,
    });
  };

  const snapshot = (): SchoolData => {
    const s = get();
    return {
      role: s.role,
      classes: s.classes,
      assignments: s.assignments,
      rules: s.rules,
      steps: s.steps,
      doOn: s.doOn,
      activity: s.activity,
      pendingStatus: s.pendingStatus,
    };
  };

  /** Only the student's own rows are theirs to edit. */
  const isOwn = (a: Assignment | undefined) => a !== undefined && a.origin !== "school";

  /**
   * Sends every done/undone the database has not acknowledged. Each one that
   * lands is cleared -- unless the student has changed it again since, in
   * which case the newer value stays queued.
   */
  const flushPending = async (): Promise<boolean> => {
    const queued = Object.entries(get().pendingStatus);
    if (queued.length === 0) return true;
    const { supabase, userId } = await schoolSession();
    if (!supabase || !userId) return false;
    let allSent = true;
    for (const [assignmentId, status] of queued) {
      try {
        await saveStatus(supabase, assignmentId, userId, status);
        const now = get().pendingStatus;
        if (now[assignmentId] === status) {
          const next = { ...now };
          delete next[assignmentId];
          commit({ pendingStatus: next });
        }
      } catch {
        allSent = false;
      }
    }
    return allSent;
  };

  return {
    ...EMPTY_SCHOOL,
    hydrated: false,
    sync: { kind: "idle" },

    hydrate: () => {
      if (!get().hydrated) set({ ...read(), hydrated: true });
      void get().syncFromSchool();
    },

    syncFromSchool: ({ force = false } = {}) => {
      if (inflight) return inflight;
      if (!force && Date.now() - lastSyncAt < SYNC_THROTTLE_MS && get().sync.kind !== "idle") {
        return Promise.resolve();
      }
      lastSyncAt = Date.now();
      inflight = (async () => {
        const previous = get().sync;
        const lastAt = previous.kind === "synced" || previous.kind === "failed" || previous.kind === "syncing" ? previous.lastAt : null;
        try {
          const { supabase, userId, reason } = await schoolSession();
          if (!supabase || !userId) {
            set({ sync: { kind: "local", reason: reason ?? "signed-out" } });
            return;
          }
          set({ sync: { kind: "syncing", lastAt } });

          // Writes first, so the read that follows already reflects them.
          await flushPending();

          const [classes, rows] = await Promise.all([
            listEnrolledClasses(supabase, userId),
            listAssignmentsForStudent(supabase, userId),
          ]);
          commit(mergeFromSchool(snapshot(), { classes, items: rows }));
          set({ sync: { kind: "synced", lastAt: Date.now() } });
        } catch (err) {
          // The cached copy stays on screen. A failed refresh is a sentence
          // under the page, never an empty page.
          set({ sync: { kind: "failed", lastAt, denied: err instanceof DatabaseError && err.isDenied } });
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },

    setRole: (role) => commit({ role }),

    addClass: ({ name, teacher, color, id }) => {
      const cls: SchoolClass = {
        id: id ?? nanoid(10),
        name: name.trim(),
        teacher: teacher?.trim() || undefined,
        color,
        source: "local",
        createdAt: Date.now(),
      };
      commit({ classes: [...get().classes.filter((c) => c.id !== cls.id), cls] });
      return cls;
    },

    updateClass: (id, patch) =>
      commit({
        classes: get().classes.map((c) => (c.id === id && c.origin !== "school" ? { ...c, ...patch, origin: c.origin } : c)),
      }),

    // Removing a class takes its assignments, their rules and the student's
    // notes on them with it, rather than leaving rows pointing at a class that
    // no longer exists. A teacher's class is not the student's to remove.
    removeClass: (id) => {
      const cls = get().classes.find((c) => c.id === id);
      if (!cls || cls.origin === "school") return;
      const doomed = new Set(get().assignments.filter((a) => a.classId === id).map((a) => a.id));
      const keep = <T,>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).filter(([k]) => !doomed.has(k))) as Record<string, T>;
      commit({
        classes: get().classes.filter((c) => c.id !== id),
        assignments: get().assignments.filter((a) => a.classId !== id),
        rules: get().rules.filter((r) => !doomed.has(r.assignmentId)),
        steps: keep(get().steps),
        doOn: keep(get().doOn),
      });
    },

    addAssignment: ({ classId, title, instructions, dueAt, points, estimateMinutes }) => {
      const now = Date.now();
      const assignment: Assignment = {
        id: nanoid(10),
        classId,
        title: title.trim(),
        instructions: instructions?.trim() || undefined,
        dueAt: dueAt ?? null,
        points,
        estimateMinutes,
        status: "todo",
        source: "local",
        createdAt: now,
        updatedAt: now,
      };
      commit({ assignments: [...get().assignments, assignment] });
      return assignment;
    },

    updateAssignment: (id, patch) =>
      commit({
        assignments: get().assignments.map((a) =>
          a.id === id && isOwn(a) ? { ...a, ...patch, origin: a.origin, updatedAt: Date.now() } : a,
        ),
      }),

    setStatus: (id, status) => {
      const a = get().assignments.find((x) => x.id === id);
      if (!a || a.status === status) return;

      const now = Date.now();
      let activity: ActivityEvent[] = get().activity;
      if (status === "done") activity = pruneActivity([...activity, { at: now, kind: "done", assignmentId: id }], now);
      else if (a.status === "done") activity = withdrawDone(activity, id);

      const assignments = get().assignments.map((x) => (x.id === id ? { ...x, status, updatedAt: now } : x));

      if (a.origin !== "school") {
        commit({ assignments, activity });
        return;
      }

      // The teacher's copy: queued first, so it survives a closed tab, then
      // sent. The queue entry is what flushPending clears on success.
      commit({ assignments, activity, pendingStatus: { ...get().pendingStatus, [id]: status } });
      void flushPending().then((sent) => {
        if (!sent) {
          const s = get().sync;
          set({ sync: { kind: "failed", lastAt: s.kind === "synced" || s.kind === "failed" || s.kind === "syncing" ? s.lastAt : null, denied: false } });
        }
      });
    },

    removeAssignment: (id) => {
      const a = get().assignments.find((x) => x.id === id);
      if (!isOwn(a)) return;
      const steps = { ...get().steps };
      const doOn = { ...get().doOn };
      delete steps[id];
      delete doOn[id];
      commit({
        assignments: get().assignments.filter((x) => x.id !== id),
        rules: get().rules.filter((r) => r.assignmentId !== id),
        steps,
        doOn,
      });
    },

    restoreAssignment: ({ assignment, rules, steps, doOn }) => {
      if (get().assignments.some((a) => a.id === assignment.id)) return;
      commit({
        assignments: [...get().assignments, assignment],
        rules: rules ? [...get().rules, rules] : get().rules,
        steps: steps ? { ...get().steps, [assignment.id]: steps } : get().steps,
        doOn: doOn ? { ...get().doOn, [assignment.id]: doOn } : get().doOn,
      });
    },

    setRules: (assignmentId, patch) => {
      if (!isOwn(get().assignments.find((a) => a.id === assignmentId))) return;
      const existing = get().rules.find((r) => r.assignmentId === assignmentId);
      const next: AssignmentRules = { assignmentId, ...DEFAULT_RULES, ...existing, ...patch };
      commit({
        rules: [...get().rules.filter((r) => r.assignmentId !== assignmentId), next],
      });
    },

    setSteps: (assignmentId, steps) => {
      const next = { ...get().steps };
      if (steps.length === 0) delete next[assignmentId];
      else next[assignmentId] = steps;
      commit({ steps: next });
    },

    setDoOn: (assignmentId, day) => {
      const next = { ...get().doOn };
      if (day === null) delete next[assignmentId];
      else next[assignmentId] = day;
      commit({ doOn: next });
    },

    logFocus: (assignmentId, minutes) => {
      const rounded = Math.round(minutes);
      if (rounded < 1) return;
      const now = Date.now();
      commit({ activity: pruneActivity([...get().activity, { at: now, kind: "focus", assignmentId, minutes: rounded }], now) });
    },

    classById: (id) => get().classes.find((c) => c.id === id),
    assignmentById: (id) => get().assignments.find((a) => a.id === id),
    assignmentsFor: (classId) => get().assignments.filter((a) => a.classId === classId),
    rulesFor: (assignmentId) =>
      get().rules.find((r) => r.assignmentId === assignmentId) ?? { assignmentId, ...DEFAULT_RULES },
  };
});

// Back online after a dropped connection: send what was queued and refresh.
// Registered once per page load, on the client only.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (useSchoolStore.getState().hydrated) void useSchoolStore.getState().syncFromSchool({ force: true });
  });
}
