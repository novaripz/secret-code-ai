"use client";

// One place the teacher screens read from, so swapping the source is one file.
//
// Today it seeds from exampleData. When src/lib/db lands, the seed becomes a
// fetch and the mutations become writes — the components never learn which,
// because they only ever see the types in ./types. That indirection is the
// whole reason this store exists rather than components importing the fixture
// directly.
//
// Mutations are optimistic and local on purpose: a teacher adding an email
// should see the pending invite land instantly, and the real version will do
// the same thing with a rollback on failure.

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { AssignmentRules } from "@/lib/school/types";
import {
  EXAMPLE_NOW,
  exampleAssignments,
  exampleClassAnalytics,
  exampleClasses,
  exampleInvites,
  exampleRoster,
  exampleStudentAnalytics,
  exampleStudentFallback,
} from "./exampleData";
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

interface TeacherState {
  source: DataSource;
  classes: TeacherClass[];
  roster: Record<string, RosterStudent[]>;
  invites: Record<string, RosterInvite[]>;
  assignments: Record<string, TeacherAssignment[]>;

  /** Returns an error message, or null when the invite was added. */
  invite: (classId: string, email: string) => string | null;
  cancelInvite: (classId: string, inviteId: string) => void;
  removeStudent: (classId: string, studentId: string) => void;
  saveAssignment: (classId: string, assignmentId: string | null, draft: AssignmentDraft) => string;
  deleteAssignment: (classId: string, assignmentId: string) => void;
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

export const useTeacherStore = create<TeacherState>((set, get) => ({
  source: "example",
  classes: exampleClasses,
  roster: exampleRoster,
  invites: exampleInvites,
  assignments: exampleAssignments,

  invite: (classId, rawEmail) => {
    const email = rawEmail.trim().toLowerCase();
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
    // nothing. If the account exists this becomes an enrollment server-side;
    // if it does not, it waits here as an invite until they sign up.
    set((s) => ({
      invites: {
        ...s.invites,
        [classId]: [...pending, { id: nanoid(8), email, invitedAt: Date.now() }],
      },
    }));
    return null;
  },

  cancelInvite: (classId, inviteId) =>
    set((s) => ({
      invites: { ...s.invites, [classId]: (s.invites[classId] ?? []).filter((i) => i.id !== inviteId) },
    })),

  removeStudent: (classId, studentId) =>
    set((s) => ({
      roster: { ...s.roster, [classId]: (s.roster[classId] ?? []).filter((r) => r.id !== studentId) },
      classes: s.classes.map((c) =>
        c.id === classId ? { ...c, studentCount: Math.max(0, c.studentCount - 1) } : c,
      ),
    })),

  saveAssignment: (classId, assignmentId, draft) => {
    const now = Date.now();
    const list = get().assignments[classId] ?? [];
    const id = assignmentId ?? nanoid(8);

    const base = {
      id,
      classId,
      title: draft.title.trim(),
      instructions: draft.instructions.trim() || undefined,
      dueAt: dueToMillis(draft.due),
      points: draft.points ? Number(draft.points) : undefined,
      rules: {
        ...draft.rules,
        pandaInstructions: draft.rules.pandaInstructions?.trim() || undefined,
        restrictionReason: draft.rules.restrictionReason?.trim() || undefined,
      },
    };

    const existing = list.find((a) => a.id === assignmentId);
    const next: TeacherAssignment = existing
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
        [classId]: existing ? list.map((a) => (a.id === id ? next : a)) : [...list, next],
      },
      classes: existing
        ? s.classes
        : s.classes.map((c) =>
            c.id === classId ? { ...c, assignmentCount: c.assignmentCount + 1 } : c,
          ),
    }));
    return id;
  },

  deleteAssignment: (classId, assignmentId) =>
    set((s) => ({
      assignments: {
        ...s.assignments,
        [classId]: (s.assignments[classId] ?? []).filter((a) => a.id !== assignmentId),
      },
      classes: s.classes.map((c) =>
        c.id === classId ? { ...c, assignmentCount: Math.max(0, c.assignmentCount - 1) } : c,
      ),
    })),
}));

// Analytics is read-only from the UI's point of view — nothing a teacher does
// on these screens changes a learning signal — so it stays a lookup rather than
// store state. src/lib/insights will replace the body of these two functions.

export function classAnalytics(classId: string): ClassAnalytics | null {
  return exampleClassAnalytics[classId] ?? null;
}

export function studentAnalytics(studentId: string): StudentAnalytics {
  return exampleStudentAnalytics[studentId] ?? { ...exampleStudentFallback, studentId };
}

/** The fixture's "today", so relative dates in example data read sensibly. */
export const exampleNow = EXAMPLE_NOW;
