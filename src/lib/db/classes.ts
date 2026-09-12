import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOk, unwrap, unwrapMaybe } from "./errors";
import { CLASS_COLUMNS, toSchoolClass, type ClassRow, type ClassWithOwner } from "./rows";

// Classes, from both ends.
//
// The two list functions look almost identical and are kept apart on purpose.
// `classes_select_visible` lets you see a class you own *or* one you're
// enrolled in, so a single `select *` would hand a teacher who is also taking a
// course one undifferentiated pile. Which end you are asking from is something
// only the caller knows, so the caller says it in the function name, and the
// filter that follows is an ordinary predicate rather than a permission check
// — Postgres has already done that part.
//
// Naming follows src/store/useSchoolStore.ts (addClass / updateClass /
// removeClass) so that swapping localStorage for this reads as obvious.

export async function listOwnedClasses(
  supabase: SupabaseClient,
  teacherId: string,
): Promise<ClassWithOwner[]> {
  const rows = unwrap(
    await supabase
      .from("classes")
      .select(CLASS_COLUMNS)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: true })
      .returns<ClassRow[]>(),
    "loading your classes",
  );
  return rows.map(toSchoolClass);
}

/**
 * The classes a student has been enrolled in. Done as a filter on `enrollments`
 * with an embedded class rather than a second round trip, because the roster is
 * what the student's whole home screen hangs off and one request is one
 * spinner.
 */
export async function listEnrolledClasses(
  supabase: SupabaseClient,
  studentId: string,
): Promise<ClassWithOwner[]> {
  const rows = unwrap(
    await supabase
      .from("enrollments")
      .select(`class:classes (${CLASS_COLUMNS})`)
      .eq("student_id", studentId)
      .returns<{ class: ClassRow | null }[]>(),
    "loading your classes",
  );
  // The embedded row can be null only if the class vanished between the two
  // halves of the query; the foreign key makes that a narrow race, not a state.
  return rows.flatMap((r) => (r.class ? [toSchoolClass(r.class)] : []));
}

export async function getClass(
  supabase: SupabaseClient,
  classId: string,
): Promise<ClassWithOwner | null> {
  const row = unwrapMaybe(
    await supabase
      .from("classes")
      .select(CLASS_COLUMNS)
      .eq("id", classId)
      .maybeSingle()
      .returns<ClassRow>(),
    "loading a class",
  );
  return row ? toSchoolClass(row) : null;
}

export interface NewClass {
  name: string;
  /** Free text label ("Ms. Alvarez", "Period 3"), not a reference to an account. */
  teacher?: string;
  color?: string;
  source?: "local" | "canvas";
  externalId?: string;
}

/**
 * `teacherId` is spelled out rather than left to a default, because the insert
 * policy compares it to auth.uid() and a mismatch should read as the caller's
 * mistake at the call site, not as a mysterious 42501.
 */
export async function createClass(
  supabase: SupabaseClient,
  teacherId: string,
  input: NewClass,
): Promise<ClassWithOwner> {
  const row = unwrap(
    await supabase
      .from("classes")
      .insert({
        teacher_id: teacherId,
        name: input.name.trim(),
        teacher_name: input.teacher?.trim() || null,
        color: input.color ?? null,
        source: input.source ?? "local",
        external_id: input.externalId ?? null,
      })
      .select(CLASS_COLUMNS)
      .single()
      .returns<ClassRow>(),
    "creating a class",
  );
  return toSchoolClass(row);
}

export interface ClassPatch {
  name?: string;
  teacher?: string | null;
  color?: string | null;
}

export async function updateClass(
  supabase: SupabaseClient,
  classId: string,
  patch: ClassPatch,
): Promise<ClassWithOwner> {
  const update: Record<string, string | null> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  // Distinguishing undefined from null matters: "leave the label alone" and
  // "clear the label" are different edits and the UI can make both.
  if (patch.teacher !== undefined) update.teacher_name = patch.teacher?.trim() || null;
  if (patch.color !== undefined) update.color = patch.color ?? null;

  const row = unwrap(
    await supabase
      .from("classes")
      .update(update)
      .eq("id", classId)
      .select(CLASS_COLUMNS)
      .single()
      .returns<ClassRow>(),
    "saving a class",
  );
  return toSchoolClass(row);
}

/**
 * Deletes the class. Assignments, enrollments, invites and every student's
 * status rows go with it, by `on delete cascade` — the same sweep
 * `removeClass` does by hand in the browser store, done where it cannot be
 * half-finished by a closed tab.
 */
export async function deleteClass(supabase: SupabaseClient, classId: string): Promise<void> {
  assertOk(await supabase.from("classes").delete().eq("id", classId), "deleting a class");
}
