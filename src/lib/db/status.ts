import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentStatus } from "@/lib/school/types";
import { unwrap } from "./errors";
import {
  ASSIGNMENT_STATUS_COLUMNS,
  type AssignmentStatusRow,
} from "./rows";

// Whether a student has started, is working, or is done.
//
// This is the one table in the schema a teacher cannot write. Not because
// marking work done on a student's behalf would be catastrophic, but because
// the moment it is possible the number stops meaning anything — "done" has to
// be the student's own word or the planner is guessing. The policies enforce
// that; this file just doesn't offer a way to try.
//
// Writes are upserts on the (assignment_id, student_id) unique constraint. A
// student who has never touched an assignment has no row at all, and clicking
// "doing" is the first one; there is no place in the UI where a row is created
// in advance, and creating them eagerly would mean writing thirty rows every
// time a teacher sets an assignment.

export async function listStatuses(
  supabase: SupabaseClient,
  studentId: string,
): Promise<AssignmentStatusRow[]> {
  return unwrap(
    await supabase
      .from("assignment_status")
      .select(ASSIGNMENT_STATUS_COLUMNS)
      .eq("student_id", studentId)
      .returns<AssignmentStatusRow[]>(),
    "loading your progress",
  );
}

/**
 * What a teacher sees: every student's status for one assignment.
 * `assignment_status_select_visible` allows this for the teacher of the class;
 * absent rows mean "todo", so a short list here is not a short class.
 */
export async function listStatusesForAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<AssignmentStatusRow[]> {
  return unwrap(
    await supabase
      .from("assignment_status")
      .select(ASSIGNMENT_STATUS_COLUMNS)
      .eq("assignment_id", assignmentId)
      .returns<AssignmentStatusRow[]>(),
    "loading class progress",
  );
}

/**
 * Mirrors `setStatus` in the browser store. `studentId` must be the signed-in
 * account — the policy sees to that — and is passed explicitly because the
 * upsert needs it as a column value, not just as a filter.
 */
export async function setStatus(
  supabase: SupabaseClient,
  assignmentId: string,
  studentId: string,
  status: AssignmentStatus,
): Promise<AssignmentStatusRow> {
  return unwrap(
    await supabase
      .from("assignment_status")
      .upsert(
        { assignment_id: assignmentId, student_id: studentId, status },
        // Named rather than inferred: PostgREST needs the constraint's columns
        // to turn this into `on conflict`, and the unique (assignment_id,
        // student_id) in the migration is what makes a second click an update
        // instead of a duplicate-key error.
        { onConflict: "assignment_id,student_id" },
      )
      .select(ASSIGNMENT_STATUS_COLUMNS)
      .single()
      .returns<AssignmentStatusRow>(),
    "saving your progress",
  );
}
