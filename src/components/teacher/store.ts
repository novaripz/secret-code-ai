"use client";

// One place the teacher screens read from, so the source of the numbers is one
// file. It now reads Supabase rather than a fixture.
//
// Two things changed when the real data arrived, and both of them are visible
// in the state shape. Reads became asynchronous, so every collection carries
// its own `loading` and `error` — because "you have no classes" and "we
// couldn't reach the database" are opposite sentences, and rendering the first
// when the second is true is how a teacher learns not to believe this screen.
// src/lib/db throws DatabaseError (with `isDenied`) exactly so that difference
// survives the trip up here.
//
// Mutations stay optimistic — a teacher who types an email should see the
// invite land immediately — but they now roll back on failure and say what
// went wrong, which is what the old comment promised and could not deliver
// while everything was local.
//
// What is NOT here: learning signals. The migration has no table for them
// (profiles, classes, enrollments, assignments, assignment_status, invites is
// the whole schema), and signals are captured in the student's own browser, so
// a teacher cannot read them at all yet. `classAnalytics`/`studentAnalytics`
// therefore still return fixtures, and those screens still say so on screen.

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentRules, Role } from "@/lib/school/types";
import { getSupabase } from "@/lib/supabase/browser";
import {
  DatabaseError,
  addStudentByEmail,
  createAssignment,
  deleteAssignment as dbDeleteAssignment,
  getProfile,
  listAssignments,
  listEnrollments,
  listInvites,
  listOwnedClasses,
  listStatusesForAssignment,
  listStudentProfiles,
  removeStudent as dbRemoveStudent,
  revokeInvite,
  updateAssignment,
  type AssignmentStatusRow,
  type ClassWithOwner,
  type Invite,
} from "@/lib/db";
import { EXAMPLE_NOW, exampleClassAnalytics, exampleStudentAnalytics } from "./exampleData";
import type {
  ClassAnalytics,
  RosterInvite,
  RosterStudent,
  StudentAnalytics,
  TeacherAssignment,
  TeacherClass,
} from "./types";

/** Where a screen's numbers came from. Rendered, not hidden — see DataSourceNote. */
export type DataSource = "example" | "live";

export interface AssignmentDraft {
  title: string;
  instructions: string;
  /** `yyyy-mm-dd` from a date input, or "" for no deadline. */
  due: string;
  points: string;
  rules: Omit<AssignmentRules, "assignmentId">;
}

/** Loading and failure, per collection, because they are different answers. */
export interface LoadState {
  loading: boolean;
  /** Null means "no failure", not "nothing found". */
  error: string | null;
  /** True once a successful read has happened, so "empty" can be trusted. */
  loaded: boolean;
}

const IDLE: LoadState = { loading: false, error: null, loaded: false };

interface TeacherState {
  /** The analytics screens are still fixtures; the rest is live. */
  source: DataSource;

  role: Role | null;
  roleState: LoadState;

  classes: TeacherClass[];
  classesState: LoadState;

  roster: Record<string, RosterStudent[]>;
  invites: Record<string, RosterInvite[]>;
  assignments: Record<string, TeacherAssignment[]>;
  /** Per class, because each class tab loads on its own. */
  classState: Record<string, LoadState>;

  /** A write that failed after its optimistic edit was already on screen. */
  actionError: string | null;
  clearActionError: () => void;

  loadRole: () => Promise<void>;
  loadClasses: () => Promise<void>;
  loadClass: (classId: string) => Promise<void>;

  /** Returns an error message, or null when the invite was accepted. */
  invite: (classId: string, email: string) => Promise<string | null>;
  cancelInvite: (classId: string, inviteId: string) => Promise<void>;
  removeStudent: (classId: string, studentId: string) => Promise<void>;
  /** Returns the assignment id, or null when the write failed. */
  saveAssignment: (
    classId: string,
    assignmentId: string | null,
    draft: AssignmentDraft,
  ) => Promise<string | null>;
  deleteAssignment: (classId: string, assignmentId: string) => Promise<void>;
}

