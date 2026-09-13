"use client";

// The landing screen: every class, ranked by what needs the teacher first.
//
// The ordering is the design. A teacher with four minutes does not want an
// alphabetical list; they want the class where eleven people are behind at the
// top. So the sort is "how many students are behind", and the card says the
// number out loud rather than encoding it as a colour a colourblind teacher
// cannot read. Colour is the second signal, never the only one.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTeacherStore } from "./store";
import {
  Chip,
  LoadNote,
  cardClass,
  formatDue,
  Stat,
} from "./primitives";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";

export function ClassesView() {
  const classes = useTeacherStore((s) => s.classes);
  const state = useTeacherStore((s) => s.classesState);
  const loadClasses = useTeacherStore((s) => s.loadClasses);
  const createClass = useTeacherStore((s) => s.createClass);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const id = await createClass(name, period);
    setSaving(false);
    if (id) {
      setName("");
      setPeriod("");
      setAdding(false);
    }
    // A failure leaves the form filled and lands in actionError, which the
    // frame already shows — retyping a class name to find out why is a
    // punishment for the app's problem.
  }

  // Load once on mount. The store collapses concurrent calls into one request,
  // so this and the class frame asking at the same moment is still one read.
  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

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

      {/* Creating a class is the only way into everything else, so the control
          is always present rather than hidden behind the empty state. */}
      <div className="mt-6 flex justify-end">
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
          >
            <PlusIcon className="h-4 w-4" aria-hidden />
            New class
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} className={`${cardClass} mt-3 flex flex-col gap-3 p-4`}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Class name, e.g. English 9"
              aria-label="Class name"
              className="min-w-0 flex-[2] rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
            />
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="Period 3 (optional)"
              aria-label="Period or section"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40"
            >
              {saving ? "Creating…" : "Create class"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-[var(--text-faint)]">
            You add students by email afterwards. They don&apos;t have to accept anything.
          </p>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        <LoadNote state={state} what="your classes" onRetry={() => void loadClasses()} />

        {/* Only said once the read actually succeeded: an empty list is a fact
            about the database, and we have not earned the right to state it
            while a request is in flight or after one failed. */}
        {state.loaded && ordered.length === 0 && !adding && (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
            <p className="text-sm text-[var(--text-faint)]">
              You don&apos;t have any classes yet. A class is where students, assignments
              and everything Panda notices about them live, so it is the first thing to make.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Create your first class
            </button>
          </div>
        )}

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
    </>
  );
}
