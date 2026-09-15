"use client";

// Class analytics: what this room is stuck on, loudest first.
//
// The page answers one question — "what should I reteach on Monday?" — so the
// summary sits above the detail and the detail is a ranked list of signals with
// their evidence attached. Everything is scoped to the insights engine's window
// (a fortnight) because a count with no window is not a fact about anything.
//
// The coverage line under the summary is not decoration: if only 21 of 27
// students used Panda this week, every number below is about those 21, and a
// teacher who does not know that will over-read them.

import Link from "next/link";
import { useClassAnalytics, useTeacherStore } from "./store";
import { LoadNote, SectionHeading, Stat, cardClass } from "./primitives";
import { SignalCard } from "./SignalCard";
import { PrivacyNote } from "./PrivacyNote";
import { evidenceTotal } from "./types";

export function AnalyticsView({ classId }: { classId: string }) {
  // The read is asynchronous and can fail, and a failure must never render as
  // a calm empty page: "nobody struggled this week" and "we couldn't ask" are
  // opposite facts about this room. LoadNote says which one happened, and the
  // rest of the screen only draws once there is something real behind it.
  const { data: analytics, state } = useClassAnalytics(classId);
  const roster = useTeacherStore((s) => s.roster[classId] ?? []);

  if (!analytics) return <LoadNote state={state} what="this class's learning signals" />;

  const quiet = analytics.topics.length === 0 && analytics.steady.length === 0;

  const ranked = [...analytics.topics].sort((a, b) => evidenceTotal(b) - evidenceTotal(a));
  const critical = ranked.filter((t) => t.severity === "critical").length;
  const observations = ranked.reduce((n, t) => n + evidenceTotal(t), 0);
  const coverage =
    analytics.totalStudents > 0
      ? Math.round((analytics.activeStudents / analytics.totalStudents) * 100)
      : 100;

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
          label="Students with signals"
          tone={coverage < 70 ? "warn" : "neutral"}
          hint={`Everything here is about those ${analytics.activeStudents}`}
        />
      </div>

      {quiet && (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm leading-relaxed text-[var(--text-faint)]">
          No struggle signals from this class in the last {analytics.windowDays} days. That is a
          real answer, not a missing one — it means nobody pressed for help often enough on one
          topic for it to be worth a line here. Students working offline or signed out are counted
          only once their browser reconnects.
        </p>
      )}

      {ranked.length > 0 && (
        <div className="mt-6">
          <SectionHeading title="What they're stuck on" sub="Loudest first. Every line shows its count." />
          <div className="flex flex-col gap-2.5">
            {ranked.map((signal, i) => (
              <SignalCard key={signal.id} signal={signal} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {analytics.steady.length > 0 && (
        <div className="mt-7">
          <SectionHeading
            title="Not a pattern yet"
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
                className={`tap ${cardClass} flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--surface-1)]`}
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

    </>
  );
}
