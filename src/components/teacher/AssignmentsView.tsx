"use client";

// Every assignment in one class, with its rules visible from the list.
//
// The rules are the part a teacher actually worries about — "can Panda just
// tell them the answer on this one?" — so they are chips on the row rather than
// something you have to open the editor to find out.
//
// Ordered as three groups rather than one sorted list. Sorting everything by
// due date put the oldest past-due work at the top for the rest of the term,
// so the assignment a teacher set this morning sat under three months of
// history. Now: what is coming up (soonest first), then what has no date, then
// what is past due (most recent first) -- where a teacher looking back can find
// it, and where it is not in the way.

import Link from "next/link";
import { useMemo, useState } from "react";
import { NO_ASSIGNMENTS, useTeacherStore } from "./store";
import type { TeacherAssignment } from "./types";
import { Chip, buttonClass, formatDue, SectionHeading } from "./primitives";
import { RuleChips } from "./RuleChips";
import { isPastDue } from "@/lib/school/due";
import { useNow } from "@/components/home/SchoolKit";
import { EmptyState } from "@/components/ui/primitives";
import { ChevronDownIcon, ListTodoIcon, PinIcon, PlusIcon } from "@/components/icons";

function AssignmentCard({ a, classId, now }: { a: TeacherAssignment; classId: string; now: number }) {
  const due = formatDue(a.dueAt, now);
  const total = a.done + a.doing + a.todo;
  const pct = total > 0 ? Math.round((a.done / total) * 100) : 0;
  return (
    <li>
      <Link href={`/teacher/classes/${classId}/assignments/${a.id}`} className="card card-interactive block p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] font-[var(--weight-strong)] text-ink">{a.title}</h3>
          <Chip tone={due.tone === "bad" ? "bad" : due.tone === "warn" ? "warn" : "neutral"}>{due.text}</Chip>
        </div>

        {a.instructions && <p className="mt-1 line-clamp-1 text-[13px] text-ink-faint">{a.instructions}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RuleChips rules={a.rules} />
          {/* Not a rule, so it is not in RuleChips: the flag says where this
              sits in a student's plan, not what Panda may do with it. Shown on
              the row because "which of these did I make a priority" is a
              question a teacher asks of the list. Called "Teacher priority"
              here and on the student's screen, so both sides use one name. */}
          {a.teacherPinned && (
            <Chip tone="accent">
              <PinIcon aria-hidden />
              Teacher priority
            </Chip>
          )}
          {a.points !== undefined && <Chip>{a.points} pts</Chip>}
          {a.source === "canvas" && <Chip>From Canvas</Chip>}
        </div>

        <div className="mt-3 flex items-center gap-3">
          {/* A bar is the summary; the counts beside it are the evidence,
              because a bare percentage hides how many people it is about. */}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${a.done} of ${total} students finished`}>
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-dim">
            {a.done}/{total} done · {a.doing} started
          </span>
        </div>
      </Link>
    </li>
  );
}

export function AssignmentsView({ classId }: { classId: string }) {
  const assignments = useTeacherStore((s) => s.assignments[classId] ?? NO_ASSIGNMENTS);
  const now = useNow();
  const [showPast, setShowPast] = useState(false);

  const { upcoming, undated, past } = useMemo(() => {
    const upcoming = assignments
      .filter((a) => a.dueAt !== null && !isPastDue(a.dueAt, now))
      .sort((a, b) => (a.dueAt as number) - (b.dueAt as number));
    const undated = assignments.filter((a) => a.dueAt === null).sort((a, b) => a.title.localeCompare(b.title));
    const past = assignments
      .filter((a) => a.dueAt !== null && isPastDue(a.dueAt, now))
      .sort((a, b) => (b.dueAt as number) - (a.dueAt as number));
    return { upcoming, undated, past };
  }, [assignments, now]);

  const newLink = (
    <Link href={`/teacher/classes/${classId}/assignments/new`} className={`${buttonClass} btn-sm`}>
      <PlusIcon aria-hidden />
      New assignment
    </Link>
  );

  return (
    <>
      <SectionHeading
        title="Assignments"
        sub="What Panda is allowed to do is set per assignment, and students are told when something is off."
        action={newLink}
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={<ListTodoIcon />}
          title="Nothing set for this class yet"
          description="Assignments appear on each student's plan, with the rules you choose for Panda."
          action={newLink}
        />
      ) : (
        <div className="flex flex-col gap-7">
          {upcoming.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5">Coming up</h3>
              <ul className="flex flex-col gap-2.5">
                {upcoming.map((a) => (
                  <AssignmentCard key={a.id} a={a} classId={classId} now={now} />
                ))}
              </ul>
            </section>
          )}
          {undated.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5">No due date</h3>
              <ul className="flex flex-col gap-2.5">
                {undated.map((a) => (
                  <AssignmentCard key={a.id} a={a} classId={classId} now={now} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <button
                type="button"
                className="tap inline-flex items-center gap-1.5 rounded-ui-sm text-sm font-[var(--weight-ui)] text-ink-dim hover:text-ink"
                aria-expanded={showPast || upcoming.length + undated.length === 0}
                onClick={() => setShowPast((v) => !v)}
              >
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${showPast || upcoming.length + undated.length === 0 ? "" : "-rotate-90"}`} aria-hidden />
                Past due ({past.length})
              </button>
              {(showPast || upcoming.length + undated.length === 0) && (
                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {past.map((a) => (
                    <AssignmentCard key={a.id} a={a} classId={classId} now={now} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
