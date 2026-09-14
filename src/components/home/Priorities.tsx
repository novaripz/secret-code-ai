"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { rankAssignments } from "@/lib/school/planner";
import { daysUntil, type Assignment } from "@/lib/school/types";

// What to care about right now, on the home screen.
//
// Three items at most. The point of this strip is to answer one question in
// under a second, and a list of everything answers it worse than a list of
// three. Renders nothing at all when there is no work, rather than occupying
// the screen to say so.
//
// The order is the planner's own `rankAssignments`, not a second sort written
// here. If this strip and the plan page disagreed about what comes first, a
// student would be right to trust neither -- so there is one ranking, and both
// screens read it.
//
// A pinned item gets a chip with a shape and a word in it. The coloured dot
// stays what it always was, a due-date signal, and carries none of the new
// meaning on its own: a student who cannot tell the dots apart still reads the
// chip.

function dot(a: Assignment): string {
  if (a.dueAt === null) return "var(--text-faint)";
  const days = daysUntil(a.dueAt);
  if (days < 0) return "var(--danger)";
  if (days <= 1) return "var(--warn)";
  return "var(--success)";
}

function when(a: Assignment, t: (k: "assignments.dueToday" | "assignments.dueTomorrow" | "assignments.overdue") => string): string {
  if (a.dueAt === null) return "";
  const days = daysUntil(a.dueAt);
  if (days < 0) return t("assignments.overdue");
  if (days === 0) return t("assignments.dueToday");
  if (days === 1) return t("assignments.dueTomorrow");
  return new Date(a.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Decorative; the chip's word next to it is what is read aloud. */
function PinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <path d="M6 2h4M8 2v5.2L5 10.2h6L8 7.2M8 10.2V14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeightGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <path d="M8 13V3M8 3 4.5 6.5M8 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Priorities() {
  const { hydrated, hydrate, assignments, classes } = useSchoolStore();
  const { t } = useI18n();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const top = rankAssignments(assignments).slice(0, 3);

  if (!hydrated || top.length === 0) return null;

  const names = new Map(classes.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl animate-rise">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">
          {t("plan.title")}
        </p>
        <Link href="/plan" className="text-xs text-[var(--text-faint)] underline-offset-4 hover:text-[var(--text-dim)] hover:underline">
          {t("plan.make")}
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        {top.map(({ assignment: a, pinned, heavy }) => (
          <Link
            key={a.id}
            href={`/classes/${a.classId}/${a.id}`}
            className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3.5 py-2.5 transition-colors hover:border-[var(--line-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot(a) }} />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{a.title}</span>
            {pinned ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--accent)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                <PinGlyph className="h-3 w-3" />
                Teacher pick
              </span>
            ) : heavy ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--line-strong)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-dim)]">
                <WeightGlyph className="h-3 w-3" />
                Big points
              </span>
            ) : null}
            <span className="shrink-0 text-xs text-[var(--text-faint)]">{names.get(a.classId)}</span>
            <span className="shrink-0 text-xs text-[var(--text-dim)]">{when(a, t)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
