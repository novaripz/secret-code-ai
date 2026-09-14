import {
  DEFAULT_RULES,
  cleanResources,
  type Assignment,
  type AssignmentResource,
  type Grade,
  type GradeCategory,
  type AssignmentRules,
  type AssignmentStatus,
  type Role,
  type SchoolClass,
  type Source,
} from "@/lib/school/types";

// The rows as Postgres actually stores them, and the two-way translation to the
// shapes the app already speaks.
//
// Hand-written rather than generated. The generated Supabase types are a
// faithful dump of the schema, which means every query result arrives as
// nullable everything and every call site pays for it; these say what the
// migration's `not null` constraints already guarantee. The cost is that this
// file has to be edited when 0001_init.sql is, and the comment at the top of
// each block names the table so that edit is findable.
//
// Three mismatches with src/lib/school/types.ts are resolved here rather than
// anywhere else, because a translation layer spread over six files is a bug
// farm:
//
//   1. snake_case columns, camelCase fields. Mechanical, but it only happens
//      here.
//   2. `answers` is `after_understanding` in the enum and `afterUnderstanding`
//      in TypeScript. Postgres enum labels are snake_case by convention and
//      renaming either side to match the other would be worse than the map.
//   3. An `Assignment` in the app carries a `status`, but status is per student
//      and lives in its own table (see the note above `assignment_status` in
//      the migration). So `toAssignment` takes the status as an argument: the
//      caller is the one who knows whose status it is, and a teacher reading
//      the class list has no single answer to that question at all.

// --------------------------------------------------------------- profiles

export interface ProfileRow {
  id: string;
  role: Role;
  display_name: string;
  email: string | null;
  interface_language: string;
  reply_language: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  role: Role;
  displayName: string;
  email: string | null;
  interfaceLanguage: string;
  /** "auto" means "follow the interface language". */
  replyLanguage: string;
  createdAt: number;
  updatedAt: number;
}

export const PROFILE_COLUMNS =
  "id, role, display_name, email, interface_language, reply_language, created_at, updated_at";

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    interfaceLanguage: row.interface_language,
    replyLanguage: row.reply_language,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

// ---------------------------------------------------------------- classes

export interface ClassRow {
  id: string;
  teacher_id: string;
  name: string;
  teacher_name: string | null;
  color: string | null;
  source: Source;
  external_id: string | null;
  created_at: string;
}

export const CLASS_COLUMNS =
  "id, teacher_id, name, teacher_name, color, source, external_id, created_at";

/**
 * `SchoolClass` has no `teacherId` — in the browser version there was only ever
 * one account, so ownership was implicit. It is returned alongside rather than
 * bolted onto the shared type, so the existing UI keeps compiling and the
 * teacher views can ask for what they need.
 */
export interface ClassWithOwner extends SchoolClass {
  teacherId: string;
}

export function toSchoolClass(row: ClassRow): ClassWithOwner {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.name,
    teacher: row.teacher_name ?? undefined,
    color: row.color ?? undefined,
    source: row.source,
    externalId: row.external_id ?? undefined,
    createdAt: Date.parse(row.created_at),
  };
}

// ------------------------------------------------------------ enrollments

export interface EnrollmentRow {
  id: string;
  class_id: string;
  student_id: string;
  created_at: string;
}

export const ENROLLMENT_COLUMNS = "id, class_id, student_id, created_at";

export interface InviteRow {
  id: string;
  class_id: string;
  email: string;
  invited_by: string;
  created_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
}

export const INVITE_COLUMNS =
  "id, class_id, email, invited_by, created_at, claimed_at, claimed_by";

export interface Invite {
  id: string;
  classId: string;
  email: string;
  invitedBy: string;
  createdAt: number;
  /** Null until an account with this address signs in. */
  claimedAt: number | null;
  claimedBy: string | null;
}

export function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    classId: row.class_id,
    email: row.email,
    invitedBy: row.invited_by,
    createdAt: Date.parse(row.created_at),
    claimedAt: row.claimed_at ? Date.parse(row.claimed_at) : null,
    claimedBy: row.claimed_by,
  };
}

// ------------------------------------------------------------ assignments

export type AnswersColumn = "guided" | "after_understanding" | "allowed";
export type FeatureColumn = "allowed" | "disabled";