/** Cheap enough to be honest about: this is a format check, not verification. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function dueToMillis(due: string): number | null {
  // A date input gives a local date; noon keeps the day from flipping either
  // way across a timezone boundary. Same trick as the student assignment form.
  return due ? new Date(`${due}T12:00:00`).getTime() : null;
}

/**
 * Two ways this app can have no database at all — nobody configured Supabase,
 * and nobody is signed in — and neither is a bug worth a stack trace. They get
 * their own error class so the UI can say which one it is.
 */
class UnavailableError extends Error {}

const NOT_CONFIGURED =
  "This copy of Panda has no database connected, so there is nothing to show here yet.";
const SIGNED_OUT = "Sign in with your teacher account to see your classes.";

/** The signed-in teacher's id and a usable client, or an explanation. */
async function session(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await getSupabase();
  if (!supabase) throw new UnavailableError(NOT_CONFIGURED);
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new UnavailableError(SIGNED_OUT);
  return { supabase, userId: data.user.id };
}

/**
 * A sentence a teacher can act on. A denial is not the same as a fault: one
 * means "this isn't yours", the other means "try again".
 */
function describe(err: unknown, fallback: string): string {
  if (err instanceof UnavailableError) return err.message;
  if (err instanceof DatabaseError) {
    return err.isDenied
      ? "The database refused that. Either this isn't your class, or your session has expired — signing in again is worth a try."
      : `${fallback} (${err.message})`;
  }
  return `${fallback} The database didn't answer.`;
}

// ------------------------------------------------------------------ mapping
//
// Adapting rows into ./types rather than changing the components: the UI's
// contract was written first on purpose, and it survived contact with the
// schema almost intact. The two places it did not are called out below.

/**
 * `classes` has no period column. `teacher_name` is the free-text label the
 * schema documents as "Ms. Alvarez" / "Period 3", which is what this line is
 * for, so it lands in `period` rather than being invented or dropped.
 */
function toTeacherClass(
  row: ClassWithOwner,
  counts: {
    studentCount: number;
    pendingInviteCount: number;
    assignmentCount: number;
    nextDueAt: number | null;
    studentsBehind: number;
  },
): TeacherClass {
  return { id: row.id, name: row.name, period: row.teacher, color: row.color, ...counts };
}

function toRosterInvite(invite: Invite): RosterInvite {
  return { id: invite.id, email: invite.email, invitedAt: invite.createdAt };
}

/** Status rows keyed by student, for one assignment. Absent means "todo". */
function statusByStudent(rows: AssignmentStatusRow[]): Map<string, string> {
  return new Map(rows.map((r) => [r.student_id, r.status]));
}

interface ClassBundle {
  klass: ClassWithOwner;
  studentIds: string[];
  joinedAt: Map<string, number>;
  invites: Invite[];
  assignments: { assignment: TeacherAssignment; statuses: Map<string, string> }[];
}

/**
 * Everything about one class, in as few round trips as the data layer allows.
 *
 * Progress counts are the expensive part: `listStatusesForAssignment` is per
 * assignment, so a class with nine assignments costs nine requests. That is
 * the honest cost of not adding a query to src/lib/db from here; if it starts
 * to hurt, one grouped select belongs in that file, not in this one.
 */
