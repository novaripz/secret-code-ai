"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { daysUntil, urgencyScore, type Assignment } from "@/lib/school/types";

// What to care about right now, on the home screen.
//
// Three items at most. The point of this strip is to answer one question in
// under a second, and a list of everything answers it worse than a list of
// three. Renders nothing at all when there is no work, rather than occupying
// the screen to say so.

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

export function Priorities() {
  const { hydrated, hydrate, assignments, classes } = useSchoolStore();
  const { t } = useI18n();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const top = assignments
    .filter((a) => a.status !== "done")
    .sort((x, y) => urgencyScore(x) - urgencyScore(y))
    .slice(0, 3);

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
        {top.map((a) => (
          <Link
            key={a.id}
            href={`/classes/${a.classId}/${a.id}`}
            className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3.5 py-2.5 transition-colors hover:border-[var(--line-strong)]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot(a) }} />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{a.title}</span>
            <span className="shrink-0 text-xs text-[var(--text-faint)]">{names.get(a.classId)}</span>
            <span className="shrink-0 text-xs text-[var(--text-dim)]">{when(a, t)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
