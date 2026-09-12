import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap, unwrapMaybe } from "./errors";
import { PROFILE_COLUMNS, toProfile, type Profile, type ProfileRow } from "./rows";

// A person's own row: their name, their two language settings, and their role.
//
// There is no `setRole` here, and its absence is the point. The migration
// installs a trigger that raises 42501 when an account tries to change its own
// role, because the word "teacher" is the only thing standing between a student
// and everybody else's work. Promotion is a line of SQL run by whoever owns the
// project; see docs/DATABASE.md. A function here would only be a nicer-looking
// way to get that exception.
//
// `getProfile` can legitimately come back null: the row is created by a trigger
// on sign-up, and a caller racing that trigger should see "not yet" rather than
// an error it can't act on.

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const row = unwrapMaybe(
    await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle()
      .returns<ProfileRow>(),
    "reading your profile",
  );
  return row ? toProfile(row) : null;
}

export interface ProfilePatch {
  displayName?: string;
  interfaceLanguage?: string;
  replyLanguage?: string;
}

/**
 * Updates the signed-in account's own row. The id is passed rather than
 * inferred so the caller's intent is visible at the call site; RLS is what
 * actually confines the write, and it will refuse any other id.
 */
export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const update: Record<string, string> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName.trim();
  if (patch.interfaceLanguage !== undefined) update.interface_language = patch.interfaceLanguage;
  if (patch.replyLanguage !== undefined) update.reply_language = patch.replyLanguage;

  if (Object.keys(update).length === 0) {
    // An empty PATCH is a round trip that updates every row the policy allows
    // — here, one row, harmlessly — but it also returns no useful answer. Read
    // instead, and make the caller's no-op cost the same as a read.
    const current = await getProfile(supabase, userId);
    if (!current) throw new Error("No profile to update; the account may not have finished signing up.");
    return current;
  }

  const row = unwrap(
    await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .select(PROFILE_COLUMNS)
      .single()
      .returns<ProfileRow>(),
    "saving your profile",
  );
  return toProfile(row);
}

/**
 * The students a teacher can see — one row per profile they teach, which the
 * `profiles_select_own_students` policy defines as "enrolled in a class you
 * own". Used to put names on a roster.
 */
export async function listStudentProfiles(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<Profile[]> {
  if (studentIds.length === 0) return [];
  const rows = unwrap(
    await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .in("id", studentIds)
      .returns<ProfileRow[]>(),
    "reading student profiles",
  );
  return rows.map(toProfile);
}
