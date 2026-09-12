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
// The frame itself is deliberately plain: one scroll container, a max width
// that keeps tables readable on a 13" school laptop, and a header that says
// where you are before it says anything else.

import Link from "next/link";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { LockIcon } from "@/components/icons";
import { cardClass, quietButtonClass } from "./primitives";

export function TeacherPage({ children }: { children: React.ReactNode }) {
  const role = useSchoolStore((s) => s.role);
  const hydrated = useSchoolStore((s) => s.hydrated);
  const hydrate = useSchoolStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
          {!hydrated ? (
            // A blank frame beats a flash of the "you're a student" wall for a
            // teacher whose role simply hasn't loaded off disk yet.
            <p className="text-sm text-[var(--text-faint)]">Loading…</p>
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
