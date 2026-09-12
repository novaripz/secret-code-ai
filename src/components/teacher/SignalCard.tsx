"use client";

// One struggle signal, with its evidence showing.
//
// This is the component the whole teacher UI is really for, so the rule it
// enforces is worth stating plainly: there is no way to render this card
// without the counts. No "68% mastery", no five-star rating, no number whose
// derivation a teacher cannot reconstruct. What they get is "34 hint requests
// on factoring, from 12 students, over 7 days" — a sentence they can go and
// check against the room in front of them, and disagree with if it is wrong.
//
// Severity is a summary of those counts, not a separate judgement, and it is
// drawn as a stripe as well as a word so the ranked list is scannable without
// reading a single number.

import { SeverityChip, SeverityStripe, cardClass } from "./primitives";
import { evidenceTotal, type TopicSignal } from "./types";

export function SignalCard({ signal, rank }: { signal: TopicSignal; rank?: number }) {
  const total = evidenceTotal(signal);
  const strongest = Math.max(...signal.evidence.map((e) => e.count), 1);

  return (
    <article className={`${cardClass} flex gap-3.5 p-4`}>
      <SeverityStripe severity={signal.severity} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 text-sm font-semibold text-[var(--text)]">
            {rank !== undefined && (
              <span className="mr-1.5 tabular-nums text-[var(--text-faint)]">{rank}.</span>
            )}
            {signal.topic}
          </h3>
          <SeverityChip severity={signal.severity} />
        </div>

        <p className="mt-0.5 text-xs text-[var(--text-faint)]">
          {signal.context} · {signal.studentCount === 1 ? "this student" : `${signal.studentCount} students`} ·
          last {signal.windowDays} days
        </p>

        {/* The evidence, one line each, with a bar sized against the loudest
            piece so the mix is readable without any of it becoming a score. */}
        <ul className="mt-3 flex flex-col gap-1.5">
          {signal.evidence.map((e) => (
            <li key={e.kind + e.label} className="flex items-center gap-2.5">
              <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--text)]">
                {e.count}
              </span>
              <span className="min-w-0 flex-1 text-xs text-[var(--text-dim)]">{e.label}</span>
              <span
                aria-hidden
                className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full sm:block"
                style={{ background: "var(--surface-2)" }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(e.count / strongest) * 100}%`, background: "var(--text-faint)" }}
                />
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-2.5 text-[11px] text-[var(--text-faint)]">
          {total} observations in total over {signal.windowDays} days.
        </p>
      </div>
    </article>
  );
}
