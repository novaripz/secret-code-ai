"use client";

// Class analytics: what this room is stuck on, loudest first.
//
// The page answers one question — "what should I reteach on Monday?" — so the
// summary sits above the detail and the detail is a ranked list of signals with
// their evidence attached. Everything is scoped to a window (a week) because a
// count with no window is not a fact about anything.
//
// The coverage line under the summary is not decoration: if only 21 of 27
// students used Panda this week, every number below is about those 21, and a
// teacher who does not know that will over-read them.

import Link from "next/link";
import { classAnalytics, useTeacherStore } from "./store";
import { DataSourceNote, SectionHeading, Stat, cardClass } from "./primitives";
import { SignalCard } from "./SignalCard";
import { PrivacyNote } from "./PrivacyNote";
import { evidenceTotal } from "./types";

export function AnalyticsView({ classId }: { classId: string }) {
  const analytics = classAnalytics(classId);
  const roster = useTeacherStore((s) => s.roster[classId] ?? []);

  if (!analytics) {
    return (
      <div className={`${cardClass} p-6 text-sm text-[var(--text-dim)]`}>
        <p className="font-medium text-[var(--text)]">No signals for this class yet</p>
        <p className="mt-1.5">
          Signals appear once students have worked with Panda on this class&apos;s assignments. Nothing
          is inferred from an empty week.
        </p>
      </div>
    );
  }

  const ranked = [...analytics.topics].sort((a, b) => evidenceTotal(b) - evidenceTotal(a));
  const critical = ranked.filter((t) => t.severity === "critical").length;
  const observations = ranked.reduce((n, t) => n + evidenceTotal(t), 0);
  const coverage = Math.round((analytics.activeStudents / analytics.totalStudents) * 100);

  return (
    <>
      <SectionHeading
        title={`Last ${analytics.windowDays} days`}
        sub="Ranked by how much evidence there is, not by a score."
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat value={critical} label="Topics needing a lesson" tone={critical > 0 ? "bad" : "good"} />
        <Stat value={ranked.length} label="Topics with signal" />
        <Stat value={observations} label="Observations" hint="Hints, repeats, retries, stalls" />
        <Stat
          value={`${analytics.activeStudents}/${analytics.totalStudents}`}
          label="Students seen"
          tone={coverage < 70 ? "warn" : "neutral"}
          hint={`Everything here is about those ${analytics.activeStudents}`}
        />
      </div>

      <div className="mt-6">
        <SectionHeading title="What they're stuck on" sub="Loudest first. Every line shows its count." />
        <div className="flex flex-col gap-2.5">
          {ranked.map((signal, i) => (
            <SignalCard key={signal.id} signal={signal} rank={i + 1} />
          ))}
        </div>
      </div>

      {analytics.steady.length > 0 && (
        <div className="mt-7">
          <SectionHeading
            title="Quiet this week"
            sub="Low evidence either way — shown so the page isn't only bad news."
          />
          <div className="flex flex-col gap-2.5">
            {analytics.steady.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {roster.length > 0 && (
        <div className="mt-7">
          <SectionHeading title="By student" sub="Same signals, one person at a time." />
          <div className="grid gap-2 sm:grid-cols-2">
            {roster.map((s) => (
              <Link
                key={s.id}
                href={`/teacher/classes/${classId}/students/${s.id}`}
                className={`${cardClass} flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--surface-1)]`}
              >
                <span className="min-w-0 truncate font-medium text-[var(--text)]">{s.displayName}</span>
                <span className="shrink-0 text-xs text-[var(--text-faint)]">
                  {s.overdue > 0 ? `${s.overdue} overdue` : "On track"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-7">
        <PrivacyNote scope="class" />
      </div>

      <DataSourceNote what="every signal on this page" />
    </>
  );
}
