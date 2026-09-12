"use client";

// The landing screen: every class, ranked by what needs the teacher first.
//
// The ordering is the design. A teacher with four minutes does not want an
// alphabetical list; they want the class where eleven people are behind at the
// top. So the sort is "how many students are behind", and the card says the
// number out loud rather than encoding it as a colour a colourblind teacher
// cannot read. Colour is the second signal, never the only one.

import Link from "next/link";
import { useMemo } from "react";
import { useTeacherStore } from "./store";
import {
  Chip,
  DataSourceNote,
  cardClass,
  formatDue,
  Stat,
} from "./primitives";
import { ChevronRightIcon } from "@/components/icons";

export function ClassesView() {
  const classes = useTeacherStore((s) => s.classes);

  const ordered = useMemo(
    () => [...classes].sort((a, b) => b.studentsBehind - a.studentsBehind),
    [classes],
  );

  const totals = useMemo(
    () => ({
      students: classes.reduce((n, c) => n + c.studentCount, 0),
      behind: classes.reduce((n, c) => n + c.studentsBehind, 0),
      pending: classes.reduce((n, c) => n + c.pendingInviteCount, 0),
    }),
    [classes],
  );

  return (
    <>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">Teacher</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">Your classes</h1>
        <p className="mt-1.5 text-sm text-[var(--text-dim)]">
          Sorted by how many students are behind, so the one that needs you is first.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat value={classes.length} label="Classes" />
        <Stat value={totals.students} label="Students" />
        <Stat
          value={totals.behind}
          label="Students behind"
          tone={totals.behind > 0 ? "bad" : "good"}
          hint="Has at least one overdue assignment"
        />
        <Stat value={totals.pending} label="Invites pending" tone={totals.pending > 0 ? "warn" : "neutral"} />
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {ordered.map((c) => {
          const due = formatDue(c.nextDueAt);
          return (
            <Link
              key={c.id}
              href={`/teacher/classes/${c.id}`}
              className={`${cardClass} group flex items-stretch gap-3.5 p-4 transition-colors hover:bg-[var(--surface-1)]`}
            >
              {/* The class colour is identity, not status — hence a thin bar
                  rather than a filled card that would fight the severity hues. */}
              <span
                aria-hidden
                className="w-1 shrink-0 rounded-full"
                style={{ background: c.color ?? "var(--line-strong)" }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-[var(--text)]">{c.name}</h2>
                  {c.studentsBehind > 0 && (
                    <Chip tone={c.studentsBehind > 5 ? "bad" : "warn"}>
                      {c.studentsBehind} behind
                    </Chip>
                  )}
                  {c.pendingInviteCount > 0 && (
                    <Chip>{c.pendingInviteCount} invited</Chip>
                  )}
                </div>

                {c.period && <p className="mt-0.5 truncate text-xs text-[var(--text-faint)]">{c.period}</p>}

                <p className="mt-2 text-xs text-[var(--text-dim)]">
                  {c.studentCount} students · {c.assignmentCount} assignments ·{" "}
                  <span style={{ color: due.tone === "bad" ? "var(--danger)" : undefined }}>{due.text}</span>
                </p>
              </div>

              <ChevronRightIcon className="h-4 w-4 shrink-0 self-center text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      <DataSourceNote what="the class list" />
    </>
  );
}
