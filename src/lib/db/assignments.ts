import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment, AssignmentRules, AssignmentStatus } from "@/lib/school/types";
import { assertOk, unwrap, unwrapMaybe } from "./errors";
import {
  ASSIGNMENT_COLUMNS,
  fromAnswersPolicy,
  toAssignmentWithRules,
  type AssignmentRow,
  type AssignmentWithRules,
} from "./rows";

// Assignments, and the rules attached to them.
//
// Rules live in the same row and are split apart on the way out, because the
// app has always modelled them as a separate `AssignmentRules` object and the
// UI reads better for it — but they are one-to-one with an assignment and read
// on every read of one, so giving them their own table would have bought a join
// and a second set of policies for nothing. The split is a presentation choice
// and this file is where it happens.
//
// Status is the opposite case: genuinely per student, genuinely its own table,
// and handled in ./status.ts. A read here returns assignments with status
// "todo" unless the caller asks for a student's view, which is what
// `listAssignmentsForStudent` is for. Defaulting to "todo" is not a guess: a
// student with no status row has not started, which is exactly what the absent
// row means.

export async function listAssignments(
  supabase: SupabaseClient,
  classId: string,
): Promise<AssignmentWithRules[]> {
  const rows = unwrap(
    await supabase
      .from("assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq("class_id", classId)
      .order("due_at", { ascending: true, nullsFirst: false })
      .returns<AssignmentRow[]>(),
    "loading assignments",
  );
  return rows.map((row) => toAssignmentWithRules(row));
}

/**
 * Every assignment in every class the student is enrolled in, with their own
 * status folded in. One request, because this is the planner's entire input and
 * splitting it would mean showing a half-drawn list.
 *
 * The embedded `assignment_status` is filtered to the caller by RLS, but the
 * explicit `student_id` filter stays: a teacher who is also a student would
 * otherwise pull in their own rows for assignments they set, and relying on a
 * policy to shape a result rather than to guard it is how subtle bugs start.
 */
export async function listAssignmentsForStudent(
  supabase: SupabaseClient,
  studentId: string,
): Promise<AssignmentWithRules[]> {
  const rows = unwrap(
    await supabase
      .from("assignments")
      .select(`${ASSIGNMENT_COLUMNS}, assignment_status!left (status, student_id)`)
      .eq("assignment_status.student_id", studentId)
      .order("due_at", { ascending: true, nullsFirst: false })
      .returns<(AssignmentRow & { assignment_status: { status: AssignmentStatus }[] })[]>(),
    "loading your assignments",
  );
  return rows.map((row) => toAssignmentWithRules(row, row.assignment_status[0]?.status ?? "todo"));
}

export async function getAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<AssignmentWithRules | null> {
  const row = unwrapMaybe(
    await supabase
      .from("assignments")
      .select(ASSIGNMENT_COLUMNS)
      .eq("id", assignmentId)
      .maybeSingle()
      .returns<AssignmentRow>(),
    "loading an assignment",
  );
  return row ? toAssignmentWithRules(row) : null;
}

export interface NewAssignment {
  classId: string;
  title: string;
  instructions?: string;
  /** Epoch millis, or null for "no deadline". */
  dueAt?: number | null;
  points?: number;
  estimateMinutes?: number;
  source?: "local" | "canvas";
  externalId?: string;
  rules?: Partial<Omit<AssignmentRules, "assignmentId">>;
}

export async function createAssignment(
  supabase: SupabaseClient,
  input: NewAssignment,
): Promise<AssignmentWithRules> {
  const row = unwrap(
    await supabase
      .from("assignments")
      .insert({
        class_id: input.classId,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        due_at: toTimestamp(input.dueAt ?? null),
        points: input.points ?? null,
        estimate_minutes: input.estimateMinutes ?? null,
        source: input.source ?? "local",
        external_id: input.externalId ?? null,
        // Omitted rule fields fall to the column defaults, which are the same
        // values as DEFAULT_RULES. Said once, in the migration.
        ...rulesUpdate(input.rules ?? {}),
      })
      .select(ASSIGNMENT_COLUMNS)
      .single()
      .returns<AssignmentRow>(),
    "creating an assignment",
  );
  return toAssignmentWithRules(row);
}

export type AssignmentPatch = Partial<
  Pick<Assignment, "title" | "instructions" | "dueAt" | "points" | "estimateMinutes">
>;

/**
 * Edits the assignment, its rules, or both. One function because they are one
 * row: a teacher who changes the due date and switches translation off in the
 * same dialogue should get one write and one failure mode, not two.
 */
export async function updateAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  patch: AssignmentPatch,
  rules: Partial<Omit<AssignmentRules, "assignmentId">> = {},
): Promise<AssignmentWithRules> {
  const update: Record<string, unknown> = { ...rulesUpdate(rules) };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.instructions !== undefined) update.instructions = patch.instructions?.trim() || null;
  if (patch.dueAt !== undefined) update.due_at = toTimestamp(patch.dueAt);
  if (patch.points !== undefined) update.points = patch.points ?? null;
  if (patch.estimateMinutes !== undefined) update.estimate_minutes = patch.estimateMinutes ?? null;

  if (Object.keys(update).length === 0) {
    const current = await getAssignment(supabase, assignmentId);
    if (!current) throw new Error("That assignment no longer exists.");
    return current;
  }

  const row = unwrap(
    await supabase
      .from("assignments")
      .update(update)
      .eq("id", assignmentId)
      .select(ASSIGNMENT_COLUMNS)
      .single()
      .returns<AssignmentRow>(),
    "saving an assignment",
  );
  return toAssignmentWithRules(row);
}

/** Sets rules alone. Mirrors `setRules` in the browser store. */
export async function setRules(
  supabase: SupabaseClient,
  assignmentId: string,
  rules: Partial<Omit<AssignmentRules, "assignmentId">>,
): Promise<AssignmentRules> {
  const result = await updateAssignment(supabase, assignmentId, {}, rules);
  return result.rules;
}

export async function deleteAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<void> {
  assertOk(
    await supabase.from("assignments").delete().eq("id", assignmentId),
    "deleting an assignment",
  );
}

// ------------------------------------------------------------------ local

/** Epoch millis in, `timestamptz` out. Null stays null: it means "no deadline". */
function toTimestamp(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function rulesUpdate(rules: Partial<Omit<AssignmentRules, "assignmentId">>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (rules.pandaInstructions !== undefined) {
    update.panda_instructions = rules.pandaInstructions?.trim() || null;
  }
  if (rules.answers !== undefined) update.answers = fromAnswersPolicy(rules.answers);
  if (rules.translation !== undefined) update.translation = rules.translation;
  if (rules.simplification !== undefined) update.simplification = rules.simplification;
  if (rules.restrictionReason !== undefined) {
    update.restriction_reason = rules.restrictionReason?.trim() || null;
  }
  return update;
}
