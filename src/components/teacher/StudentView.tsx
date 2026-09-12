"use client";

// One student, as far as a teacher is allowed to see them.
//
// Same evidence-first rule as the class view, with one addition: the header
// says how much there is to go on. Three sessions is not a picture of a person,
// and a page that renders three sessions the same way it renders thirty invites
// a teacher to draw a conclusion the data cannot support. So the sample size is
// as prominent as the findings.

import Link from "next/link";
import { studentAnalytics, useTeacherStore } from "./store";
import {
  Chip,
  Crumb,
  DataSourceNote,
  SectionHeading,
  Stat,
  cardClass,
  formatLastActive,
} from "./primitives";
import { SignalCard } from "./SignalCard";
import { PrivacyNote } from "./PrivacyNote";
import { evidenceTotal } from "./types";

export function StudentView({ classId, studentId }: { classId: string; studentId: string }) {
  const student = useTeacherStore((s) => (s.roster[classId] ?? []).find((r) => r.id === studentId));
  const klass = useTeacherStore((s) => s.classes.find((c) => c.id === classId));

  if (!student) {
    return (
      <div className={`${cardClass} p-6`}>
        <h1 className="text-lg font-semibold text-[var(--text)]">That student isn&apos;t in this class</h1>
        <Link
          href={`/teacher/classes/${classId}/roster`}
          className="mt-3 inline-block text-sm text-[var(--text-dim)] underline underline-offset-4"
        >
          Back to the roster
        </Link>
      </div>
    );
  }

  const analytics = studentAnalytics(studentId);
  const ranked = [...analytics.topics].sort((a, b) => evidenceTotal(b) - evidenceTotal(a));
  const thin = analytics.sessions < 5;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs">
        <Crumb href="/teacher">Classes</Crumb>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <Crumb href={`/teacher/classes/${classId}`}>{klass?.name ?? "Class"}</Crumb>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <Crumb href={`/teacher/classes/${classId}/roster`}>Roster</Crumb>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text-dim)]">{student.displayName}</span>
      </nav>

      <header className="mt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{student.displayName}</h1>
        <p className="mt-0.5 text-xs text-[var(--text-faint)]">
          {student.email} · {formatLastActive(student.lastActiveAt)}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip tone="good">{student.done} done</Chip>
          {student.doing > 0 && <Chip>{student.doing} in progress</Chip>}
          {student.todo > 0 && <Chip>{student.todo} not started</Chip>}
          {student.overdue > 0 && <Chip tone="bad">{student.overdue} overdue</Chip>}
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat
          value={analytics.sessions}
          label={`Sessions in ${analytics.windowDays} days`}
          tone={thin ? "warn" : "neutral"}
          hint={thin ? "Thin evidence — read the below lightly" : undefined}
        />
        <Stat value={ranked.length} label="Topics with signal" />
        <Stat value={ranked.reduce((n, t) => n + evidenceTotal(t), 0)} label="Observations" />
      </div>

      <div className="mt-6">
        <SectionHeading title="Where they're getting stuck" sub="Loudest first, with the counts behind it." />
        {ranked.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--text-faint)]">
            Nothing stood out this week.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ranked.map((signal, i) => (
              <SignalCard key={signal.id} signal={signal} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-7">
        <PrivacyNote scope="student" />
      </div>

      <DataSourceNote what="this student's signals" />
    </>
  );
}
