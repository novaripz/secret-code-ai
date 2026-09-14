"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { daysUntil, isOverdue, urgencyScore } from "@/lib/school/types";
import { MyGrades } from "@/components/home/MyGrades";

// Classes, and what is due in each.
//
// The list is ordered by what is most urgent inside each class rather than
// alphabetically, because the question this page answers is "what do I need to
// deal with", not "what am I enrolled in".
//
// A student cannot make a class here. Enrolment is the teacher's, one-sided:
// they add an email and the student appears. Letting a student invent a class
// would produce a second, private list that no teacher can see and no grade can
// belong to, sitting next to the real one under the same heading. The database
// refuses it too -- the insert policy only passes when the row's teacher is the
// caller -- so this is the interface agreeing with the rule rather than
// enforcing it.

export default function ClassesPage() {
  const { classes, assignments, hydrated, hydrate } = useSchoolStore();
  const { t } = useI18n();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              {t("classes.title")}
            </h1>
          </div>

          {/* Grades come from the database and the classes below come from this
              browser's own store, so this sits above the list rather than on
              each card: they are two different sources and pretending otherwise
              would put a teacher's number on a card a student made. It renders
              nothing at all when there is no database or nobody is signed in. */}
          <div className="mb-6">
            <MyGrades />
          </div>

          {!hydrated ? (
            <p className="text-sm text-[var(--text-faint)]">{t("empty.loading")}</p>
          ) : classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
              <p className="font-medium text-[var(--text)]">{t("classes.none")}</p>
              <p className="mt-1.5 text-sm text-[var(--text-faint)]">{t("classes.noneHint")}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {classes.map((c) => {
                const mine = assignments
                  .filter((a) => a.classId === c.id)
                  .sort((x, y) => urgencyScore(x) - urgencyScore(y));
                const open = mine.filter((a) => a.status !== "done");
                const next = open[0];

                return (
                  <Link
                    key={c.id}
                    href={`/classes/${c.id}`}
                    className="animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4 transition-colors hover:border-[var(--line-strong)]"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "#6aa84f" }} />
                      <span className="min-w-0 truncate font-medium text-[var(--text)]">{c.name}</span>
                    </span>
                    {c.teacher && (
                      <span className="mt-1 block text-xs text-[var(--text-faint)]">{c.teacher}</span>
                    )}

                    <span className="mt-3 block text-sm text-[var(--text-dim)]">
                      {open.length === 0 ? (
                        t("assignments.noneHint")
                      ) : (
                        <>
                          <span className={isOverdue(next) ? "text-[var(--danger)]" : ""}>
                            {next.title}
                          </span>
                          {next.dueAt !== null && (
                            <span className="ml-1.5 text-[var(--text-faint)]">
                              {dueLabel(next.dueAt, t)}
                            </span>
                          )}
                          {open.length > 1 && (
                            <span className="mt-1 block text-xs text-[var(--text-faint)]">
                              +{open.length - 1} more
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** A due date said the way a person would say it. */
export function dueLabel(dueAt: number, t: (k: "assignments.dueToday" | "assignments.dueTomorrow" | "assignments.overdue") => string): string {
  const days = daysUntil(dueAt);
  if (days < 0) return t("assignments.overdue");
  if (days === 0) return t("assignments.dueToday");
  if (days === 1) return t("assignments.dueTomorrow");
  return new Date(dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
