"use client";

// The way into a teacher account that does not require already having one.
//
// Until now the only door was typing /teacher into the address bar: the
// sidebar link that leads there renders only for accounts Postgres already
// calls teachers, so the entrance to becoming one sat behind a lock that only
// opens for people who are through it. Real teachers got stuck. Settings is
// where someone goes when they think the app is missing something about them,
// so the code box lives here, next to the account it changes.
//
// Two things this section deliberately does not do. It does not reimplement the
// redeem step — `useRedeemCode` in the teacher panel is the single path to
// `redeem_teacher_code`, including the rule that the server's sentence is
// printed verbatim however the code failed, because a box that distinguished
// "expired" from "unknown" would let somebody find a live code by trying. And
// it does not reload after a success: the user is mid-something, and taking
// their open work away as a reward for redeeming a code is a poor trade. The
// re-read of the role goes through the teacher store, which the sidebar's
// Teacher link already subscribes to, so that link appears on its own the
// moment `profiles` says teacher — no navigation, no reload.
//
// The role always comes from the database. Never from what this component just
// did, and never from local state, which is the one thing a curious student can
// edit.

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { useTeacherStore } from "@/components/teacher/store";
import { codeInputProps, useRedeemCode } from "@/components/teacher/RedeemCodePanel";

export function TeacherCodeSection() {
  const { t } = useI18n();

  const account = useAuthStore((s) => s.account);
  const hydrated = useAuthStore((s) => s.hydrated);

  const role = useTeacherStore((s) => s.role);
  const roleLoaded = useTeacherStore((s) => s.roleState.loaded);
  const loadRole = useTeacherStore((s) => s.loadRole);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  const { code, change, busy, error, done, submit } = useRedeemCode({
    // The only thing a success does locally is ask the database what the role
    // is now. Everything else — this section swapping to the dashboard link,
    // the sidebar growing a Teacher entry — follows from that one store write.
    onRedeemed: () => void loadRole(),
    offlineMessage: t("teacherCode.offline"),
  });

  // Signed out, this is noise: the sign-in panel directly above is the next
  // step, and a code box would be a second thing to fail at. Before the role
  // has ever arrived we also stay quiet rather than flashing "are you a
  // teacher?" at someone who is one.
  if (!hydrated || !account || !roleLoaded) return null;

  if (role === "teacher") {
    // Already redeemed. A code box here would be a question with no answer, so
    // the space goes to the thing they actually came for.
    return (
      <div className="rounded-2xl border border-[var(--line)] p-4">
        <p className="cursor-default select-none font-medium text-[var(--text)]">
          {t("teacherCode.alreadyTitle")}
        </p>
        <p className="mt-1 cursor-default select-none text-sm leading-relaxed text-[var(--text-faint)]">
          {t("teacherCode.alreadyBody")}
        </p>
        <Link
          href="/teacher"
          className="tap items-center mt-3 inline-flex rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--focus)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          {t("teacherCode.openDashboard")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <p className="cursor-default select-none font-medium text-[var(--text)]">
        {t("teacherCode.title")}
      </p>
      <p className="mt-1 cursor-default select-none text-sm leading-relaxed text-[var(--text-faint)]">
        {t("teacherCode.body")}
      </p>

      {done ? (
        // Confirmation in place. The role re-read may still be in flight, and
        // that is fine: what happened is already true in the database, and
        // replacing this with a spinner would read as the success being undone.
        <p
          role="status"
          className="mt-4 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            borderColor: "var(--success)",
            background: "var(--success-soft)",
            color: "var(--success)",
          }}
        >
          <span className="font-medium">{t("teacherCode.successTitle")}</span>{" "}
          {t("teacherCode.successBody")}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label
            htmlFor="settings-teacher-code"
            className="cursor-default select-none text-sm font-medium text-[var(--text)]"
          >
            {t("teacherCode.label")}
          </label>
          <p className="cursor-default select-none text-sm leading-relaxed text-[var(--text-faint)]">
            {t("teacherCode.hint")}
          </p>

          <input
            id="settings-teacher-code"
            name="settings-teacher-code"
            value={code}
            onChange={(e) => change(e.target.value)}
            // Shared with the /teacher panel on purpose: a phone that
            // autocapitalises a code turns a valid one invalid.
            {...codeInputProps}
            placeholder={t("teacherCode.placeholder")}
            aria-describedby={error ? "settings-teacher-code-error" : undefined}
            aria-invalid={error !== null}
            disabled={busy}
            className="w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-sm tracking-wide text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-60"
          />

          <div>
            <button
              type="submit"
              disabled={busy || code.trim().length === 0}
              className="tap inline-flex items-center rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50"
            >
              {busy ? t("teacherCode.checking") : t("teacherCode.submit")}
            </button>
          </div>

          {error && (
            // Whatever the server said, word for word. Guessing at which of the
            // four ways a code can be dead applies here is exactly the leak the
            // RPC's single sentence exists to prevent.
            <p
              id="settings-teacher-code-error"
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
        className="mt-4 rounded-xl border border-[var(--line)] p-3.5 text-sm leading-relaxed text-[var(--text-faint)]"
        style={{ background: "var(--surface-1)" }}
      >
        <p className="cursor-default select-none font-medium text-[var(--text)]">
          {t("teacherCode.whereTitle")}
        </p>
        <p className="mt-1.5 cursor-default select-none">{t("teacherCode.whereBody")}</p>
      </div>
    </div>
  );
}