export interface AssignmentRow {
  id: string;
  class_id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  points: number | null;
  estimate_minutes: number | null;
  teacher_priority: boolean;
  category_id: string | null;
  resources: unknown;
  source: Source;
  external_id: string | null;
  panda_instructions: string | null;
  answers: AnswersColumn;
  translation: FeatureColumn;
  simplification: FeatureColumn;
  restriction_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const ASSIGNMENT_COLUMNS = [
  "id",
  "class_id",
  "title",
  "instructions",
  "due_at",
  "points",
  "estimate_minutes",
  "teacher_priority",
  "category_id",
  "resources",
  "source",
  "external_id",
  "panda_instructions",
  "answers",
  "translation",
  "simplification",
  "restriction_reason",
  "created_at",
  "updated_at",
].join(", ");

export function toAnswersPolicy(value: AnswersColumn): AssignmentRules["answers"] {
  return value === "after_understanding" ? "afterUnderstanding" : value;
}

export function fromAnswersPolicy(value: AssignmentRules["answers"]): AnswersColumn {
  return value === "afterUnderstanding" ? "after_understanding" : value;
}

/** The rules half of an assignment row, as the UI models it. */
export function toRules(row: AssignmentRow): AssignmentRules {
  return {
    assignmentId: row.id,
    pandaInstructions: row.panda_instructions ?? undefined,
    answers: toAnswersPolicy(row.answers),
    translation: row.translation,
    simplification: row.simplification,
    restrictionReason: row.restriction_reason ?? undefined,
  };
}

/**
 * The assignment half. `status` defaults to "todo" because a student with no
 * row in `assignment_status` has not started — the absence of the row *is* the
 * todo state, which is why nothing writes one on the student's behalf.
 */
export function toAssignment(row: AssignmentRow, status: AssignmentStatus = "todo"): Assignment {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    instructions: row.instructions ?? undefined,
    dueAt: row.due_at ? Date.parse(row.due_at) : null,
    // `points` is numeric in Postgres, so PostgREST may hand it over as a
    // string once it stops fitting a double. Coerce rather than trusting it.
    points: row.points === null ? undefined : Number(row.points),
    estimateMinutes: row.estimate_minutes ?? undefined,
    // `not null default false` in the migration, so this is a boolean and not a
    // maybe. Kept optional on `Assignment` only because the browser-store data
    // that predates the column has no such field.
    teacherPinned: row.teacher_priority,
    categoryId: row.category_id ?? undefined,
    // Cleaned on the way out as well as on the way in. The column is jsonb with
    // only a shape check, so a row written before this code existed -- or by
    // hand in the SQL editor -- can hold anything; the student's page renders
    // these as anchors, and an unchecked `javascript:` href there is the whole
    // attack. Cheap, and the one place every read passes through.
    resources: toResources(row.resources),
    status,
    source: row.source,
    externalId: row.external_id ?? undefined,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

/**
 * jsonb in, a list of links out. Anything that is not an array of
 * `{label, url}` with an http(s) URL is dropped rather than rendered.
 */
export function toResources(value: unknown): AssignmentResource[] {
  if (!Array.isArray(value)) return [];
  const candidates = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { label, url } = entry as { label?: unknown; url?: unknown };
    if (typeof label !== "string" || typeof url !== "string") return [];
    return [{ label, url }];
  });
  return cleanResources(candidates);
}

// ------------------------------------------------------- grade_categories

export interface GradeCategoryRow {
  id: string;
  class_id: string;
  name: string;
  weight: number | string;
  position: number;
  created_at: string;
  updated_at: string;
}

export const GRADE_CATEGORY_COLUMNS =
  "id, class_id, name, weight, position, created_at, updated_at";

export function toGradeCategory(row: GradeCategoryRow): GradeCategory {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    // Numeric, so PostgREST may hand it over as a string. Same coercion as
    // `points` above, for the same reason.
    weight: Number(row.weight),
    position: row.position,
  };
}

// ------------------------------------------------------------------ grades

export interface GradeRow {
  id: string;
  assignment_id: string;
  student_id: string;
  points_earned: number | string;
  comment: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export const GRADE_COLUMNS =
  "id, assignment_id, student_id, points_earned, comment, recorded_by, created_at, updated_at";

/**
 * A row becomes a `Grade`. There is deliberately no function here that turns
 * *no row* into anything: the absence of a grade stays the absence of a value
 * all the way to the UI, because the moment it gains a default it becomes a
 * zero, and a zero is a different fact. See supabase/migrations/0005.
 */
export function toGrade(row: GradeRow): Grade {
  return {
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    pointsEarned: Number(row.points_earned),
    comment: row.comment ?? undefined,
    recordedBy: row.recorded_by,
    updatedAt: Date.parse(row.updated_at),
  };
}

/** An assignment and its rules, which is how every read of one arrives. */
export interface AssignmentWithRules {
  assignment: Assignment;
  rules: AssignmentRules;
}

export function toAssignmentWithRules(
  row: AssignmentRow,
  status: AssignmentStatus = "todo",
): AssignmentWithRules {
  return { assignment: toAssignment(row, status), rules: toRules(row) };
}

export const DEFAULT_RULE_COLUMNS = {
  answers: fromAnswersPolicy(DEFAULT_RULES.answers),
  translation: DEFAULT_RULES.translation,
  simplification: DEFAULT_RULES.simplification,
} as const;

// ------------------------------------------------------ assignment_status

export interface AssignmentStatusRow {
  id: string;
  assignment_id: string;
  student_id: string;
  status: AssignmentStatus;
  updated_at: string;
}

export const ASSIGNMENT_STATUS_COLUMNS = "id, assignment_id, student_id, status, updated_at";
