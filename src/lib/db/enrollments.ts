import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { assertOk, unwrap } from "./errors";
import {
  ENROLLMENT_COLUMNS,
  INVITE_COLUMNS,
  toInvite,
  type EnrollmentRow,
  type Invite,
  type InviteRow,
} from "./rows";

// The roster: who is in a class, and who has been asked to be.
//
// Adding a student is one call — `addStudentByEmail` — and it goes through the
// `invite_student` function in the migration rather than writing rows here.
// That is not indirection for its own sake. A teacher is not allowed to read
// `profiles` by email (a teacher account would otherwise be a search engine for
// every account in the school), so the "does this person already exist" lookup
// has to happen somewhere the caller cannot see, which means SECURITY DEFINER,
// which means SQL. TypeScript cannot do this part, and a version that tried
// would either need a service key or would have to give teachers a lookup they
// must not have.
//
// The one bit the teacher gets back is whether the invite came back claimed:
// claimed means the student is enrolled now, unclaimed means they join the
// moment they sign in with that address. Both are fine; the roster says which.

/** What `rpc` actually resolves to, minus the set-returning assumption. */
type Result<T> = { data: T | null; error: PostgrestError | null };

/**
 * Invites, or straight-up enrolls, whoever owns `email`. Returns the invite row
 * — `claimedAt` non-null means an account already existed and is now enrolled.
 */
export async function addStudentByEmail(
  supabase: SupabaseClient,
  classId: string,
  email: string,
): Promise<Invite> {
  // `invite_student` returns `public.invites`, so PostgREST sends back one
  // object rather than a collection. The generic `rpc` signature assumes a set,
  // hence the cast — there are no generated schema types to tell it otherwise.
  const result = (await supabase.rpc("invite_student", {
    p_class_id: classId,
    p_email: email,
  })) as unknown as Result<InviteRow>;
  return toInvite(unwrap(result, "adding a student"));
}

/**
 * Claims any invites waiting for the signed-in account's own verified email.
 * Called after sign-in. Covers the order the sign-up trigger cannot: a student
 * who already had an account when the teacher added them. Returns how many
 * invites were claimed, which is only worth showing if it is more than zero.
 */
export async function claimPendingInvites(supabase: SupabaseClient): Promise<number> {
  const result = (await supabase.rpc("claim_invites")) as unknown as Result<number>;
  return unwrap(result, "joining your classes");
}

export async function listEnrollments(
  supabase: SupabaseClient,
  classId: string,
): Promise<EnrollmentRow[]> {
  return unwrap(
    await supabase
      .from("enrollments")
      .select(ENROLLMENT_COLUMNS)
      .eq("class_id", classId)
      .order("created_at", { ascending: true })
      .returns<EnrollmentRow[]>(),
    "loading the roster",
  );
}

/**
 * Every invite for a class, claimed or not. A claimed invite is kept rather
 * than deleted so the roster can honestly say "invited, hasn't signed in yet"
 * about the ones that aren't.
 */
export async function listInvites(supabase: SupabaseClient, classId: string): Promise<Invite[]> {
  const rows = unwrap(
    await supabase
      .from("invites")
      .select(INVITE_COLUMNS)
      .eq("class_id", classId)
      .order("created_at", { ascending: true })
      .returns<InviteRow[]>(),
    "loading invites",
  );
  return rows.map(toInvite);
}

/**
 * Removes a student from a class. Their assignment_status rows survive, because
 * they belong to the student and not to the class — and because being taken off
 * a roster by accident should not erase a term's work.
 */
export async function removeStudent(
  supabase: SupabaseClient,
  classId: string,
  studentId: string,
): Promise<void> {
  assertOk(
    await supabase.from("enrollments").delete().eq("class_id", classId).eq("student_id", studentId),
    "removing a student",
  );
}

/**
 * Withdraws an invite that hasn't been taken up. Deleting a claimed one would
 * not un-enroll anybody — that is `removeStudent` — so the call sites are
 * separate.
 */
export async function revokeInvite(supabase: SupabaseClient, inviteId: string): Promise<void> {
  assertOk(await supabase.from("invites").delete().eq("id", inviteId), "withdrawing an invite");
}
