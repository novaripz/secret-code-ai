"use client";

// The class landing section: the four things worth knowing, and a way into each.
//
// Summary before detail, taken literally — this screen holds nothing that is
// not also on the roster, assignments or analytics sections. Its job is to be
// the fifteen seconds a teacher has before the bell, and to point at the one
// section that deserves the rest of the period.

import Link from "next/link";
import { useMemo } from "react";
import { NO_ASSIGNMENTS, NO_INVITES, NO_STUDENTS, useClassAnalytics, useTeacherStore } from "./store";
import { Chip, SectionHeading, Stat, LoadNote, formatDue, quietButtonClass } from "./primitives";
import { SignalCard } from "./SignalCard";
import { evidenceTotal } from "./types";
import { startOfDay } from "@/lib/school/due";
import { useNow } from "@/components/home/SchoolKit";
import { ArrowRightIcon, CircleCheckIcon } from "@/components/icons";

export function OverviewView({ classId }: { classId: string }) {
  const klass = useTeacherStore((s) => s.classes.find((c) => c.id === classId));
  const students = useTeacherStore((s) => s.roster[classId] ?? NO_STUDENTS);
  const invites = useTeacherStore((s) => s.invites[classId] ?? NO_INVITES);
  const assignments = useTeacherStore((s) => s.assignments[classId] ?? NO_ASSIGNMENTS);
  // Signals are a real read now, and it can fail. This screen is a summary, so
  // a failure is shown as one line rather than taking the page over — but it is
  // shown, because a zero here that is really an error would send a teacher
  // into Monday believing the room is fine.
  const { data: analytics, state: analyticsState } = useClassAnalytics(classId);
  const now = useNow();

  // What is coming up, not what came and went. Sorting every dated assignment
  // used to put one from last month at the top forever. Work due earlier today
  // still counts as "next": it is today's.
  const next = useMemo(() => {
    const today = startOfDay(now);
    return [...assignments].filter((a) => a.dueAt !== null && a.dueAt >= today).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0];
  }, [assignments, now]);

  if (!klass) return null;

  const behind = students.filter((s) => s.overdue > 0);
  const top = analytics ? [...analytics.topics].sort((x, y) => evidenceTotal(y) - evidenceTotal(x))[0] : undefined;
  const signalsBroken = analyticsState.error !== null;

  const base = `/teacher/classes/${classId}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat value={klass.studentCount} label="Students" hint={invites.length ? `${invites.length} invited` : undefined} />
        <Stat
          value={behind.length || klass.studentsBehind}
          label="Behind right now"
          tone={(behind.length || klass.studentsBehind) > 0 ? "bad" : "good"}
          hint="At least one overdue assignment"
        />
        <Stat value={assignments.length || klass.assignmentCount} label="Assignments" />
        <Stat
          value={analytics ? analytics.topics.filter((t) => t.severity === "critical").length : signalsBroken ? "—" : "…"}
          label="Topics needing a lesson"
          tone="warn"
          hint={signalsBroken ? "Signals didn't load — this is not a zero" : `From the last ${analytics?.windowDays ?? 14} days of signals`}
        />
      </div>

      {signalsBroken && (
        <div className="mt-6">
          <LoadNote state={analyticsState} what="this class's learning signals" />
        </div>
      )}

      {top && (
        <div className="mt-8">
          <SectionHeading
            title="Biggest signal right now"
            sub="The rest, ranked, are in Analytics."
            action={
              <Link href={`${base}/analytics`} className={`${quietButtonClass} btn-sm`}>
                All signals
                <ArrowRightIcon aria-hidden />
              </Link>
            }
          />
          <SignalCard signal={top} />
        </div>
      )}

      <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
        <section className="card p-4">
          <h2 className="eyebrow">Due next</h2>
          {next ? (
            <>
              <Link href={`${base}/assignments/${next.id}`} className="mt-2 block font-[var(--weight-ui)] text-ink underline-offset-4 hover:underline">
                {next.title}
              </Link>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone={formatDue(next.dueAt, now).tone === "bad" ? "bad" : formatDue(next.dueAt, now).tone === "warn" ? "warn" : "neutral"}>
                  {formatDue(next.dueAt, now).text}
                </Chip>
                <Chip tone={next.done > 0 ? "good" : "neutral"}>
                  {next.done}/{next.done + next.doing + next.todo} done
                </Chip>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-faint">Nothing coming up with a due date.</p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="eyebrow">Students behind</h2>
          {students.length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Nobody has joined yet. Add students on the roster.</p>
          ) : behind.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-dim">
              <CircleCheckIcon className="h-4 w-4 text-success" aria-hidden />
              Nobody has anything overdue.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {behind.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`${base}/students/${s.id}`} className="min-w-0 truncate text-ink underline-offset-4 hover:underline">
                    {s.displayName}
                  </Link>
                  <Chip tone="bad">{s.overdue} overdue</Chip>
                </li>
              ))}
            </ul>
          )}
          <Link href={`${base}/roster`} className="tap mt-3 inline-flex items-center gap-1 text-[13px] font-[var(--weight-ui)] text-accent-text underline-offset-4 hover:underline">
            Open the roster
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </section>
      </div>
    </>
  );
}
