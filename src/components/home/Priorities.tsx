"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useFocusStore } from "@/store/useFocusStore";
import { useI18n } from "@/lib/i18n";
import { rankAssignments } from "@/lib/school/planner";
import { ArrowRightIcon } from "@/components/icons";
import { ClassDot, DueBadge, LiftChip, useNow } from "./SchoolKit";
import { FocusPill, useFocusHydrated } from "./FocusTimer";

// What to care about right now, on the home screen.
//
// Three items at most. The point of this strip is to answer one question in
// under a second, and a list of everything answers it worse than a list of
// three. Renders nothing at all when there is no work, rather than occupying
// the screen to say so -- unless a focus session is running, which is worth
// a line on its own.
//
// The order is the planner's own `rankAssignments`, not a second sort written
// here. If this strip and the plan page disagreed about what comes first, a
// student would be right to trust neither -- so there is one ranking, and both
// screens read it. The chips are the plan's chips too, from the same file.
//
// On a phone the title gets the whole first line and the class and due date
// go underneath, rather than all four squeezing the title down to a word.

export function Priorities() {
  const hydrated = useSchoolStore((s) => s.hydrated);
  const hydrate = useSchoolStore((s) => s.hydrate);
  const assignments = useSchoolStore((s) => s.assignments);
  const classes = useSchoolStore((s) => s.classes);
  const steps = useSchoolStore((s) => s.steps);
  const focusReady = useFocusHydrated();
  const focusing = useFocusStore((s) => s.session !== null);
  const { t } = useI18n();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const now = useNow();
  const top = useMemo(() => rankAssignments(assignments, now, { steps }).slice(0, 3), [assignments, steps, now]);
  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  if (!hydrated || (top.length === 0 && !(focusReady && focusing))) return null;

  return (
    <section aria-labelledby="priorities-heading" className="mx-auto mt-8 w-full max-w-2xl animate-rise">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id="priorities-heading" className="eyebrow">
          {t("plan.upNext")}
        </h2>
        <Link
          href="/plan"
          className="tap inline-flex items-center gap-1 rounded-ui-sm px-1 text-sm text-ink-dim underline-offset-4 transition-colors hover:text-ink hover:underline md:text-[13px]"
        >
          {t("plan.make")}
          <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {focusReady && focusing && <FocusPill className="mb-2" />}

      {top.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {top.map(({ assignment: a, pinned, heavy }) => {
            const cls = byId.get(a.classId);
            return (
              <li key={a.id}>
                <Link
                  href={`/classes/${a.classId}/${a.id}`}
                  className="tap card card-interactive flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <ClassDot color={cls?.color} />
                    <span className="min-w-0 flex-1 truncate text-sm font-[var(--weight-ui)] text-ink">{a.title}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 pl-5 sm:pl-0">
                    {pinned ? <LiftChip kind="pinned" /> : heavy ? <LiftChip kind="heavy" /> : null}
                    {cls && <span className="max-w-[10rem] truncate text-xs text-ink-faint">{cls.name}</span>}
                    <DueBadge dueAt={a.dueAt} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
