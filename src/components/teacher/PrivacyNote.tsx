"use client";

// The boundary, written on the screen it applies to.
//
// A teacher can see that twelve students asked for hints on factoring. They
// cannot read what any one of them typed. That is a deliberate line: Panda is
// where a student is allowed to not understand something, out loud, in their
// own language, without it going in their file — and a tool that quietly hands
// the transcript to an adult is not that. Saying so here means a teacher knows
// what they have, and a student can be told the truth about what is shared.

import { LockIcon } from "@/components/icons";

export function PrivacyNote({ scope }: { scope: "class" | "student" }) {
  return (
    <aside
      className="flex gap-3 rounded-2xl border border-[var(--line)] p-4"
      style={{ background: "var(--surface-1)" }}
    >
      <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-faint)]" />
      <div className="min-w-0 text-xs leading-relaxed text-[var(--text-dim)]">
        <p className="font-medium text-[var(--text)]">What you can and can&apos;t see</p>
        <p className="mt-1">
          You see counted signals — hint requests, repeated questions, translations, sessions that
          stalled — grouped by topic.{" "}
          {scope === "class"
            ? "You never see chat transcripts, and signals below three students are not broken out by name."
            : "You never see this student's chat transcripts, in any language, even in summary."}{" "}
          Students are told the same thing, in the same words.
        </p>
      </div>
    </aside>
  );
}
