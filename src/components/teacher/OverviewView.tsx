"use client";

// The class landing tab: the four things worth knowing, and a way into each.
//
// Summary before detail, taken literally — this screen holds nothing that is
// not also on the roster, assignments or analytics tabs. Its job is to be the
// fifteen seconds a teacher has before the bell, and to point at the one tab
// that deserves the rest of the period.

import Link from "next/link";
import { classAnalytics, useTeacherStore } from "./store";
import {
  Chip,
  DataSourceNote,
  SectionHeading,
  Stat,
  cardClass,
  formatDue,
  quietButtonClass,
} from "./primitives";
import { SignalCard } from "./SignalCard";
import { evidenceTotal } from "./types";

export function OverviewView({ classId }: { classId: string }) {
  const klass = useTeacherStore((s) => s.classes.find((c) => c.id === classId));
  const students = useTeacherStore((s) => s.roster[classId] ?? []);
  const invites = useTeacherStore((s) => s.invites[classId] ?? []);
  const assignments = useTeacherStore((s) => s.assignments[classId] ?? []);
  const analytics = classAnalytics(classId);

  if (!klass) return null;

  const behind = students.filter((s) => s.overdue > 0);
  const next = [...assignments]
    .filter((a) => a.dueAt !== null)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0];
  const top = analytics
    ? [...analytics.topics].sort((x, y) => evidenceTotal(y) - evidenceTotal(x))[0]
    : undefined;

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
          value={analytics ? analytics.topics.filter((t) => t.severity === "critical").length : 0}
          label="Topics needing a lesson"
          tone="warn"
          hint="From this week's signals"
        />
      </div>

      {top && (
        <div className="mt-6">
          <SectionHeading
            title="Biggest signal this week"
            sub="The rest, ranked, are on the analytics tab."
            action={
              <Link href={`${base}/analytics`} className={quietButtonClass}>
                All signals
              </Link>
            }
          />
          <SignalCard signal={top} />
        </div>
      )}

      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        <div className={`${cardClass} p-4`}>
          <h2 className="text-sm font-semibold text-[var(--text)]">Due next</h2>
          {next ? (
            <>
              <Link
                href={`${base}/assignments/${next.id}`}
                className="mt-1.5 block text-sm text-[var(--text-dim)] underline-offset-4 hover:underline"
              >
                {next.title}
              </Link>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone={formatDue(next.dueAt).tone === "bad" ? "bad" : "neutral"}>
                  {formatDue(next.dueAt).text}
                </Chip>
                <Chip>
                  {next.done}/{next.done + next.doing + next.todo} done
                </Chip>
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-[var(--text-faint)]">Nothing with a due date.</p>
          )}
        </div>

        <div className={`${cardClass} p-4`}>
          <h2 className="text-sm font-semibold text-[var(--text)]">Students behind</h2>
          {behind.length === 0 ? (
            <p className="mt-1.5 text-sm text-[var(--text-faint)]">Nobody has anything overdue.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {behind.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`${base}/students/${s.id}`}
                    className="min-w-0 truncate text-[var(--text-dim)] underline-offset-4 hover:underline"
                  >
                    {s.displayName}
                  </Link>
                  <Chip tone="bad">{s.overdue} overdue</Chip>
                </li>
              ))}
            </ul>
          )}
          <Link href={`${base}/roster`} className="mt-3 inline-block text-xs text-[var(--text-faint)] underline underline-offset-4">
            Open the roster
          </Link>
        </div>
      </div>

      <DataSourceNote what="everything on this tab" />
    </>
  );
}
