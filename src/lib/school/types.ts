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
  /**
   * The teacher said this one matters. Set on the assignment row, which the
   * teacher already owns, so it needs no new permission story: if you can edit
   * the assignment you can pin it, and if you can read it you can see the pin.
   *
   * It is a hint to the ordering, not an override of it. See `buildPlan`.
   */
  teacherPinned?: boolean;
  /**
   * Which weighted category this counts towards, or undefined for "not filed".
   *
   * Optional and staying optional. Every assignment that predates the gradebook
   * has no category, and a teacher who never sets any still gets a working
   * grade -- see `buildGrades`, which falls back to plain points across
   * everything marked. "Uncategorised" is a real state, not a migration
   * failure.
   */
  categoryId?: string;
  /**
   * Links and materials a student can open. Empty far more often than not, so
   * it is absent rather than an empty array on the shapes that never had one.
   */
  resources?: AssignmentResource[];
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

/**
 * One link or file attached to an assignment: the reading, the slide deck, the
 * practice set.
 *
 * A label and a URL and nothing else. Anything richer -- a type, an icon, a
 * size -- would be a guess we cannot check, since we never fetch the link.
 */
export interface AssignmentResource {
  label: string;
  url: string;
}

/**
 * True only for links we are willing to render as an anchor.
 *
 * http and https, nothing else. `javascript:` and `data:` URLs in an href are
 * the oldest way to turn a teacher's text box into a script that runs in a
 * student's session, and a teacher has no reason to need either. Parsing with
 * `URL` rather than a regular expression because the browser's parser is the
 * thing that will eventually interpret the string, so it is the only opinion
 * that counts.
 */
export function isSafeResourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Drops anything unsafe or unlabelled. Applied on the way in and on the way out. */
export function cleanResources(resources: readonly AssignmentResource[]): AssignmentResource[] {
  return resources
    .map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
    .filter((r) => r.label.length > 0 && isSafeResourceUrl(r.url));
}

// ------------------------------------------------------------------ grading

/**
 * One weighted bucket in a class: "Tests", worth 75.
 *
 * `weight` is percentage points as the teacher typed them, and is NOT
 * guaranteed to sum to 100 across a class. See `buildGrades` for what happens
 * when it does not; the short version is that it normalises and says so.
 */
export interface GradeCategory {
  id: string;
  classId: string;
  name: string;
  weight: number;
  /** The order the teacher put them in, which is usually weightiest first. */
  position: number;
}

/**
 * One student's mark on one assignment.
 *
 * The absence of a `Grade` is the whole point. Every lookup in this app returns
 * `Grade | null`, never a number with a sentinel, because ungraded and zero are
 * different facts and a student whose unmarked homework reads 0% stops
 * believing the app immediately. TypeScript refusing `grade.pointsEarned` on a
 * possibly-null value is exactly the check we want at every call site.
 */
export interface Grade {
  assignmentId: string;
  studentId: string;
  pointsEarned: number;
  comment?: string;
  /** Who marked it. Null for an import, or a teacher whose account is gone. */
  recordedBy: string | null;
  updatedAt: number;
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
