// The academic data model.
//
// Shaped for a real database even though it currently persists to the browser,
// because the shape is the expensive decision and the storage is not. Every
// entity carries a stable id and foreign keys rather than nesting, so moving
// this to Postgres or Firestore is a repository swap rather than a rewrite.
//
// `externalId` exists on the entities an LMS owns, so a Canvas import can find
// the row it created last time instead of duplicating it.

export type Role = "student" | "teacher";

export type Source = "local" | "canvas";

export interface SchoolClass {
  id: string;
  name: string;
  /** Free text: "Ms. Alvarez", "Period 3". Not a user reference yet. */
  teacher?: string;
  /** A colour to tell classes apart at a glance. */
  color?: string;
  source: Source;
  externalId?: string;
  createdAt: number;
}

export type AssignmentStatus = "todo" | "doing" | "done";

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  /** What the student has to do. May be long; shown in full on the detail page. */
  instructions?: string;
  /** Epoch millis. Null when the class has no deadline for it. */
  dueAt: number | null;
  points?: number;
  status: AssignmentStatus;
  /** Roughly how long it should take, used by the planner. */
  estimateMinutes?: number;
  source: Source;
  externalId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * How Panda is allowed to behave on one assignment.
 *
 * These are stored as structured settings rather than being buried in a
 * prompt, so the server can enforce the ones that matter. A teacher turning
 * translation off has to actually turn it off, not politely request it.
 */
export interface AssignmentRules {
  assignmentId: string;
  /** Free text from the teacher, folded into Panda's instructions. */
  pandaInstructions?: string;
  answers: "guided" | "afterUnderstanding" | "allowed";
  translation: "allowed" | "disabled";
  simplification: "allowed" | "disabled";
  /** Shown to the student when something is switched off, so it isn't a mystery. */
  restrictionReason?: string;
}

export interface SchoolData {
  role: Role;
  classes: SchoolClass[];
  assignments: Assignment[];
  rules: AssignmentRules[];
}

export const EMPTY_SCHOOL: SchoolData = {
  role: "student",
  classes: [],
  assignments: [],
  rules: [],
};

export const DEFAULT_RULES: Omit<AssignmentRules, "assignmentId"> = {
  answers: "guided",
  translation: "allowed",
  simplification: "allowed",
};

/** Colours offered when creating a class. Muted enough to sit in a dark UI. */
export const CLASS_COLORS = [
  "#6aa84f", "#4a90d9", "#c9793e", "#a97bc4", "#4aa8a0", "#c25b6e", "#b0a04a",
];

// ---------------------------------------------------------------- due dates

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days from today. Negative is overdue, 0 is today, 1 is tomorrow. */
export function daysUntil(dueAt: number, now = Date.now()): number {
  return Math.round((startOfDay(dueAt) - startOfDay(now)) / 86_400_000);
}

export function isOverdue(a: Assignment, now = Date.now()): boolean {
  return a.status !== "done" && a.dueAt !== null && daysUntil(a.dueAt, now) < 0;
}

/**
 * Ordering for "what should I do next".
 *
 * Overdue first, then by how soon it is due, then by what it is worth. Done
 * work sinks. This is the ranking the planner explains back to the student, so
 * it deliberately uses only facts they can check themselves.
 */
export function urgencyScore(a: Assignment, now = Date.now()): number {
  if (a.status === "done") return Number.MAX_SAFE_INTEGER;
  const days = a.dueAt === null ? 60 : daysUntil(a.dueAt, now);
  const weight = a.points ?? 10;
  // Days dominate; points break ties between things due the same day.
  return days * 1000 - Math.min(weight, 500);
}
