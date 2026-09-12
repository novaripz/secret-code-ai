import type { PostgrestError } from "@supabase/supabase-js";

// What happens when Postgres says no.
//
// The rule this file exists to enforce: a failed read and an empty table are
// never allowed to look the same. Supabase returns `{ data, error }` rather
// than throwing, so the lazy shape is `data ?? []` — and that turns "row-level
// security denied this query" into "you have no assignments", which is the one
// mistranslation this whole system cannot afford. To a student those two
// sentences mean opposite things, and only one of them is worth a refresh.
//
// So every query in src/lib/db goes through `unwrap`, and every one of them
// throws on error. Callers that want to keep going after a failure catch it on
// purpose, where a reader can see them decide to.

export class DatabaseError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;
  readonly hint: string | undefined;

  constructor(operation: string, cause: PostgrestError) {
    // The Postgres message first, because the interesting half of "couldn't
    // load assignments: new row violates row-level security policy" is the
    // second half, and it gets truncated in logs from the front.
    super(`${cause.message} (while ${operation})`);
    this.name = "DatabaseError";
    this.code = cause.code;
    this.details = cause.details ?? undefined;
    this.hint = cause.hint ?? undefined;
    this.cause = cause;
  }

  /**
   * True when Postgres refused on permission grounds rather than failing.
   * Worth distinguishing in the UI: "you aren't in this class" deserves a
   * different sentence from "something broke".
   */
  get isDenied(): boolean {
    // 42501 is insufficient_privilege, which is what RLS and the migration's
    // own `raise exception` calls both come back as. PGRST301 is PostgREST's
    // "JWT expired or missing", which reads as a denial to the caller too.
    return this.code === "42501" || this.code === "PGRST301";
  }
}

/** The only way a result is allowed into the rest of the data layer. */
export function unwrap<T>(
  result: { data: T | null; error: PostgrestError | null },
  operation: string,
): T {
  if (result.error) throw new DatabaseError(operation, result.error);
  if (result.data === null) {
    // PostgREST gives null data with no error only when a `.single()` found
    // nothing under a representation it can't express. Treat it as a fault
    // rather than inventing a value, for the same reason as above.
    throw new Error(`No data returned while ${operation}.`);
  }
  return result.data;
}

/**
 * For reads of a row that is genuinely allowed to be absent — "does this
 * student have a status row for this assignment yet". Uses `maybeSingle()`
 * results, where null is an answer and not a failure.
 */
export function unwrapMaybe<T>(
  result: { data: T | null; error: PostgrestError | null },
  operation: string,
): T | null {
  if (result.error) throw new DatabaseError(operation, result.error);
  return result.data;
}

/** For writes that return nothing — a delete. Same rule: silence means success. */
export function assertOk(
  result: { error: PostgrestError | null },
  operation: string,
): void {
  if (result.error) throw new DatabaseError(operation, result.error);
}