async function loadBundle(
  supabase: SupabaseClient,
  klass: ClassWithOwner,
  options: { withStatuses: "all" | "overdue" },
): Promise<ClassBundle> {
  const [enrollments, invites, assignments] = await Promise.all([
    listEnrollments(supabase, klass.id),
    listInvites(supabase, klass.id),
    listAssignments(supabase, klass.id),
  ]);

  const now = Date.now();
  const wanted =
    options.withStatuses === "all"
      ? assignments
      : assignments.filter((a) => a.assignment.dueAt !== null && a.assignment.dueAt < now);

  const statuses = await Promise.all(
    assignments.map(async (a) =>
      wanted.includes(a)
        ? statusByStudent(await listStatusesForAssignment(supabase, a.assignment.id))
        : new Map<string, string>(),
    ),
  );

  return {
    klass,
    studentIds: enrollments.map((e) => e.student_id),
    joinedAt: new Map(enrollments.map((e) => [e.student_id, Date.parse(e.created_at)])),
    invites,
    assignments: assignments.map((a, i) => {
      const map = statuses[i];
      const counts = { done: 0, doing: 0, todo: 0 };
      for (const studentId of enrollments.map((e) => e.student_id)) {
        const status = map.get(studentId) ?? "todo";
        if (status === "done") counts.done += 1;
        else if (status === "doing") counts.doing += 1;
        else counts.todo += 1;
      }
      return {
        assignment: { ...a.assignment, rules: stripId(a.rules), ...counts },
        statuses: map,
      };
    }),
  };
}

/** `AssignmentRules` carries its own id; the UI's copy is already keyed by one. */
function stripId(rules: AssignmentRules): Omit<AssignmentRules, "assignmentId"> {
  return {
    pandaInstructions: rules.pandaInstructions,
    answers: rules.answers,
    translation: rules.translation,
    simplification: rules.simplification,
    restrictionReason: rules.restrictionReason,
  };
}

/** How many enrolled students have at least one past-due assignment unfinished. */
function countBehind(bundle: ClassBundle, now: number): number {
  const overdue = bundle.assignments.filter(
    (a) => a.assignment.dueAt !== null && a.assignment.dueAt < now,
  );
  if (overdue.length === 0) return 0;
  return bundle.studentIds.filter((id) =>
    overdue.some((a) => (a.statuses.get(id) ?? "todo") !== "done"),
  ).length;
}

function summarize(bundle: ClassBundle): TeacherClass {
  const now = Date.now();
  const due = bundle.assignments
    .map((a) => a.assignment.dueAt)
    .filter((d): d is number => d !== null && d >= now)
    .sort((a, b) => a - b);

  return toTeacherClass(bundle.klass, {
    studentCount: bundle.studentIds.length,
    pendingInviteCount: bundle.invites.filter((i) => i.claimedAt === null).length,
    assignmentCount: bundle.assignments.length,
    nextDueAt: due[0] ?? null,
    studentsBehind: countBehind(bundle, now),
  });
}

// In-flight de-duplication. Two components on the same screen each ask for the
// class they are rendering; without this they would each start a round trip.
const inflight = new Map<string, Promise<void>>();

