"use client";

// One student, as far as a teacher is allowed to see them.
//
// Same evidence-first rule as the class view, with one addition: the header
// says how much there is to go on. Three sessions is not a picture of a person,
// and a page that renders three sessions the same way it renders thirty invites
// a teacher to draw a conclusion the data cannot support. So the sample size is
// as prominent as the findings.
//
// A drill-down from the roster rather than a section of the class, so it has
// its own breadcrumb instead of the class frame -- but it loads the class
// itself. Opened from a link in a fresh tab it used to look the student up in
// an empty roster and say they were not in the class.

import Link from "next/link";
import { useEffect } from "react";
import { useStudentAnalytics, useTeacherStore } from "./store";
import { Chip, Crumb, LoadNote, SectionHeading, Stat, formatLastActive } from "./primitives";
import { SignalCard } from "./SignalCard";
import { PrivacyNote } from "./PrivacyNote";
import { evidenceTotal } from "./types";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { UserIcon } from "@/components/icons";

export function StudentView({ classId, studentId }: { classId: string; studentId: string }) {
  const student = useTeacherStore((s) => s.roster[classId]?.find((r) => r.id === studentId));
  const klass = useTeacherStore((s) => s.classes.find((c) => c.id === classId));
  const classState = useTeacherStore((s) => s.classState[classId]);
  const loadClass = useTeacherStore((s) => s.loadClass);
  // Scoped to this class on purpose: a teacher's read only ever matches classes
  // they own, and anything this student did in another teacher's class — or in
  // the general chat, which no teacher can see at all — is not part of this
  // picture. Called before the early returns below because it is a hook.
  const { data: analytics, state } = useStudentAnalytics(classId, studentId);

  useEffect(() => {
    void loadClass(classId);
  }, [classId, loadClass]);

  if (!student) {
    if (classState?.error) return <LoadNote state={classState} what="this class" onRetry={() => void loadClass(classId)} />;
    if (!classState?.loaded) {
      return (
        <div aria-busy="true" aria-label="Loading this student">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-8 w-56" />
          <Skeleton className="mt-3 h-6 w-64 rounded-full" />
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-ui-lg" />
            ))}
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        icon={<UserIcon />}
        title="That student isn't in this class"
        description="They may have been removed from the roster."
        action={
          <Link href={`/teacher/classes/${classId}/roster`} className="btn btn-secondary">
            Back to the roster
          </Link>
        }
      />
    );
  }

  const ranked = analytics ? [...analytics.topics].sort((a, b) => evidenceTotal(b) - evidenceTotal(a)) : [];
  // Thin evidence is a first-class state here, and "we could not read it" is a
  // different one again — neither may be drawn as a confident empty page.
  const thin = analytics !== null && analytics.sessions < 3;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-[13px]">
        <Crumb href="/teacher">Classes</Crumb>
        <span className="mx-1.5 text-ink-faint">/</span>
        <Crumb href={`/teacher/classes/${classId}`}>{klass?.name ?? "Class"}</Crumb>
        <span className="mx-1.5 text-ink-faint">/</span>
        <Crumb href={`/teacher/classes/${classId}/roster`}>Roster</Crumb>
        <span className="mx-1.5 text-ink-faint">/</span>
        <span className="text-ink-dim" aria-current="page">
          {student.displayName}
        </span>
      </nav>

      <header className="mt-3 flex items-start gap-4">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-[var(--weight-strong)] text-accent-text">
          {student.displayName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl tracking-tight text-ink md:text-[26px]">{student.displayName}</h1>
          <p className="mt-0.5 text-sm text-ink-dim">
            {student.email}
            {student.lastActiveAt !== null ? ` · ${formatLastActive(student.lastActiveAt)}` : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip tone="good">{student.done} done</Chip>
            {student.doing > 0 && <Chip>{student.doing} in progress</Chip>}
            {student.todo > 0 && <Chip>{student.todo} not started</Chip>}
            {student.overdue > 0 && <Chip tone="bad">{student.overdue} overdue</Chip>}
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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

      <div className="mt-8">
        <SectionHeading title="Where they're getting stuck" sub="Loudest first, with the counts behind it." />
        {!analytics ? (
          <LoadNote state={state} what="this student's learning signals" />
        ) : ranked.length === 0 ? (
          <p className="rounded-ui-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm leading-relaxed text-ink-faint">
            No struggle signals from this student in this class in the last {analytics.windowDays} days. That is an answer, not a
            gap: they have not been pressing for help on any one topic often enough to show up here. Anything they did in the
            general chat, outside a class, is theirs and is never shown to a teacher.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ranked.map((signal, i) => (
              <SignalCard key={signal.id} signal={signal} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <PrivacyNote scope="student" />
      </div>
    </>
  );
}
