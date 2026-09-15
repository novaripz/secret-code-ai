"use client";

// The way out of teacher mode.
//
// A teacher who wants to stop being one has, until now, had no control at all:
// the role guard refuses a self-service role change, so the only exit was to
// ask whoever runs the Supabase project to run a line of SQL. That is a fine
// answer for a district IT lead and an impossible one for a teacher on a
// Sunday. So the exit exists, and it goes through `leave_teacher_mode` — a
// function that can only ever move an account downwards. See
// supabase/migrations/0008_leaving_teacher_mode.sql.
//
// Two decisions about the shape of this, both about honesty:
//
// The friction is real and deliberate — the phrase has to be typed exactly, so
// nobody arrives here by tapping through. But the confirmation does not
// exaggerate. Nothing is deleted: the classes, rosters, assignments and grades
// stay owned by this account, and a new code brings the view back. A warning
// that overstates the damage makes a teacher abandon a safe action and go on
// using an account they wanted to hand back; one that understates it is worse.
// So the panel says all three things — what goes, what stays, how to return.
//
// The typed phrase is `Delete123`, case-sensitive, and the input is hardened
// the same way the code field is: a phone that autocapitalises turns the right
// answer into the wrong one, and the user has no way to see why.

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useTeacherStore } from "@/components/teacher/store";
import { getSupabase } from "@/lib/supabase/browser";
import { DatabaseError, leaveTeacherMode } from "@/lib/db";

/** Case-sensitive on purpose, and compared with `===` rather than any tidying. */
const CONFIRM_PHRASE = "Delete123";

function serverMessage(err: unknown, fallback: string): string {
  if (err instanceof DatabaseError) {
    const cause = err.cause as { message?: string } | undefined;
    if (typeof cause?.message === "string" && cause.message) return cause.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function DeactivateTeacherSection() {
  const { t } = useI18n();

  const role = useTeacherStore((s) => s.role);
  const roleLoaded = useTeacherStore((s) => s.roleState.loaded);
  const loadRole = useTeacherStore((s) => s.loadRole);

  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  // Opening puts the caret in the one field that matters. Without this the
  // panel appears below the fold on a phone and reads as a wall of text with no
  // obvious next step.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Only a teacher sees any of this. A student reading "turn off teacher mode"
  // would be told about a state they are not in, and the answer to "can I be a
  // teacher?" lives in the section above this one.
  if (!roleLoaded || role !== "teacher") return null;

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--line)] p-4">
        <p role="status" className="cursor-default select-none font-medium text-[var(--text)]">
          {t("teacherOff.doneTitle")}
        </p>
        <p className="mt-1 cursor-default select-none text-sm leading-relaxed text-[var(--text-faint)]">
          {t("teacherOff.doneBody")}
        </p>
      </div>
    );
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (busy || phrase !== CONFIRM_PHRASE) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        setError(t("teacherOff.offline"));
        return;
      }
      await leaveTeacherMode(supabase);
      setPhrase("");
      setDone(true);
      // The database is the only authority on the role, so the sidebar's
      // Teacher link disappears because `profiles` said so, not because this
      // component decided it should.
      void loadRole();
    } catch (err) {
      setError(serverMessage(err, t("teacherOff.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="cursor-default select-none font-medium text-[var(--text)]">
        {t("teacherOff.title")}
      </p>
      <p className="mt-1 cursor-default select-none text-sm leading-relaxed text-[var(--text-faint)]">
        {t("teacherOff.body")}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {t("teacherOff.start")}
        </button>
      ) : (
        // Not a modal — it is inline, below the thing it is about — but it
        // carries the same semantics, so a screen reader announces the warning
        // and its heading together instead of a stray text field.
        <form
          onSubmit={(e) => void confirm(e)}
          role="alertdialog"
          aria-labelledby="teacher-off-heading"
          aria-describedby="teacher-off-detail"
          className="mt-4 rounded-xl border p-3.5"
          style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}
        >
          <p
            id="teacher-off-heading"
            className="cursor-default select-none text-sm font-medium"
            style={{ color: "var(--danger)" }}
          >
            {t("teacherOff.confirmTitle")}
          </p>

          <div id="teacher-off-detail" className="mt-2 flex flex-col gap-1.5">
            <p className="cursor-default select-none text-sm leading-relaxed text-[var(--text-dim)]">
              <span className="font-medium text-[var(--text)]">{t("teacherOff.keptTitle")}</span>{" "}
              {t("teacherOff.kept")}
            </p>
            <p className="cursor-default select-none text-sm leading-relaxed text-[var(--text-dim)]">
              <span className="font-medium text-[var(--text)]">{t("teacherOff.lostTitle")}</span>{" "}
              {t("teacherOff.lost")}
            </p>
            <p className="cursor-default select-none text-sm leading-relaxed text-[var(--text-dim)]">
              <span className="font-medium text-[var(--text)]">{t("teacherOff.backTitle")}</span>{" "}
              {t("teacherOff.back")}
            </p>
          </div>

          <label
            htmlFor="teacher-off-phrase"
            className="mt-3 block cursor-default select-none text-sm font-medium text-[var(--text)]"
          >
            {t("teacherOff.confirmLabel")}
          </label>
          <p className="cursor-default select-none text-xs leading-relaxed text-[var(--text-faint)]">
            {t("teacherOff.confirmHint")}
          </p>
          <input
            id="teacher-off-phrase"
            ref={inputRef}
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value);
              setError(null);
            }}
            // The same hardening as the teacher code field, for the same
            // reason: an autocapitalised D is invisible to the person typing.
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={CONFIRM_PHRASE}
            aria-describedby={error ? "teacher-off-error" : undefined}
            disabled={busy}
            className="mt-1.5 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-60"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              // Disabled until the phrase matches exactly. The button is the
              // last check, not the only one: the function refuses anything but
              // a demotion whatever this form sends.
              disabled={busy || phrase !== CONFIRM_PHRASE}
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50"
              style={{ background: "var(--danger)" }}
            >
              {busy ? t("teacherOff.working") : t("teacherOff.submit")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPhrase("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--focus)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50"
            >
              {t("teacherOff.cancel")}
            </button>
          </div>

          {error && (
            <p
              id="teacher-off-error"
              role="alert"
              className="mt-3 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
              style={{
                borderColor: "var(--danger)",
                background: "var(--surface-1)",
                color: "var(--danger)",
              }}
            >
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
