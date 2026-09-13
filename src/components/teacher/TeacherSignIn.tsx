"use client";

// The signed-out front door to /teacher.
//
// The decision here was not to build anything. A teacher signs in through the
// same Supabase auth as every student — same form, same email and password,
// same Google fallback — because a second auth system would mean a second set
// of sessions to expire, a second password to reset, and a second chance to get
// it wrong. Nothing about this account is special until a code makes it so.
//
// So the only thing this file adds around <SignInPanel /> is context: what is
// behind the door, that a code is the next step after signing in, and where a
// code comes from. A teacher who arrives here with nothing should leave knowing
// exactly what to ask for and whom to ask — that is the difference between a
// screen that works tomorrow morning and a support email.

import Link from "next/link";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { cardClass, quietButtonClass } from "./primitives";

export function TeacherSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  return (
    <div className={`${cardClass} mx-auto max-w-xl p-6 sm:p-8`}>
      <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
        Sign in to your teacher account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-dim)]">
        Rosters, assignments and class learning signals live here. Use the same sign-in as everyone
        else at your school — or create an account, then enter your teacher code on the next screen.
      </p>

      <div className="mt-6">
        {/* Reused wholesale. The panel already knows how to say "Supabase isn't
            configured", which is a real state on a fresh install and one a
            teacher should see stated rather than as a form that never works. */}
        <SignInPanel onDone={onSignedIn} />
      </div>

      <div
        className="mt-6 rounded-xl border border-[var(--line)] p-4 text-sm leading-relaxed text-[var(--text-dim)]"
        style={{ background: "var(--surface-1)" }}
      >
        <p className="font-medium text-[var(--text)]">You&apos;ll need a teacher code</p>
        <p className="mt-1.5">
          Signing in makes an ordinary account. A code — issued by whoever runs Panda for your
          school, usually your IT lead or the department head who set it up — is what turns it into
          a teacher account. Ask them for one before your first class; it takes them a minute.
        </p>
        <p className="mt-1.5">No account can issue itself a code, and no code can be guessed here.</p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-faint)]">
        This screen is a courtesy, not the lock. Every teacher query is checked again by row-level
        security in the database, which is what actually keeps one class&apos;s data out of another
        person&apos;s hands.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/classes" className={quietButtonClass}>
          I&apos;m a student
        </Link>
      </div>
    </div>
  );
}
