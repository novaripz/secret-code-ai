import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { unwrap, unwrapMaybe } from "./errors";
import { PROFILE_COLUMNS, toProfile, type Profile, type ProfileRow } from "./rows";
import type { Role } from "@/lib/school/types";

// A person's own row: their name, their two language settings, and their role.
//
// There is no `setRole` here, and its absence is the point. The migration
// installs a trigger that raises 42501 when an account tries to change its own
// role, because the word "teacher" is the only thing standing between a student
// and everybody else's work. Promotion is a line of SQL run by whoever owns the
// project; see docs/DATABASE.md. A function here would only be a nicer-looking
// way to get that exception.
//
// There is no `setRole` still, but there is now `redeemTeacherCode`, and the
// difference between the two is the whole design. Setting a role is an account
// deciding what it is; redeeming is an account presenting something a person
// with the authority to grant it wrote down first. The row it checks lives in a
// table no browser can read, so the code cannot be guessed from here, and the
// function is the only thing the trigger will let through.
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

/** What `rpc` actually resolves to, minus the set-returning assumption. */
type Result<T> = { data: T | null; error: PostgrestError | null };

/**
 * Trades a teacher code for the teacher role, and returns the role the server
 * settled on rather than the one we hoped for — the caller should believe the
 * database, not its own optimism, and then re-read the profile anyway.
 *
 * Every way this can fail comes back as the same 42501 with the same sentence,
 * deliberately: an unknown code, an expired one, a revoked one and a spent one
 * are indistinguishable from out here, because telling them apart would turn
 * the redeem box into an oracle for discovering live codes. So this wrapper
 * passes the server's message through untouched and adds nothing of its own —
 * any "hint" we invented would be exactly the leak the migration avoided.
 *
 * The code is never logged, for the same reason a password isn't.
 */
export async function redeemTeacherCode(supabase: SupabaseClient, code: string): Promise<Role> {
  const result = (await supabase.rpc("redeem_teacher_code", {
    p_code: code.trim(),
  })) as unknown as Result<Role>;
  return unwrap(result, "redeeming your teacher code");
}

/**
 * Gives up the teacher role. Demotion only — see
 * `supabase/migrations/0008_leaving_teacher_mode.sql`, where the new role is a
 * literal rather than an argument, so there is nothing to pass here and
 * nothing this call could be pointed at except the caller's own row.
 *
 * It exists for the same reason `redeemTeacherCode` does: the role guard
 * refuses a self-service role change, and the polite direction is refused
 * alongside the dangerous one. Returns the role the server settled on, which
 * the caller should then re-read from `profiles` rather than assume.
 */
export async function leaveTeacherMode(supabase: SupabaseClient): Promise<Role> {
  const result = (await supabase.rpc("leave_teacher_mode")) as unknown as Result<Role>;
  return unwrap(result, "turning off teacher mode");
}
