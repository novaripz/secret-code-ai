import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageAction } from "@/components/chat/MessageActions";
import { KIND_WEIGHT, WINDOW_MS, type SignalKind, type StruggleSignal } from "@/lib/insights";
import { assertOk, unwrap } from "./errors";

// Struggle signals, in the one place they are allowed to cross a browser
// boundary.
//
// The design decision: this file moves rows, it does not decide anything. All
// interpretation stays in src/lib/insights, so a teacher's screen and a
// student's own adaptation are computed by the same code from the same
// evidence — the alternative, aggregating in SQL, would give two answers that
// drift apart and neither of them testable.
//
// Three things this file deliberately cannot do:
//
//  1. Write message text. `struggle_signals` has no column for it and nothing
//     here invents one. A signal records that difficulty happened and where.
//  2. Update. The migration grants select/insert/delete only, because evidence
//     that can be quietly rewritten is not evidence. Re-sync therefore has to
//     be avoided by the caller rather than absorbed by an upsert; see the
//     `synced` bookkeeping in src/store/useInsightsStore.ts.
//  3. Reach a row the caller is not allowed to see. Both reads below are
//     ordinary filters on top of row-level security, not permission checks: a
//     teacher's `select` already cannot return another teacher's class, and a
//     signal with `class_id is null` is readable by no teacher at all.
//
// Errors throw, like everything else in src/lib/db. A failed read that came
// back as an empty array would tell a teacher "nobody struggled this week",
// which is the opposite of what happened.

export interface SignalRow {
  id: string;
  student_id: string;
  class_id: string | null;
  assignment_id: string | null;
  topic_key: string;
  topic_label: string;
  kind: string;
  action: string | null;
  weight: number;
  occurred_at: string;
}

export const SIGNAL_COLUMNS =
  "id, student_id, class_id, assignment_id, topic_key, topic_label, kind, action, weight, occurred_at";

/** A stored row paired with the student it belongs to, ready for the engine. */
export interface StoredSignal {
  studentId: string;
  signal: StruggleSignal;
}

const KINDS: SignalKind[] = ["action", "phrase", "retry", "dwell"];

/**
 * Rows come back as text because `kind` is text in the schema — deliberately,
 * so a new kind of evidence does not need a migration. The price is that this
 * boundary has to check, and drop what the engine would not understand rather
 * than pass a bad string into a `Record<SignalKind, …>` lookup.
 */
export function toStruggleSignal(row: SignalRow, className?: string): StruggleSignal | null {
  if (!KINDS.includes(row.kind as SignalKind)) return null;
  return {
    id: row.id,
    topic: {
      id: row.topic_key,
      label: row.topic_label,
      classId: row.class_id ?? undefined,
      className,
    },
    kind: row.kind as SignalKind,
    action: (row.action as MessageAction | null) ?? undefined,
    at: Date.parse(row.occurred_at),
    // `sessionId` is intentionally absent: the table has no column for it, so
    // the aggregator's "came back in a later session" test falls back to the
    // day spread it also uses. Fewer distinctions, no invented ones.
  };
}

/** What an insert needs. Spelled out rather than reusing the row type so a
 *  caller cannot accidentally supply an id or a server-side default. */
export interface NewSignal {
  classId: string;
  assignmentId: string | null;
  topicKey: string;
  topicLabel: string;
  kind: SignalKind;
  action?: string;
  occurredAt: number;
}

/**
 * `studentId` is passed rather than defaulted for the same reason as
 * `createClass`: the insert policy compares it to auth.uid(), and a mismatch
 * should read as the caller's mistake here rather than as a bare 42501.
 *
 * Inserted in one request. If it fails, none of it landed, which is what makes
 * the caller's "mark these as synced only on success" bookkeeping correct.
 */
export async function insertSignals(
  supabase: SupabaseClient,
  studentId: string,
  signals: NewSignal[],
): Promise<void> {
  if (signals.length === 0) return;
  assertOk(
    await supabase.from("struggle_signals").insert(
      signals.map((s) => ({
        student_id: studentId,
        class_id: s.classId,
        assignment_id: s.assignmentId,
        topic_key: s.topicKey,
        topic_label: s.topicLabel,
        kind: s.kind,
        action: s.action ?? null,
        weight: KIND_WEIGHT[s.kind],
        occurred_at: new Date(s.occurredAt).toISOString(),
      })),
    ),
    "saving learning signals",
  );
}

/** The engine's window, as an ISO cutoff. One place, so a read and a prune
 *  cannot disagree about how far back "recent" goes. */
function since(now: number): string {
  return new Date(now - WINDOW_MS).toISOString();
}

/**
 * Every signal in one class, over the engine's window.
 *
 * Returned per student rather than pre-grouped: `summarizeStruggles` is
 * per-student by definition (a finding is about a person), and grouping is one
 * line at the call site.
 */
export async function listClassSignals(
  supabase: SupabaseClient,
  classId: string,
  options: { className?: string; now?: number } = {},
): Promise<StoredSignal[]> {
  const now = options.now ?? Date.now();
  const rows = unwrap(
    await supabase
      .from("struggle_signals")
      .select(SIGNAL_COLUMNS)
      .eq("class_id", classId)
      .gte("occurred_at", since(now))
      .order("occurred_at", { ascending: true })
      .returns<SignalRow[]>(),
    "loading learning signals for this class",
  );
  return rows.flatMap((row) => {
    const signal = toStruggleSignal(row, options.className);
    return signal ? [{ studentId: row.student_id, signal }] : [];
  });
}

/**
 * One student's signals inside one class.
 *
 * The class filter is not optional, and that is the point. A teacher's select
 * policy only ever matches rows attached to a class they own, so asking for a
 * student across all classes would silently return a subset shaped by
 * permissions — a number that looks like a fact about the student but is
 * actually a fact about the asker. Naming the class makes the scope of the
 * answer explicit. A student reading their own signals gets the same rows.
 */
export async function listStudentSignals(
  supabase: SupabaseClient,
  classId: string,
  studentId: string,
  options: { className?: string; now?: number } = {},
): Promise<StruggleSignal[]> {
  const now = options.now ?? Date.now();
  const rows = unwrap(
    await supabase
      .from("struggle_signals")
      .select(SIGNAL_COLUMNS)
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .gte("occurred_at", since(now))
      .order("occurred_at", { ascending: true })
      .returns<SignalRow[]>(),
    "loading this student's learning signals",
  );
  return rows.flatMap((row) => {
    const signal = toStruggleSignal(row, options.className);
    return signal ? [signal] : [];
  });
}
