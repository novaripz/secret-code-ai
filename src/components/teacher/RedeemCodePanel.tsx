"use client";

// The one screen that turns a signed-in person into a teacher.
//
// The design decision worth stating: this box knows nothing. It cannot check a
// code, cannot tell you whether one exists, and cannot say which of the four
// ways a code can be dead killed yours. `teacher_codes` is unreadable from a
// browser on purpose, so the only thing this component can do is hand the
// string to `redeem_teacher_code` and print whatever Postgres says back —
// verbatim, always the same sentence, however it failed. That sameness is the
// feature. A box that said "expired" for one code and "unknown" for another
// would let anybody with an afternoon discover a live code by trying.
//
// So the helpfulness budget goes somewhere it costs nothing: saying clearly
// where a code comes from, and who to ask for one. A teacher without a code
// leaves this screen knowing what to send an email about, which is the only
// thing we can honestly give them.
//
// The code is never logged, echoed into a URL, or kept after it is spent.
//
// Since teachers were getting stuck — the sidebar link to /teacher only renders
// for accounts that are already teachers, so the door to becoming one sat
// behind a door only teachers could open — the redeem step also appears in
// Settings. That second home is why the moving parts below (`useRedeemCode`,
// `codeInputProps`) are exported rather than kept local: there must be exactly
// one path that talks to `redeem_teacher_code`, one place that decides what to
// print when it fails, and one definition of the input hardening. A second copy
// would be a second thing to get wrong, and the thing it would get wrong is a
// teacher's account.

import { useState } from "react";
import Link from "next/link";
import { LockIcon } from "@/components/icons";
import { getSupabase } from "@/lib/supabase/browser";
import { DatabaseError, redeemTeacherCode } from "@/lib/db";
import { buttonClass, cardClass, fieldClass, quietButtonClass } from "./primitives";

/**
 * The server's own sentence, without the operation we appended for logs. The
 * whole point of the RPC is that its message is the same every time; dressing
 * it up here, or appending a guess, would undo that.
 */
function serverMessage(err: unknown): string {
  if (err instanceof DatabaseError) {
    const cause = err.cause as { message?: string } | undefined;
    if (typeof cause?.message === "string" && cause.message) return cause.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "We couldn't reach the database. Nothing changed — it's worth trying again.";
}

/**
 * No autocapitalise, no autocorrect, no password manager: a code is typed once
 * from a slip of paper, and a browser "helpfully" capitalising it turns a valid
 * code into a wrong one. Shared so the Settings copy of this field cannot
 * quietly drift into being the lenient one.
 */
export const codeInputProps = {
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;

/**
 * The whole redeem step, minus any opinion about how it looks. Both homes for
 * this flow — the /teacher wall and the Settings section — drive the same
 * state machine here, so there is one round trip to `redeem_teacher_code` and
 * one rule about what comes back: print the server's sentence, never a guess.
 *
 * `onRedeemed` is where the role gets re-read from `profiles`. It fires after
 * the success flag is set, so the caller can show "that worked" immediately
 * instead of holding the good news hostage to a second round trip.
 */
export function useRedeemCode({
  onRedeemed,
  offlineMessage,
}: {
  onRedeemed: () => void;
  offlineMessage?: string;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        setError(
          offlineMessage ??
            "This copy of Panda has no database connected, so a code can't be checked here.",
        );
        return;
      }
      await redeemTeacherCode(supabase, code);
      // Clear it the moment it is spent: a redeemed code is still a secret, and
      // leaving it sitting in an input on a shared staffroom laptop is careless.
      setCode("");
      setDone(true);
      onRedeemed();
    } catch (err) {
      setError(serverMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Typing again clears the last complaint; a stale error reads as a new one. */
  function change(next: string) {
    setCode(next);
    setError((prev) => (prev === null ? prev : null));
  }

  return { code, change, busy, error, done, submit };
}

export function RedeemCodePanel({ onRedeemed }: { onRedeemed: () => void }) {
  const { code, change, busy, error, done, submit } = useRedeemCode({ onRedeemed });

  return (
    <div className={`${cardClass} mx-auto max-w-xl p-6 sm:p-8`}>
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: "var(--surface-2)" }}
      >
        <LockIcon className="h-5 w-5" />
      </span>

      <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--text)]">
        This part of Panda is for teachers
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-dim)]">
        Rosters, assignment rules and class learning signals live behind a teacher account. Your own
        classes, assignments and plan are all still where you left them.
      </p>

      {done ? (
        // Between the successful redeem and the re-read of the role finishing,
        // this is what a teacher sees. It says what happened, not "loading".
        <div
          role="status"
          className="mt-5 rounded-xl border px-4 py-3 text-sm leading-relaxed"
          style={{
            borderColor: "var(--success)",
            background: "var(--success-soft)",
            color: "var(--success)",
          }}
        >
          <p className="font-medium">That code worked</p>
          <p className="mt-1">
            Your account is a teacher account now. Fetching your classes — this takes a second.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-2.5">
          <label htmlFor="teacher-code" className="text-sm font-medium text-[var(--text)]">
            I have a teacher code
          </label>
          <p className="text-sm leading-relaxed text-[var(--text-dim)]">
            Type it exactly as it was given to you, including any dashes and capitals.
          </p>

          <input
            id="teacher-code"
            name="teacher-code"
            value={code}
            onChange={(e) => change(e.target.value)}
            {...codeInputProps}
            placeholder="Your teacher code"
            aria-describedby={error ? "teacher-code-error" : undefined}
            aria-invalid={error !== null}
            disabled={busy}
            className={`${fieldClass} font-mono tracking-wide disabled:opacity-60`}
          />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || code.trim().length === 0} className={buttonClass}>
              {busy ? "Checking…" : "Use this code"}
            </button>
          </div>

          {error && (
            <p
              id="teacher-code-error"
              role="alert"
              className="rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
              style={{
                borderColor: "var(--danger)",
                background: "var(--danger-soft)",
                color: "var(--danger)",
              }}
            >
              {error}
            </p>
          )}
        </form>
      )}

      <div
        className="mt-5 rounded-xl border border-[var(--line)] p-4 text-sm leading-relaxed text-[var(--text-dim)]"
        style={{ background: "var(--surface-1)" }}
      >
        <p className="font-medium text-[var(--text)]">Where a code comes from</p>
        <p className="mt-1.5">
          Codes are issued by whoever runs Panda for your school — the person who set up this
          install, usually your IT lead or the department head who asked for it. Ask them for one;
          they can create it in a minute. Nobody can issue themselves a code, including us.
        </p>
        <p className="mt-1.5">
          A teacher account can read learning signals for everyone in its classes, so the database
          refuses to let an account change its own role at all. A code is the only way through, and
          it is deliberately something a person had to decide to give you.
        </p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-faint)]">
        This screen is a courtesy, not the lock. Every teacher query is checked again by row-level
        security in the database, which is what actually keeps one class&apos;s data out of another
        person&apos;s hands — it holds even if this page is wrong about you.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/classes" className={quietButtonClass}>
          Go to my classes
        </Link>
        <Link href="/plan" className={quietButtonClass}>
          Plan my evening
        </Link>
      </div>
    </div>
  );
}
