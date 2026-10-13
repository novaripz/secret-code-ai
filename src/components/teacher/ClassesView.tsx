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
import { ActionErrorNote, Chip, LoadNote, Stat, formatDue } from "./primitives";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { AlertIcon, ChevronRightIcon, GraduationCapIcon, PlusIcon, XIcon } from "@/components/icons";

export function ClassesView() {
  const classes = useTeacherStore((s) => s.classes);
  const state = useTeacherStore((s) => s.classesState);
  const loadClasses = useTeacherStore((s) => s.loadClasses);
  const createClass = useTeacherStore((s) => s.createClass);
  const actionError = useTeacherStore((s) => s.actionError);
  const clearActionError = useTeacherStore((s) => s.clearActionError);

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
    // A failure leaves the form filled and lands in actionError, shown just
    // below -- retyping a class name to find out why is a punishment for the
    // app's problem.
  }

  // Load once on mount. The store collapses concurrent calls into one request,
  // so this and the class frame asking at the same moment is still one read.
  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  const ordered = useMemo(() => [...classes].sort((a, b) => b.studentsBehind - a.studentsBehind || a.name.localeCompare(b.name)), [classes]);

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
      <PageHeader
        icon={<GraduationCapIcon />}
        title="Your classes"
        description="Sorted by how many students are behind, so the one that needs you is first."
        actions={
          // Creating a class is the only way into everything else, so the
          // control is always here rather than hidden behind the empty state.
          !adding && (
            <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={() => setAdding(true)}>
              New class
            </Button>
          )
        }
      />

      {state.loaded && classes.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat value={classes.length} label="Classes" />
          <Stat value={totals.students} label="Students" />
          <Stat value={totals.behind} label="Students behind" tone={totals.behind > 0 ? "bad" : "good"} hint="Has at least one overdue assignment" />
          <Stat value={totals.pending} label="Invites pending" tone={totals.pending > 0 ? "warn" : "neutral"} />
        </div>
      )}

      {adding && (
        <form onSubmit={submit} className="card mt-6 animate-rise p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-[var(--weight-strong)] text-ink">New class</h2>
            <button type="button" onClick={() => setAdding(false)} className="icon-btn" aria-label="Cancel" title="Cancel">
              <XIcon aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-0 flex-[2] flex-col gap-1.5">
              <span className="text-[13px] font-[var(--weight-ui)] text-ink-dim">Class name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. English 9" className="input" />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[13px] font-[var(--weight-ui)] text-ink-dim">Period or section (optional)</span>
              <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period 3" className="input" />
            </label>
          </div>
          <p className="mt-3 text-[13px] text-ink-faint">You add students by email afterwards. They don&apos;t have to accept anything.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost">
              Cancel
            </button>
            <Button type="submit" variant="primary" loading={saving} disabled={!name.trim()}>
              {saving ? "Creating…" : "Create class"}
            </Button>
          </div>
        </form>
      )}

      <ActionErrorNote error={actionError} onDismiss={clearActionError} />

      <div className="mt-6 flex flex-col gap-2.5">
        <LoadNote state={state} what="your classes" onRetry={() => void loadClasses()} />

        {/* Only said once the read actually succeeded: an empty list is a fact
            about the database, and we have not earned the right to state it
            while a request is in flight or after one failed. */}
        {state.loaded && ordered.length === 0 && !adding && (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="No classes yet"
            description="A class is where students, assignments and everything Panda notices about them live, so it is the first thing to make."
            action={
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                Create your first class
              </Button>
            }
          />
        )}

        {ordered.length > 0 && (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {ordered.map((c) => {
              const due = formatDue(c.nextDueAt);
              return (
                <li key={c.id}>
                  <Link href={`/teacher/classes/${c.id}`} className="card card-interactive group relative flex h-full flex-col overflow-hidden p-4 pl-5">
                    {/* The class colour is identity, not status -- hence a thin
                        bar rather than a filled card that would fight the
                        severity hues. */}
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: c.color ?? "var(--line-strong)" }} />
                    <span className="flex items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-[var(--weight-strong)] text-ink">{c.name}</span>
                        {c.period && <span className="mt-0.5 block truncate text-[13px] text-ink-faint">{c.period}</span>}
                      </span>
                      <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-1.5">
                      {c.studentsBehind > 0 ? (
                        <Chip tone={c.studentsBehind > 5 ? "bad" : "warn"}>
                          <AlertIcon aria-hidden />
                          {c.studentsBehind} behind
                        </Chip>
                      ) : (
                        c.studentCount > 0 && <Chip tone="good">Nobody behind</Chip>
                      )}
                      {c.pendingInviteCount > 0 && <Chip>{c.pendingInviteCount} invited</Chip>}
                    </span>
                    <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[13px] text-ink-dim">
                      <span>
                        {c.studentCount === 1 ? "1 student" : `${c.studentCount} students`} · {c.assignmentCount === 1 ? "1 assignment" : `${c.assignmentCount} assignments`}
                      </span>
                      {c.nextDueAt !== null && <span className={due.tone === "bad" ? "text-danger" : due.tone === "warn" ? "text-warn" : ""}>· Next: {due.text.replace(/^Due /, "")}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
