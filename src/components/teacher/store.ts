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
// Learning signals are live too, as of the `struggle_signals` table in
// migration 0002. They arrive by a different route from everything else here:
// students capture them locally and push them in the background (see
// src/store/useInsightsStore.ts), so a teacher is reading a copy that can lag
// behind a student who is offline. The one thing that is still fixture on
// these screens is nothing — exampleData now survives only for the classes,
// roster and assignment shapes the screens were designed against.

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLASS_COLORS,
  type AssignmentResource,
  type AssignmentRules,
  type Grade,
  type GradeCategory,
  cleanResources,
  type Role,
} from "@/lib/school/types";
import { getSupabase } from "@/lib/supabase/browser";
import {
  DatabaseError,
  addStudentByEmail,
  createAssignment,
  createCategory,
  createClass,
  clearGrade,
  deleteAssignment as dbDeleteAssignment,
  deleteCategory as dbDeleteCategory,
  getProfile,
  listAssignments,
  listCategories,
  listEnrollments,
  listGradesForClass,
  listInvites,
  listOwnedClasses,
  listStatusesForAssignment,
  gradeKey,
  gradesByCell,
  listClassSignals,
  listStudentProfiles,
  listStudentSignals,
  removeStudent as dbRemoveStudent,
  deleteClass as dbDeleteClass,
  reorderCategories,
  revokeInvite,
  setGrade,
  updateCategory,
  updateClass,
  updateAssignment,
  type AssignmentStatusRow,
  type ClassWithOwner,
  type Invite,
} from "@/lib/db";
import {
  estimateEnglishLevel,
  summarizeStruggles,
  toTeacherReport,
  WINDOW_MS,
  type Confidence,
  type StruggleSignal,
  type TeacherReport,
  type TeacherTopicRow,
} from "@/lib/insights";
import type {
  ClassAnalytics,
  Severity,
  TopicSignal,
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
  /** "" means uncategorised, which is a real answer and not a missing one. */
  categoryId: string;
  /** Links a student can open. Validated on save; see `cleanResources`. */
  resources: AssignmentResource[];
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
  /** Every screen reads the database now. Kept because the note component and
   *  the tests both still ask a store what it is showing. */
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

  /** Weighted categories, per class. Empty is a real answer: plain points. */
  categories: Record<string, GradeCategory[]>;
  /**
   * Marks, per class, keyed `${assignmentId}:${studentId}`.
   *
   * A Map with no default, deliberately. An absent key is an unmarked
   * assignment and every reader has to handle that as its own case rather than
   * finding a 0 waiting for them. See src/lib/db/grades.ts.
   */
  grades: Record<string, Map<string, Grade>>;
  gradebookState: Record<string, LoadState>;

  /** A write that failed after its optimistic edit was already on screen. */
  actionError: string | null;
  clearActionError: () => void;

  loadRole: () => Promise<void>;
  loadClasses: () => Promise<void>;
  loadClass: (classId: string) => Promise<void>;

  /** Returns the new class id, or null when the write failed. */
  createClass: (name: string, period?: string) => Promise<string | null>;
  renameClass: (classId: string, name: string, period?: string) => Promise<void>;
  removeClass: (classId: string) => Promise<void>;

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

  /** Categories and marks load together — neither is useful alone. */
  loadGradebook: (classId: string) => Promise<void>;
  addCategory: (classId: string, name: string, weight: number) => Promise<void>;
  editCategory: (
    classId: string,
    categoryId: string,
    patch: { name?: string; weight?: number },
  ) => Promise<void>;
  removeCategory: (classId: string, categoryId: string) => Promise<void>;
  moveCategory: (classId: string, categoryId: string, direction: -1 | 1) => Promise<void>;
  /**
   * Records a mark, or clears it back to ungraded when `points` is null.
   *
   * Null is not zero and this signature is where that starts: clearing the box
   * in the grid deletes the row, typing 0 writes one.
   */
  saveGrade: (
    classId: string,
    assignmentId: string,
    studentId: string,
    points: number | null,
  ) => Promise<void>;
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

  categories: {},
  grades: {},
  gradebookState: {},

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

  // A teacher with no classes can do nothing else — not enroll anyone, not set
  // an assignment — so this is the first write any of them makes. It is not
  // optimistic: the row comes back carrying the id every later call needs, and
  // showing a class that might not exist would be worse than a half-second wait.
  createClass: async (name, period) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    try {
      const { supabase, userId } = await session();
      const colors = CLASS_COLORS;
      const klass = await createClass(supabase, userId, {
        name: trimmed,
        teacher: period?.trim() || undefined,
        color: colors[get().classes.length % colors.length],
      });

      const bundle = await loadBundle(supabase, klass, { withStatuses: "overdue" });
      set((state) => ({
        classes: [...state.classes, summarize(bundle)],
        roster: { ...state.roster, [klass.id]: [] },
        invites: { ...state.invites, [klass.id]: [] },
        assignments: { ...state.assignments, [klass.id]: [] },
      }));
      return klass.id;
    } catch (err) {
      set({ actionError: describe(err, "We couldn't create that class.") });
      return null;
    }
  },

  renameClass: async (classId, name, period) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const before = get().classes;
    set((state) => ({
      classes: state.classes.map((c) =>
        c.id === classId ? { ...c, name: trimmed, period: period?.trim() || undefined } : c,
      ),
    }));

    try {
      const { supabase } = await session();
      await updateClass(supabase, classId, { name: trimmed, teacher: period?.trim() || undefined });
    } catch (err) {
      set({ classes: before, actionError: describe(err, "We couldn't rename that class.") });
    }
  },

  // Deleting cascades to enrollments, assignments and signals in the database.
  // The roster and the work go with it, which is why the screen asks first.
  removeClass: async (classId) => {
    const before = get().classes;
    set((state) => ({ classes: state.classes.filter((c) => c.id !== classId) }));

    try {
      const { supabase } = await session();
      await dbDeleteClass(supabase, classId);
    } catch (err) {
      set({ classes: before, actionError: describe(err, "We couldn't delete that class.") });
    }
  },

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
      // "" from the select means uncategorised. It travels as null rather than
      // undefined because the data layer reads undefined as "leave it alone",
      // and a teacher who picks "No category" means to unfile it.
      categoryId: draft.categoryId || null,
      resources: cleanResources(draft.resources),
      rules,
    };

    const existing = previous.find((a) => a.id === assignmentId);
    // `categoryId` is null in `base` because that is what the write wants; the
    // UI's Assignment shape says undefined for the same state, so it is mapped
    // once here rather than at every read.
    const shown = { ...base, categoryId: base.categoryId ?? undefined };
    const optimistic: TeacherAssignment = existing
      ? { ...existing, ...shown, updatedAt: now }
      : {
          ...shown,
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
              categoryId: base.categoryId,
              resources: base.resources,
            },
            rules,
          )
        : await createAssignment(supabase, {
            classId,
            title: base.title,
            instructions: base.instructions,
            dueAt: base.dueAt,
            points: base.points,
            categoryId: base.categoryId,
            resources: base.resources,
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

  // ------------------------------------------------------------- gradebook

  // Categories and marks arrive together because neither answers anything on
  // its own: a weight with no scores is a plan, and a score with no weight is a
  // number out of context. One load state, so a half-drawn gradebook is not a
  // state this screen can be in.
  loadGradebook: (classId) =>
    once(`gradebook:${classId}`, async () => {
      const before = get().gradebookState[classId] ?? IDLE;
      set((s) => ({
        gradebookState: {
          ...s.gradebookState,
          [classId]: { loading: true, error: null, loaded: before.loaded },
        },
      }));
      try {
        const { supabase } = await session();
        // The assignment list is the grid's columns and the filter for the
        // marks, so it is read here rather than trusted from whatever the
        // assignments tab last loaded.
        const [categories, assignments] = await Promise.all([
          listCategories(supabase, classId),
          listAssignments(supabase, classId),
        ]);
        const grades = await listGradesForClass(
          supabase,
          assignments.map((a) => a.assignment.id),
        );

        set((s) => ({
          categories: { ...s.categories, [classId]: categories },
          grades: { ...s.grades, [classId]: gradesByCell(grades) },
          gradebookState: {
            ...s.gradebookState,
            [classId]: { loading: false, error: null, loaded: true },
          },
        }));
      } catch (err) {
        set((s) => ({
          gradebookState: {
            ...s.gradebookState,
            [classId]: {
              loading: false,
              error: describe(err, "We couldn't load the gradebook."),
              loaded: false,
            },
          },
        }));
      }
    }),

  addCategory: async (classId, name, weight) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = get().categories[classId] ?? [];
    try {
      const { supabase } = await session();
      const created = await createCategory(supabase, classId, {
        name: trimmed,
        weight,
        position: existing.length,
      });
      set((s) => ({
        categories: { ...s.categories, [classId]: [...(s.categories[classId] ?? []), created] },
      }));
    } catch (err) {
      // Not optimistic: the unique constraint on (class_id, name) means a
      // duplicate is a real and likely failure, and showing the row first would
      // mean taking it away again half a second later.
      set({ actionError: describe(err, "We couldn't add that category.") });
    }
  },

  editCategory: async (classId, categoryId, patch) => {
    const previous = get().categories[classId] ?? [];
    set((s) => ({
      categories: {
        ...s.categories,
        [classId]: previous.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
      },
    }));
    try {
      const { supabase } = await session();
      await updateCategory(supabase, categoryId, patch);
    } catch (err) {
      set((s) => ({
        categories: { ...s.categories, [classId]: previous },
        actionError: describe(err, "We couldn't save that category."),
      }));
    }
  },

  // The assignments filed under it survive as uncategorised — `on delete set
  // null` — so this loses a weighting, never a mark. The confirm on the screen
  // says exactly that.
  removeCategory: async (classId, categoryId) => {
    const previous = get().categories[classId] ?? [];
    const previousAssignments = get().assignments[classId] ?? [];
    set((s) => ({
      categories: { ...s.categories, [classId]: previous.filter((c) => c.id !== categoryId) },
      assignments: {
        ...s.assignments,
        [classId]: previousAssignments.map((a) =>
          a.categoryId === categoryId ? { ...a, categoryId: undefined } : a,
        ),
      },
    }));
    try {
      const { supabase } = await session();
      await dbDeleteCategory(supabase, categoryId);
    } catch (err) {
      set((s) => ({
        categories: { ...s.categories, [classId]: previous },
        assignments: { ...s.assignments, [classId]: previousAssignments },
        actionError: describe(err, "We couldn't delete that category."),
      }));
    }
  },

  moveCategory: async (classId, categoryId, direction) => {
    const previous = get().categories[classId] ?? [];
    const index = previous.findIndex((c) => c.id === categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= previous.length) return;

    const next = [...previous];
    [next[index], next[target]] = [next[target], next[index]];
    const renumbered = next.map((c, i) => ({ ...c, position: i }));
    set((s) => ({ categories: { ...s.categories, [classId]: renumbered } }));

    try {
      const { supabase } = await session();
      await reorderCategories(supabase, renumbered.map((c) => c.id));
    } catch (err) {
      set((s) => ({
        categories: { ...s.categories, [classId]: previous },
        actionError: describe(err, "We couldn't reorder those categories."),
      }));
    }
  },

  // Optimistic, and it has to be: this is the one write in the app a teacher
  // makes thirty times in two minutes, and a grid that waits for the server
  // between cells is a grid they use once. The rollback restores the previous
  // cell exactly — including restoring it to *absent* when it was unmarked
  // before, which is why this deletes the key rather than writing a zero.
  saveGrade: async (classId, assignmentId, studentId, points) => {
    const key = gradeKey(assignmentId, studentId);
    const previous = get().grades[classId] ?? new Map<string, Grade>();
    const had = previous.get(key);

    const optimistic = new Map(previous);
    if (points === null) optimistic.delete(key);
    else {
      optimistic.set(key, {
        assignmentId,
        studentId,
        pointsEarned: points,
        recordedBy: had?.recordedBy ?? null,
        updatedAt: Date.now(),
      });
    }
    set((s) => ({ grades: { ...s.grades, [classId]: optimistic } }));

    try {
      const { supabase, userId } = await session();
      if (points === null) {
        await clearGrade(supabase, assignmentId, studentId);
      } else {
        const saved = await setGrade(supabase, {
          assignmentId,
          studentId,
          pointsEarned: points,
          recordedBy: userId,
        });
        set((s) => {
          const next = new Map(s.grades[classId] ?? optimistic);
          next.set(key, saved);
          return { grades: { ...s.grades, [classId]: next } };
        });
      }
    } catch (err) {
      set((s) => ({
        grades: { ...s.grades, [classId]: previous },
        actionError: describe(err, "We couldn't save that grade."),
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

// ---------------------------------------------------------------- analytics
//
// Analytics is read-only from the UI's point of view — nothing a teacher does
// on these screens changes a learning signal — so it stays a pair of hooks
// over a one-shot read rather than store state.
//
// The important decision is where the aggregation happens: in
// src/lib/insights, not here and not in SQL. `listClassSignals` returns rows,
// `summarizeStruggles` turns one student's rows into findings, and
// `toTeacherReport` projects those down to the teacher-safe shape. Only then
// does this file map into ./types. Writing the same thresholds a second time
// in a select statement would give a teacher's screen and a student's own
// adaptation two different opinions about the same evidence.
//
// What is lost on the way through the projection is the per-kind breakdown:
// a `TeacherTopicRow` carries a count, a confidence and a generated evidence
// line, and no byKind map. That is the projection doing its job, so each
// finding becomes one Evidence entry whose label is the generated line — the
// sentence a teacher can actually check. The `kind` field is a list key here,
// nothing more.

/** Confidence is the engine's word for how much it will claim; severity is the
 *  UI's. One map, so the two vocabularies meet exactly once. */
const SEVERITY: Record<Confidence, Severity> = {
  clear: "critical",
  likely: "warning",
  watching: "watch",
};

const WINDOW_DAYS = Math.round(WINDOW_MS / 86_400_000);

/** A finding, as the teacher screens draw it. `students` is how many people
 *  contributed — one, on the student screen. */
function toTopicSignal(
  id: string,
  rows: TeacherTopicRow[],
  students: number,
  context: string,
): TopicSignal {
  // The loudest row decides the stripe: a topic where one student is clearly
  // stuck and three are merely watched is a topic to reteach.
  const severity = rows
    .map((r) => SEVERITY[r.confidence])
    .reduce((worst, next) =>
      (["watch", "warning", "critical"].indexOf(next) > ["watch", "warning", "critical"].indexOf(worst)
        ? next
        : worst),
    "watch" as Severity);

  return {
    id,
    topic: rows[0].topicLabel,
    context,
    severity,
    studentCount: students,
    windowDays: WINDOW_DAYS,
    evidence: rows.map((r) => ({
      kind: "repeatedQuestion" as const,
      count: r.evidenceCount,
      label: r.evidenceLine,
    })),
  };
}

/** One student's rows, run through the engine and the privacy projection. */
function reportFor(studentId: string, signals: StruggleSignal[], now: number): TeacherReport {
  // No writing samples: those are text the student typed, they are never
  // stored, and they never leave their browser. The English estimate a teacher
  // sees is therefore built from button presses alone, which is thinner than
  // the student's own and honestly so.
  const english = estimateEnglishLevel(signals, []);
  return toTeacherReport(summarizeStruggles(studentId, signals, english, now));
}

/**
 * What one class is stuck on.
 *
 * Throws on failure, like everything in src/lib/db, and the hook below turns
 * that into a sentence. An empty list from here means the class was quiet.
 */
export async function classAnalytics(
  classId: string,
  now = Date.now(),
): Promise<ClassAnalytics> {
  const { supabase } = await session();
  const klass = useTeacherStore.getState().classes.find((c) => c.id === classId);
  const stored = await listClassSignals(supabase, classId, { className: klass?.name, now });

  const byStudent = new Map<string, StruggleSignal[]>();
  for (const { studentId, signal } of stored) {
    const list = byStudent.get(studentId);
    if (list) list.push(signal);
    else byStudent.set(studentId, [signal]);
  }

  // Grouped by the label a teacher reads rather than the topic key, because
  // two assignments with the same title are the same lesson to them, and the
  // label is all that survives the projection anyway.
  const needs = new Map<string, { rows: TeacherTopicRow[]; students: Set<string> }>();
  const watching = new Map<string, { rows: TeacherTopicRow[]; students: Set<string> }>();
  const add = (
    into: Map<string, { rows: TeacherTopicRow[]; students: Set<string> }>,
    studentId: string,
    row: TeacherTopicRow,
  ) => {
    const entry = into.get(row.topicLabel) ?? { rows: [], students: new Set<string>() };
    entry.rows.push(row);
    entry.students.add(studentId);
    into.set(row.topicLabel, entry);
  };

  for (const [studentId, signals] of byStudent) {
    const report = reportFor(studentId, signals, now);
    for (const row of report.needsAttention) add(needs, studentId, row);
    for (const row of report.watching) add(watching, studentId, row);
  }

  const project = (
    source: Map<string, { rows: TeacherTopicRow[]; students: Set<string> }>,
    prefix: string,
  ): TopicSignal[] =>
    [...source.entries()].map(([label, entry]) =>
      toTopicSignal(
        `${prefix}:${label}`,
        entry.rows,
        entry.students.size,
        klass?.name ?? "This class",
      ),
    );

  return {
    classId,
    windowDays: WINDOW_DAYS,
    // "Active" means Panda saw a struggle signal from them, which is narrower
    // than "used Panda" — a student who sailed through contributes nothing.
    // The coverage line on the screen is worded for that.
    activeStudents: byStudent.size,
    totalStudents: klass?.studentCount ?? useTeacherStore.getState().roster[classId]?.length ?? 0,
    topics: project(needs, "t"),
    steady: project(watching, "w"),
  };
}

/**
 * One student, inside one class.
 *
 * The class is required rather than optional: a teacher's select policy only
 * matches classes they own, so "all of this student's signals" would quietly
 * mean "the ones I happen to be allowed to see" — a number shaped by the asker
 * rather than by the student. See the note in src/lib/db/signals.ts.
 */
export async function studentAnalytics(
  classId: string,
  studentId: string,
  now = Date.now(),
): Promise<StudentAnalytics> {
  const { supabase } = await session();
  const klass = useTeacherStore.getState().classes.find((c) => c.id === classId);
  const signals = await listStudentSignals(supabase, classId, studentId, {
    className: klass?.name,
    now,
  });
  const report = reportFor(studentId, signals, now);

  const rows = [...report.needsAttention, ...report.watching];
  const byTopic = new Map<string, TeacherTopicRow[]>();
  for (const row of rows) {
    const list = byTopic.get(row.topicLabel);
    if (list) list.push(row);
    else byTopic.set(row.topicLabel, [row]);
  }

  return {
    studentId,
    windowDays: WINDOW_DAYS,
    // Distinct days with a signal, not sessions. `struggle_signals` has no
    // session column — the student's session ids stay in their browser — so
    // this counts days and the screen says "days", rather than printing a
    // session number nothing measured.
    sessions: new Set(signals.map((s) => Math.floor(s.at / 86_400_000))).size,
    topics: [...byTopic.entries()].map(([label, list]) =>
      toTopicSignal(`t:${label}`, list, 1, klass?.name ?? "This class"),
    ),
  };
}

/**
 * The three states a read can be in, kept apart all the way to the screen.
 *
 * `data` stays null while loading and on failure, so a component physically
 * cannot render "no struggles" over an error — which is the failure this whole
 * feature would be worst at, since a quiet class and a broken query look
 * identical once you have thrown the difference away.
 */
export interface AnalyticsResult<T> {
  data: T | null;
  state: LoadState;
}

function useAnalytics<T>(key: string, read: () => Promise<T>): AnalyticsResult<T> {
  // Keyed by the request rather than reset by it. Storing the key alongside the
  // answer means "still loading" is derived — the result in state simply does
  // not belong to the key being asked about yet — instead of being written by
  // an effect that fires a second render every time the class changes.
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });

  // `read` closes over fresh props each render, so it cannot be a dependency
  // without refetching on every render. The key identifies the request; this
  // keeps the callback current without widening that.
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });

  useEffect(() => {
    let cancelled = false;
    latest
      .current()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({ key, data: null, error: describe(err, "We couldn't load the learning signals.") });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const fresh = result.key === key;
  return {
    data: fresh ? result.data : null,
    state: {
      loading: !fresh,
      error: fresh ? result.error : null,
      loaded: fresh && result.error === null,
    },
  };
}

export function useClassAnalytics(classId: string): AnalyticsResult<ClassAnalytics> {
  return useAnalytics(`class:${classId}`, () => classAnalytics(classId));
}

export function useStudentAnalytics(
  classId: string,
  studentId: string,
): AnalyticsResult<StudentAnalytics> {
  return useAnalytics(`student:${classId}:${studentId}`, () => studentAnalytics(classId, studentId));
}

