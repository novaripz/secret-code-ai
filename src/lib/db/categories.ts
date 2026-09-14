import type { SupabaseClient } from "@supabase/supabase-js";
import type { GradeCategory } from "@/lib/school/types";
import { assertOk, unwrap } from "./errors";
import { GRADE_CATEGORY_COLUMNS, toGradeCategory, type GradeCategoryRow } from "./rows";

// The weighted buckets a class's grade is made of: "Tests 75", "Homework 25".
//
// Small file, one idea: these are the teacher's declaration of what matters,
// and nothing in here checks that the weights sum to 100. That is not an
// oversight. A teacher halfway through typing has a total of 75, and a data
// layer that refuses the write makes the form impossible to use. The sum is a
// property of the set, it is computed and shown live on the teacher's screen,
// and src/lib/school/grades.ts normalises whatever it is given and says on the
// student's screen that it did.
//
// Reads are allowed to the enrolled student as well as the teacher — the
// policy in 0005 says so — because a grade breakdown without the weights behind
// it is a number a student cannot argue with.

export async function listCategories(
  supabase: SupabaseClient,
  classId: string,
): Promise<GradeCategory[]> {
  const rows = unwrap(
    await supabase
      .from("grade_categories")
      .select(GRADE_CATEGORY_COLUMNS)
      .eq("class_id", classId)
      // Position, then name as the tiebreak, so two categories created in the
      // same second do not swap places between renders.
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .returns<GradeCategoryRow[]>(),
    "loading grade categories",
  );
  return rows.map(toGradeCategory);
}

/**
 * Categories for several classes at once.
 *
 * The student's grade view needs every class they are in, and asking per class
 * would mean six round trips to draw one screen. RLS still applies per row, so
 * a class they are not in contributes nothing rather than erroring.
 */
export async function listCategoriesForClasses(
  supabase: SupabaseClient,
  classIds: readonly string[],
): Promise<GradeCategory[]> {
  if (classIds.length === 0) return [];
  const rows = unwrap(
    await supabase
      .from("grade_categories")
      .select(GRADE_CATEGORY_COLUMNS)
      .in("class_id", [...classIds])
      .order("position", { ascending: true })
      .returns<GradeCategoryRow[]>(),
    "loading grade categories",
  );
  return rows.map(toGradeCategory);
}

export interface NewCategory {
  name: string;
  weight: number;
  position?: number;
}

export async function createCategory(
  supabase: SupabaseClient,
  classId: string,
  input: NewCategory,
): Promise<GradeCategory> {
  const row = unwrap(
    await supabase
      .from("grade_categories")
      .insert({
        class_id: classId,
        name: input.name.trim(),
        weight: input.weight,
        position: input.position ?? 0,
      })
      .select(GRADE_CATEGORY_COLUMNS)
      .single()
      .returns<GradeCategoryRow>(),
    "creating a grade category",
  );
  return toGradeCategory(row);
}

export type CategoryPatch = Partial<Pick<GradeCategory, "name" | "weight" | "position">>;

export async function updateCategory(
  supabase: SupabaseClient,
  categoryId: string,
  patch: CategoryPatch,
): Promise<GradeCategory> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.weight !== undefined) update.weight = patch.weight;
  if (patch.position !== undefined) update.position = patch.position;

  const row = unwrap(
    await supabase
      .from("grade_categories")
      .update(update)
      .eq("id", categoryId)
      .select(GRADE_CATEGORY_COLUMNS)
      .single()
      .returns<GradeCategoryRow>(),
    "saving a grade category",
  );
  return toGradeCategory(row);
}

/**
 * Deletes the category. The assignments filed under it survive and become
 * uncategorised — `on delete set null` in the migration — because deleting
 * "Homework" must not delete the homework, or the marks on it.
 */
export async function deleteCategory(
  supabase: SupabaseClient,
  categoryId: string,
): Promise<void> {
  assertOk(
    await supabase.from("grade_categories").delete().eq("id", categoryId),
    "deleting a grade category",
  );
}

/**
 * Writes a whole ordering in one go, after a reorder.
 *
 * Sequential rather than parallel: an `upsert` would need every column and a
 * half-applied parallel batch leaves an order nobody chose. Category counts are
 * in the single digits, so the cost of being boring here is a few milliseconds.
 */
export async function reorderCategories(
  supabase: SupabaseClient,
  orderedIds: readonly string[],
): Promise<void> {
  for (const [position, id] of orderedIds.entries()) {
    assertOk(
      await supabase.from("grade_categories").update({ position }).eq("id", id),
      "reordering grade categories",
    );
  }
}
