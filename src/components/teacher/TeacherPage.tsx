"use client";

// The frame and the gate for everything under /teacher.
//
// The gate is the interesting half. A teacher account is the only thing
// standing between one sixteen-year-old and the rest of the class's learning
// data, so the role is not something an account can hand itself — Postgres
// refuses it in a trigger (see the role trigger in 0001_init.sql), and this
// screen says so out loud rather than showing a student a button that will
// fail. Checking here is a courtesy to the student, not the security boundary:
// row-level security is, and it holds even if this component is wrong.
//
// The role is read from `profiles` rather than from the local school store,
// which is what this browser last wrote and therefore something a curious
// student could edit. Reading it costs a round trip, which is why the loading
// state is a neutral frame: flashing "this is for teachers" at a teacher whose
// profile simply hasn't arrived yet is the one failure mode worth engineering
// around.
//
// The frame itself is deliberately plain: one scroll container, a max width
// that keeps tables readable on a 13" school laptop, and a header that says
// where you are before it says anything else.

import Link from "next/link";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LockIcon } from "@/components/icons";
import { useTeacherStore } from "./store";
import { cardClass, quietButtonClass } from "./primitives";

export function TeacherPage({ children }: { children: React.ReactNode }) {
  const role = useTeacherStore((s) => s.role);
  const state = useTeacherStore((s) => s.roleState);
  const loadRole = useTeacherStore((s) => s.loadRole);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  const checking = state.loading || (!state.loaded && state.error === null);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
          {checking ? (
            // Neutral on purpose. A teacher must never see the student wall
            // flash past on the way to their own classes.
            <p className="text-sm text-[var(--text-faint)]">Checking your account…</p>
          ) : state.error ? (
            // Not signed in, or no database configured, or the read failed.
            // All three are stated rather than collapsed into "no access":
            // only one of them is about who this person is.
            <Unavailable message={state.error} />
          ) : role !== "teacher" ? (
            <NotATeacher />
          ) : (
            children
          )}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Why this screen has nothing on it, when the reason is the deployment rather
 * than the person. Guests land here too, and a guest is not a student we should
 * be lecturing about roles.
 */
function Unavailable({ message }: { message: string }) {
  return (
    <div className={`${cardClass} mx-auto max-w-xl p-6 sm:p-8`}>
      <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
        We can&apos;t check your account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-dim)]">{message}</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-dim)]">
        Teacher screens read rosters and class data from the shared database, so there is nothing to
        show until we can reach it as you.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/settings" className={quietButtonClass}>
          Sign in
        </Link>
        <Link href="/classes" className={quietButtonClass}>
          Go to my classes
        </Link>
      </div>
    </div>
  );
}

function NotATeacher() {
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
        Rosters, assignment rules and class learning signals live behind a teacher account. Your
        own classes, assignments and plan are all still where you left them.
      </p>

      <div
        className="mt-5 rounded-xl border border-[var(--line)] p-4 text-sm leading-relaxed text-[var(--text-dim)]"
        style={{ background: "var(--surface-1)" }}
      >
        <p className="font-medium text-[var(--text)]">Why you can&apos;t just switch this on</p>
        <p className="mt-1.5">
          A teacher account can read learning signals for everyone in its classes. If an account
          could make itself a teacher, any student could read their classmates&apos; data — so the
          database refuses to let an account change its own role at all. A teacher is promoted once,
          by whoever runs this school&apos;s Panda install.
        </p>
      </div>

      <p className="mt-4 text-sm text-[var(--text-dim)]">
        If you teach here and landed on this page, ask your administrator to promote your account,
        then come back.
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
