"use client";

// One student, as far as a teacher is allowed to see them.
//
// Same evidence-first rule as the class view, with one addition: the header
// says how much there is to go on. Three sessions is not a picture of a person,
// and a page that renders three sessions the same way it renders thirty invites
// a teacher to draw a conclusion the data cannot support. So the sample size is
// as prominent as the findings.

import Link from "next/link";
import { useStudentAnalytics, useTeacherStore } from "./store";
import {
  Chip,
  Crumb,
  LoadNote,
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
  // Scoped to this class on purpose: a teacher's read only ever matches classes
  // they own, and anything this student did in another teacher's class — or in
  // the general chat, which no teacher can see at all — is not part of this
  // picture. Called before the early return below because it is a hook.
  const { data: analytics, state } = useStudentAnalytics(classId, studentId);

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

  const ranked = analytics
    ? [...analytics.topics].sort((a, b) => evidenceTotal(b) - evidenceTotal(a))
    : [];
  // Thin evidence is a first-class state here, and "we could not read it" is a
  // different one again — neither may be drawn as a confident empty page.
  const thin = analytics !== null && analytics.sessions < 3;

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
          {student.email}
          {student.lastActiveAt !== null ? ` · ${formatLastActive(student.lastActiveAt)}` : ""}
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
          value={analytics ? analytics.sessions : state.error ? "—" : "…"}
          // Days, not sessions: the table stores no session id, so counting
          // sessions would mean printing a number nothing measured.
          label={`Days with signals in ${analytics?.windowDays ?? 14}`}
          tone={thin ? "warn" : "neutral"}
          hint={thin ? "Thin evidence — read the below lightly" : undefined}
        />
        <Stat value={ranked.length} label="Topics with signal" />
        <Stat value={ranked.reduce((n, t) => n + evidenceTotal(t), 0)} label="Observations" />
      </div>

      <div className="mt-6">
        <SectionHeading title="Where they're getting stuck" sub="Loudest first, with the counts behind it." />
        {!analytics ? (
          <LoadNote state={state} what="this student's learning signals" />
        ) : ranked.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm leading-relaxed text-[var(--text-faint)]">
            No struggle signals from this student in this class in the last {analytics.windowDays}{" "}
            days. That is an answer, not a gap: they have not been pressing for help on any one
            topic often enough to show up here. Anything they did in the general chat, outside a
            class, is theirs and is never shown to a teacher.
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

    </>
  );
}
