import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade } from "@/lib/school/types";
import { assertOk, unwrap } from "./errors";
import { GRADE_COLUMNS, toGrade, type GradeRow } from "./rows";

// Marks.
//
// Every function here returns `Grade` or `Grade[]`, and the lookups the UI
// builds from them are `Map<..., Grade>` — never a map with a zero default.
// That is the one rule this file enforces and it is enforced by omission: there
// is no `gradeOr(0)` helper, no `pointsFor(assignment, student): number`, and
// nothing that turns a missing row into a value. A caller that wants a number
// out of a missing mark has to write the coercion themselves, in the open,
// where a reviewer can ask them why.
//
// Why it matters enough to shape the module: "not marked yet" and "got zero"
// look identical the moment either becomes a 0, and they are opposite messages
// to the person reading them. See supabase/migrations/0005_gradebook.sql and
// src/lib/school/grades.ts, which excludes the first and counts the second.
//
// Writes are the teacher's — RLS refuses a student's insert, and there is no
// function here that would let the UI attempt one.

/** Every mark on one assignment, across the class. The grid's row. */
export async function listGradesForAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<Grade[]> {
  const rows = unwrap(
    await supabase
      .from("grades")
      .select(GRADE_COLUMNS)
      .eq("assignment_id", assignmentId)
      .returns<GradeRow[]>(),
    "loading grades",
  );
  return rows.map(toGrade);
}

/**
 * Every mark in one class, in one request.
 *
 * The teacher's grid is a whole class by a whole roster, so fetching per
 * assignment would be one round trip per column. The filter is a subselect on
 * `assignments` through PostgREST's embedded syntax, which RLS still evaluates
 * row by row: a teacher gets their class, and nobody else's.
 */
export async function listGradesForClass(
  supabase: SupabaseClient,
  assignmentIds: readonly string[],
): Promise<Grade[]> {
  if (assignmentIds.length === 0) return [];
  const rows = unwrap(
    await supabase
      .from("grades")
      .select(GRADE_COLUMNS)
      .in("assignment_id", [...assignmentIds])
      .returns<GradeRow[]>(),
    "loading grades",
  );
  return rows.map(toGrade);
}

/**
 * Every mark belonging to one student.
 *
 * The `student_id` filter is not what protects them — the select policy already
 * limits a student to `student_id = auth.uid()`, so a student asking about a
 * classmate gets an empty list rather than data. It is here because a teacher
 * calls this too, and because relying on a policy to *shape* a result rather
 * than to *guard* it is how subtle bugs start. Same reasoning as
 * `listAssignmentsForStudent`.
 */
export async function listGradesForStudent(
  supabase: SupabaseClient,
  studentId: string,
): Promise<Grade[]> {
  const rows = unwrap(
    await supabase
      .from("grades")
      .select(GRADE_COLUMNS)
      .eq("student_id", studentId)
      .returns<GradeRow[]>(),
    "loading your grades",
  );
  return rows.map(toGrade);
}

export interface GradeInput {
  assignmentId: string;
  studentId: string;
  pointsEarned: number;
  comment?: string;
  /** The teacher doing the marking. Stored so a mark can be attributed later. */
  recordedBy: string;
}

/**
 * Records or replaces one mark.
 *
 * An upsert on the `(assignment_id, student_id)` unique constraint, so typing
 * over a score corrects it instead of accumulating a history nobody asked for.
 * If that history is ever wanted it should be a table that says so, not a side
 * effect of how this function was written.
 */
export async function setGrade(
  supabase: SupabaseClient,
  input: GradeInput,
): Promise<Grade> {
  const row = unwrap(
    await supabase
      .from("grades")
      .upsert(
        {
          assignment_id: input.assignmentId,
          student_id: input.studentId,
          points_earned: input.pointsEarned,
          comment: input.comment?.trim() || null,
          recorded_by: input.recordedBy,
        },
        { onConflict: "assignment_id,student_id" },
      )
      .select(GRADE_COLUMNS)
      .single()
      .returns<GradeRow>(),
    "saving a grade",
  );
  return toGrade(row);
}

/**
 * Un-marks it: back to ungraded, which is not the same as marking it zero.
 *
 * This function exists precisely so the teacher's grid has a way to say "I
 * shouldn't have entered that" that does not leave a 0 behind. Clearing the box
 * calls this; typing 0 calls `setGrade`.
 */
export async function clearGrade(
  supabase: SupabaseClient,
  assignmentId: string,
  studentId: string,
): Promise<void> {
  assertOk(
    await supabase
      .from("grades")
      .delete()
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId),
    "clearing a grade",
  );
}

/** Marks keyed by student, for one assignment. Absent means ungraded. */
export function gradesByStudent(grades: readonly Grade[]): Map<string, Grade> {
  return new Map(grades.map((g) => [g.studentId, g]));
}

/** Marks keyed by `assignmentId`, for one student. Absent means ungraded. */
export function gradesByAssignment(grades: readonly Grade[]): Map<string, Grade> {
  return new Map(grades.map((g) => [g.assignmentId, g]));
}

/** Marks keyed by `${assignmentId}:${studentId}` — the grid's whole lookup. */
export function gradeKey(assignmentId: string, studentId: string): string {
  return `${assignmentId}:${studentId}`;
}

export function gradesByCell(grades: readonly Grade[]): Map<string, Grade> {
  return new Map(grades.map((g) => [gradeKey(g.assignmentId, g.studentId), g]));
}
