"use client";

// Every assignment in one class, with its rules visible from the list.
//
// The rules are the part a teacher actually worries about — "can Panda just
// tell them the answer on this one?" — so they are chips on the row rather than
// something you have to open the editor to find out. Overdue sorts first for
// the same reason the student planner does it: the thing that is already late
// is the thing being asked about.

import Link from "next/link";
import { useMemo } from "react";
import { useTeacherStore } from "./store";
import {
  Chip,
  DataSourceNote,
  buttonClass,
  cardClass,
  formatDue,
  SectionHeading,
} from "./primitives";
import { PlusIcon } from "@/components/icons";
import { RuleChips } from "./RuleChips";

export function AssignmentsView({ classId }: { classId: string }) {
  const assignments = useTeacherStore((s) => s.assignments[classId] ?? []);

  const ordered = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        // No due date sinks; otherwise soonest first, which puts overdue on top.
        if (a.dueAt === null) return 1;
        if (b.dueAt === null) return -1;
        return a.dueAt - b.dueAt;
      }),
    [assignments],
  );

  return (
    <>
      <SectionHeading
        title="Assignments"
        sub="What Panda is allowed to do is set per assignment, and students are told when something is off."
        action={
          <Link href={`/teacher/classes/${classId}/assignments/new`} className={buttonClass}>
            <PlusIcon className="h-4 w-4" />
            New assignment
          </Link>
        }
      />

      {ordered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--text-faint)]">
          Nothing set for this class yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ordered.map((a) => {
            const due = formatDue(a.dueAt);
            const total = a.done + a.doing + a.todo;
            const pct = total > 0 ? Math.round((a.done / total) * 100) : 0;
            return (
              <Link
                key={a.id}
                href={`/teacher/classes/${classId}/assignments/${a.id}`}
                className={`${cardClass} block p-4 transition-colors hover:bg-[var(--surface-1)]`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold text-[var(--text)]">{a.title}</h3>
                  <Chip tone={due.tone === "bad" ? "bad" : due.tone === "warn" ? "warn" : "neutral"}>
                    {due.text}
                  </Chip>
                </div>

                {a.instructions && (
                  <p className="mt-1 line-clamp-1 text-xs text-[var(--text-faint)]">{a.instructions}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <RuleChips rules={a.rules} />
                  {a.points !== undefined && <Chip>{a.points} pts</Chip>}
                  {a.source === "canvas" && <Chip>From Canvas</Chip>}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  {/* A bar is the summary; the counts underneath are the evidence,
                      because a bare percentage hides how many people it is about. */}
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{ background: "var(--surface-2)" }}
                    role="img"
                    aria-label={`${a.done} of ${total} students finished`}
                  >
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--success)" }} />
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-dim)]">
                    {a.done}/{total} done · {a.doing} started
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <DataSourceNote what="the assignment list and its progress counts" />
    </>
  );
}