function once(key: string, run: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export const useTeacherStore = create<TeacherState>((set, get) => ({
  // Rosters, classes and assignments are live; the analytics screens are not,
  // and they keep their "example data" note for exactly that reason.
  source: "live",

  role: null,
  roleState: IDLE,

  classes: [],
  classesState: IDLE,

  roster: {},
  invites: {},
  assignments: {},
  classState: {},

  actionError: null,
  clearActionError: () => set({ actionError: null }),

  loadRole: () =>
    once("role", async () => {
      if (get().roleState.loading) return;
      set({ roleState: { loading: true, error: null, loaded: get().roleState.loaded } });
      try {
        const { supabase, userId } = await session();
        const profile = await getProfile(supabase, userId);
        // A null profile is a real answer: the sign-up trigger may not have run
        // yet. Treat it as "not a teacher", not as a failure.
        set({
          role: profile?.role ?? "student",
          roleState: { loading: false, error: null, loaded: true },
        });
      } catch (err) {
        set({
          role: null,
          roleState: {
            loading: false,
            error: describe(err, "We couldn't check your account."),
            loaded: false,
          },
        });
      }
    }),

  loadClasses: () =>
    once("classes", async () => {
      set({ classesState: { loading: true, error: null, loaded: get().classesState.loaded } });
      try {
        const { supabase, userId } = await session();
        const owned = await listOwnedClasses(supabase, userId);
        const bundles = await Promise.all(
          owned.map((klass) => loadBundle(supabase, klass, { withStatuses: "overdue" })),
        );

        set((s) => {
          const invites = { ...s.invites };
          const assignments = { ...s.assignments };
          for (const bundle of bundles) {
            invites[bundle.klass.id] = bundle.invites
              .filter((i) => i.claimedAt === null)
              .map(toRosterInvite);
            // Progress counts here are only complete for past-due assignments;
            // the class screen reloads with all of them. Storing them anyway
            // beats an empty list on the way in.
            assignments[bundle.klass.id] = bundle.assignments.map((a) => a.assignment);
          }
          return {
            classes: bundles.map(summarize),
            invites,
            assignments,
            classesState: { loading: false, error: null, loaded: true },
          };
        });
      } catch (err) {
        set({
          classesState: {
            loading: false,
            error: describe(err, "We couldn't load your classes."),
            loaded: false,
          },
        });
      }
    }),

  loadClass: (classId) =>
    once(`class:${classId}`, async () => {
      const before = get().classState[classId] ?? IDLE;
      set((s) => ({
        classState: { ...s.classState, [classId]: { loading: true, error: null, loaded: before.loaded } },
      }));
      try {
        const { supabase, userId } = await session();
        const owned = await listOwnedClasses(supabase, userId);
        const klass = owned.find((c) => c.id === classId);
        if (!klass) {
          // Not an error: RLS lets a teacher see only their own classes, so a
          // missing one means "not yours or deleted", which ClassFrame says.
          set((s) => ({
            classState: {
              ...s.classState,
              [classId]: { loading: false, error: null, loaded: true },
            },
          }));
          return;
        }

        const bundle = await loadBundle(supabase, klass, { withStatuses: "all" });
        const profiles = await listStudentProfiles(supabase, bundle.studentIds);
        const byId = new Map(profiles.map((p) => [p.id, p]));
        const now = Date.now();

        const roster: RosterStudent[] = bundle.studentIds.map((id) => {
          const profile = byId.get(id);
          const counts = { done: 0, doing: 0, todo: 0, overdue: 0 };
          for (const a of bundle.assignments) {
            const status = a.statuses.get(id) ?? "todo";
            if (status === "done") counts.done += 1;
            else if (status === "doing") counts.doing += 1;
            else counts.todo += 1;
            if (status !== "done" && a.assignment.dueAt !== null && a.assignment.dueAt < now) {
              counts.overdue += 1;
            }
          }
          return {
            id,
            // A profile we cannot read is a student whose row the policy hides
            // from us; showing the id would be worse than saying so.
            displayName: profile?.displayName || "Student",
            email: profile?.email ?? "",
            joinedAt: bundle.joinedAt.get(id) ?? 0,
            // Nothing in the schema records activity, so this is null rather
            // than a guess. The roster prints "Not recorded" for it.
            lastActiveAt: null,
            ...counts,
          };
        });

        set((s) => ({
          classes: s.classes.some((c) => c.id === classId)
            ? s.classes.map((c) => (c.id === classId ? summarize(bundle) : c))
            : [...s.classes, summarize(bundle)],
          roster: { ...s.roster, [classId]: roster },
          invites: {
            ...s.invites,
            [classId]: bundle.invites.filter((i) => i.claimedAt === null).map(toRosterInvite),
          },
          assignments: {
            ...s.assignments,
            [classId]: bundle.assignments.map((a) => a.assignment),
          },
          classState: {
            ...s.classState,
            [classId]: { loading: false, error: null, loaded: true },
          },
        }));
      } catch (err) {
        set((s) => ({
          classState: {
            ...s.classState,
            [classId]: {
              loading: false,
              error: describe(err, "We couldn't load this class."),
              loaded: false,
            },
          },
        }));
      }
    }),

  invite: async (classId, rawEmail) => {
    const email = rawEmail.trim().toLowerCase();
    // The client-side checks stay: they are instant, and they are the two
    // mistakes a teacher actually makes. The server still gets the last word.
    if (!looksLikeEmail(email)) return "That doesn't look like an email address.";

    const joined = get().roster[classId] ?? [];
    if (joined.some((s) => s.email.toLowerCase() === email)) {
      return "That student is already in this class.";
    }
    const pending = get().invites[classId] ?? [];
    if (pending.some((i) => i.email.toLowerCase() === email)) {
      return "You've already invited that address.";
    }

    // One-sided by design: the teacher owns the roster, the student accepts
    // nothing. `invite_student` enrolls them if the account exists and leaves
    // the invite waiting if it does not.
    const optimisticId = nanoid(8);
    set((s) => ({
      invites: {
        ...s.invites,
        [classId]: [...pending, { id: optimisticId, email, invitedAt: Date.now() }],
      },
    }));

    try {
      const { supabase } = await session();
      const created = await addStudentByEmail(supabase, classId, email);
      set((s) => ({
        invites: {
          ...s.invites,
          // Claimed means they already had an account and are enrolled now, so
          // the pending row goes away and the roster reload below shows them.
          [classId]: (s.invites[classId] ?? []).flatMap((i) =>
            i.id === optimisticId
              ? created.claimedAt === null
                ? [toRosterInvite(created)]
                : []
              : [i],
          ),
        },
      }));
      if (created.claimedAt !== null) void get().loadClass(classId);
      return null;
    } catch (err) {
      set((s) => ({
        invites: {
          ...s.invites,
          [classId]: (s.invites[classId] ?? []).filter((i) => i.id !== optimisticId),
        },
      }));
      return describe(err, "We couldn't add that student.");
    }
  },

  cancelInvite: async (classId, inviteId) => {
    const previous = get().invites[classId] ?? [];
    set((s) => ({
      invites: { ...s.invites, [classId]: previous.filter((i) => i.id !== inviteId) },
    }));
    try {
      const { supabase } = await session();
      await revokeInvite(supabase, inviteId);
    } catch (err) {
      set((s) => ({
        invites: { ...s.invites, [classId]: previous },
        actionError: describe(err, "We couldn't withdraw that invite."),
      }));
    }
  },

  removeStudent: async (classId, studentId) => {
    const previousRoster = get().roster[classId] ?? [];
    const previousClasses = get().classes;
    set((s) => ({
      roster: { ...s.roster, [classId]: previousRoster.filter((r) => r.id !== studentId) },
      classes: s.classes.map((c) =>
        c.id === classId ? { ...c, studentCount: Math.max(0, c.studentCount - 1) } : c,
      ),
    }));
    try {
      const { supabase } = await session();
      await dbRemoveStudent(supabase, classId, studentId);
    } catch (err) {
      set((s) => ({
        roster: { ...s.roster, [classId]: previousRoster },
        classes: previousClasses,
        actionError: describe(err, "We couldn't remove that student."),
      }));
    }
  },

  saveAssignment: async (classId, assignmentId, draft) => {
    const now = Date.now();
    const previous = get().assignments[classId] ?? [];
    const previousClasses = get().classes;
    const optimisticId = assignmentId ?? nanoid(8);

    const rules = {
      ...draft.rules,
      pandaInstructions: draft.rules.pandaInstructions?.trim() || undefined,
      restrictionReason: draft.rules.restrictionReason?.trim() || undefined,
    };
    const base = {
      id: optimisticId,
      classId,
      title: draft.title.trim(),
      instructions: draft.instructions.trim() || undefined,
      dueAt: dueToMillis(draft.due),
      points: draft.points ? Number(draft.points) : undefined,
      rules,
    };

    const existing = previous.find((a) => a.id === assignmentId);
    const optimistic: TeacherAssignment = existing
      ? { ...existing, ...base, updatedAt: now }
      : {
          ...base,
          status: "todo",
          source: "local",
          createdAt: now,
          updatedAt: now,
          done: 0,
          doing: 0,
          todo: get().roster[classId]?.length ?? 0,
        };

    set((s) => ({
      assignments: {
        ...s.assignments,
        [classId]: existing
          ? previous.map((a) => (a.id === optimisticId ? optimistic : a))
          : [...previous, optimistic],
      },
      classes: existing
        ? s.classes
        : s.classes.map((c) =>
            c.id === classId ? { ...c, assignmentCount: c.assignmentCount + 1 } : c,
          ),
    }));

    try {
      const { supabase } = await session();
      const saved = existing
        ? await updateAssignment(
            supabase,
            assignmentId as string,
            {
              title: base.title,
              instructions: base.instructions,
              dueAt: base.dueAt,
              points: base.points,
            },
            rules,
          )
        : await createAssignment(supabase, {
            classId,
            title: base.title,
            instructions: base.instructions,
            dueAt: base.dueAt,
            points: base.points,
            rules,
          });

      // The insert's real id replaces the placeholder one, so the link the
      // teacher clicks next points at a row that exists.
      const real: TeacherAssignment = {
        ...saved.assignment,
        rules: stripId(saved.rules),
        done: optimistic.done,
        doing: optimistic.doing,
        todo: optimistic.todo,
      };
      set((s) => ({
        assignments: {
          ...s.assignments,
          [classId]: (s.assignments[classId] ?? []).map((a) => (a.id === optimisticId ? real : a)),
        },
      }));
      return real.id;
    } catch (err) {
      set((s) => ({
        assignments: { ...s.assignments, [classId]: previous },
        classes: previousClasses,
        actionError: describe(err, "We couldn't save that assignment."),
      }));
      return null;
    }
  },

  deleteAssignment: async (classId, assignmentId) => {
    const previous = get().assignments[classId] ?? [];
    const previousClasses = get().classes;
    set((s) => ({
      assignments: { ...s.assignments, [classId]: previous.filter((a) => a.id !== assignmentId) },
      classes: s.classes.map((c) =>
        c.id === classId ? { ...c, assignmentCount: Math.max(0, c.assignmentCount - 1) } : c,
      ),
    }));
    try {
      const { supabase } = await session();
      await dbDeleteAssignment(supabase, assignmentId);
    } catch (err) {
      set((s) => ({
        assignments: { ...s.assignments, [classId]: previous },
        classes: previousClasses,
        actionError: describe(err, "We couldn't delete that assignment."),
      }));
    }
  },
}));

/**
 * The signed-in account's role, straight from `profiles`.
 *
 * Read here rather than from the local school store because the local one is
 * whatever this browser last wrote, and a gate that a student can edit is not
 * a gate. It is still only a courtesy — row-level security is the boundary.
 */
export function useTeacherRole(): { role: Role | null; state: LoadState } {
  const role = useTeacherStore((s) => s.role);
  const state = useTeacherStore((s) => s.roleState);
  return { role, state };
}

// Analytics is read-only from the UI's point of view — nothing a teacher does
// on these screens changes a learning signal — so it stays a lookup rather than
// store state.
//
// It is also still example data, and that is not an oversight. Struggle signals
// are produced in the student's own browser (src/lib/insights is pure, and
// useWatchStore-style capture never leaves the device), and the schema has
// nowhere to put them. Until a signals table exists there is genuinely nothing
// for a teacher to read, so these two functions keep returning the fixture and
// the screens that use them keep their DataSourceNote.

export function classAnalytics(classId: string): ClassAnalytics | null {
  return exampleClassAnalytics[classId] ?? null;
}

export function studentAnalytics(studentId: string): StudentAnalytics {
  // No fallback fixture for an id we do not recognise. Every real student now
  // has a real uuid, and attaching invented evidence — "3 hint requests on
  // difference of squares" — to a named sixteen-year-old is the single worst
  // thing these screens could do, note or no note.
  return (
    exampleStudentAnalytics[studentId] ?? { studentId, windowDays: 7, sessions: 0, topics: [] }
  );
}

/** The fixture's "today", so relative dates in example data read sensibly. */
export const exampleNow = EXAMPLE_NOW;
