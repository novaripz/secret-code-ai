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
// What changed with teacher codes: this page is now also the way in, not only
// the way out. Signed out, it offers the ordinary sign-in — the same Supabase
// auth students use, because only the role differs. Signed in as a student, it
// offers a code box rather than a dead end, and the code is checked by a
// SECURITY DEFINER function against a table no browser can read. Neither path
// loosens the gate: after a redeem the role is re-read from the database, never
// assumed from what this component just did.
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
import { useAuthStore } from "@/store/useAuthStore";
import { useTeacherStore } from "./store";
import { RedeemCodePanel } from "./RedeemCodePanel";
import { TeacherSignIn } from "./TeacherSignIn";
import { cardClass, quietButtonClass } from "./primitives";

export function TeacherPage({ children }: { children: React.ReactNode }) {
  const role = useTeacherStore((s) => s.role);
  const state = useTeacherStore((s) => s.roleState);
  const loadRole = useTeacherStore((s) => s.loadRole);

  const account = useAuthStore((s) => s.account);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  // Re-reading the role after a redeem must not blank the screen: the panel
  // below is already saying "that code worked", and replacing it with
  // "checking…" reads as the success being taken back. So a refresh of
  // something we already have is quiet, and only a first read is loud.
  const checking = !hydrated || (!state.loaded && state.error === null);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6">
          {checking ? (
            // Neutral on purpose. A teacher must never see the student wall
            // flash past on the way to their own classes.
            <p className="text-sm text-[var(--text-faint)]">Checking your account…</p>
          ) : !account ? (
            // Signed out — including a guest who walked in from the student
            // side. Offer the door rather than an explanation of the lock; the
            // store's own error for this case says "sign in" and nothing more
            // actionable than what this screen already is.
            <TeacherSignIn onSignedIn={() => void loadRole()} />
          ) : state.error ? (
            // Not signed in, or no database configured, or the read failed.
            // All three are stated rather than collapsed into "no access":
            // only one of them is about who this person is.
            <Unavailable message={state.error} />
          ) : role !== "teacher" ? (
            // Signed in, but an ordinary account. The redeem box re-reads the
            // role from the database on success; it does not flip anything
            // locally, because local state is exactly what a student can edit.
            <RedeemCodePanel onRedeemed={() => void loadRole()} />
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
