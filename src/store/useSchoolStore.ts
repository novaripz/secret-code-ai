"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { accountScope } from "./useAuthStore";
import {
  DEFAULT_RULES,
  EMPTY_SCHOOL,
  type Assignment,
  type AssignmentRules,
  type AssignmentStatus,
  type Role,
  type SchoolClass,
  type SchoolData,
} from "@/lib/school/types";

// Classes, assignments and the rules attached to them.
//
// Reads and writes go through this one store so there is a single source of
// truth, and persistence sits behind `read`/`write` so swapping the browser
// for a database is a change in two functions rather than everywhere.
//
// Scoped per account for the same reason chats are: a shared school laptop
// must not show one student another's work.

const KEY_BASE = "sca:school:v1";

function key() {
  return KEY_BASE + accountScope();
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

interface SchoolState extends SchoolData {
  hydrated: boolean;

  hydrate: () => void;
  setRole: (role: Role) => void;

  addClass: (input: { name: string; teacher?: string; color?: string }) => SchoolClass;
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

  setRules: (assignmentId: string, patch: Partial<AssignmentRules>) => void;

  /** Reads, with the lookups the UI actually needs. */
  classById: (id: string) => SchoolClass | undefined;
  assignmentById: (id: string) => Assignment | undefined;
  assignmentsFor: (classId: string) => Assignment[];
  rulesFor: (assignmentId: string) => AssignmentRules;
}

export const useSchoolStore = create<SchoolState>((set, get) => {
  /** Persist the whole snapshot after any mutation. */
  const commit = (patch: Partial<SchoolData>) => {
    set(patch);
    const s = get();
    write({ role: s.role, classes: s.classes, assignments: s.assignments, rules: s.rules });
  };

  return {
    ...EMPTY_SCHOOL,
    hydrated: false,

    hydrate: () => {
      if (get().hydrated) return;
      set({ ...read(), hydrated: true });
    },

    setRole: (role) => commit({ role }),

    addClass: ({ name, teacher, color }) => {
      const cls: SchoolClass = {
        id: nanoid(10),
        name: name.trim(),
        teacher: teacher?.trim() || undefined,
        color,
        source: "local",
        createdAt: Date.now(),
      };
      commit({ classes: [...get().classes, cls] });
      return cls;
    },

    updateClass: (id, patch) =>
      commit({ classes: get().classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

    // Removing a class takes its assignments and their rules with it, rather
    // than leaving rows pointing at a class that no longer exists.
    removeClass: (id) => {
      const doomed = new Set(get().assignments.filter((a) => a.classId === id).map((a) => a.id));
      commit({
        classes: get().classes.filter((c) => c.id !== id),
        assignments: get().assignments.filter((a) => a.classId !== id),
        rules: get().rules.filter((r) => !doomed.has(r.assignmentId)),
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
          a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
        ),
      }),

    setStatus: (id, status) => get().updateAssignment(id, { status }),

    removeAssignment: (id) =>
      commit({
        assignments: get().assignments.filter((a) => a.id !== id),
        rules: get().rules.filter((r) => r.assignmentId !== id),
      }),

    setRules: (assignmentId, patch) => {
      const existing = get().rules.find((r) => r.assignmentId === assignmentId);
      const next: AssignmentRules = { assignmentId, ...DEFAULT_RULES, ...existing, ...patch };
      commit({
        rules: [...get().rules.filter((r) => r.assignmentId !== assignmentId), next],
      });
    },

    classById: (id) => get().classes.find((c) => c.id === id),
    assignmentById: (id) => get().assignments.find((a) => a.id === id),
    assignmentsFor: (classId) => get().assignments.filter((a) => a.classId === classId),
    rulesFor: (assignmentId) =>
      get().rules.find((r) => r.assignmentId === assignmentId) ?? { assignmentId, ...DEFAULT_RULES },
  };
});
