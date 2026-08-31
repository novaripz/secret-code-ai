"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { isOverdue, urgencyScore, type Assignment } from "@/lib/school/types";
import { dueLabel } from "../page";
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";

// One class: what is due, and a way in to ask Panda about it.

function AddAssignment({ classId, onDone }: { classId: string; onDone: () => void }) {
  const addAssignment = useSchoolStore((s) => s.addAssignment);
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [points, setPoints] = useState("");
  const [minutes, setMinutes] = useState("");
  const [instructions, setInstructions] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addAssignment({
      classId,
      title,
      instructions,
      // A date input gives a local date; noon avoids the day flipping either
      // way across a timezone boundary.
      dueAt: due ? new Date(`${due}T12:00:00`).getTime() : null,
      points: points ? Number(points) : undefined,
      estimateMinutes: minutes ? Number(minutes) : undefined,
    });
    onDone();
  }

  const field =
    "rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium text-[var(--text)]">{t("assignments.add")}</p>
        <button type="button" onClick={onDone} aria-label={t("action.cancel")}
          className="rounded-lg p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)]">
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it?" aria-label="Assignment title" className={field} />

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-faint)]">Due</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-faint)]">Points</span>
            <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)}
              placeholder="100" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--text-faint)]">Minutes</span>
            <input type="number" min={0} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)}
              placeholder="45" className={field} />
          </label>
        </div>

        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="Paste the instructions here so Panda knows what it asks for (optional)"
          aria-label="Instructions" rows={3} className={`${field} resize-y`} />

        <button type="submit" disabled={!title.trim()}
          className="self-end rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40">
          {t("action.save")}
        </button>
      </div>
    </form>
  );
}

function Row({ a }: { a: Assignment }) {
  const setStatus = useSchoolStore((s) => s.setStatus);
  const removeAssignment = useSchoolStore((s) => s.removeAssignment);
  const { t } = useI18n();
  const done = a.status === "done";

  return (
    <div className="group flex items-start gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
      <button
        onClick={() => setStatus(a.id, done ? "todo" : "done")}
        aria-label={done ? t("assignments.markDone") : t("assignments.done")}
        aria-pressed={done}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          done
            ? "border-[var(--success)] bg-[var(--success)] text-[var(--bg)]"
            : "border-[var(--line-strong)] hover:border-[var(--text-faint)]"
        }`}
      >
        {done && <CheckIcon className="h-3.5 w-3.5" />}
      </button>

      <Link href={`/classes/${a.classId}/${a.id}`} className="min-w-0 flex-1">
        <span className={`block text-sm ${done ? "text-[var(--text-faint)] line-through" : "text-[var(--text)]"}`}>
          {a.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
          {a.dueAt !== null && (
            <span className={isOverdue(a) ? "text-[var(--danger)]" : ""}>{dueLabel(a.dueAt, t)}</span>
          )}
          {a.points !== undefined && <span>{t("assignments.points", { points: a.points })}</span>}
          {a.estimateMinutes !== undefined && <span>~{a.estimateMinutes} min</span>}
        </span>
      </Link>

      <button
        onClick={() => removeAssignment(a.id)}
        aria-label={`Remove ${a.title}`}
        className="rounded p-1 text-[var(--text-faint)] opacity-0 transition-opacity hover:text-[var(--danger)] focus:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hydrated, hydrate, classes, assignments, removeClass } = useSchoolStore();
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const cls = classes.find((c) => c.id === id);
  const mine = assignments.filter((a) => a.classId === id).sort((x, y) => urgencyScore(x) - urgencyScore(y));

  if (!hydrated) {
    return (
      <AppShell>
        <p className="p-8 text-sm text-[var(--text-faint)]">{t("empty.loading")}</p>
      </AppShell>
    );
  }

  if (!cls) {
    return (
      <AppShell>
        <div className="p-8">
          <p className="text-sm text-[var(--text-dim)]">{t("empty.unavailable")}</p>
          <Link href="/classes" className="mt-3 inline-block text-sm underline">
            {t("classes.title")}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <Link href="/classes" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-dim)]">
            ← {t("classes.title")}
          </Link>

          <div className="mt-3 mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-[var(--text)]">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cls.color ?? "#6aa84f" }} />
                <span className="truncate">{cls.name}</span>
              </h1>
              {cls.teacher && <p className="mt-1 text-sm text-[var(--text-faint)]">{cls.teacher}</p>}
            </div>

            <button
              onClick={() => removeClass(cls.id)}
              className="shrink-0 rounded-xl border border-[var(--line-strong)] px-3 py-2 text-xs text-[var(--text-faint)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              Delete class
            </button>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--text)]">{t("assignments.title")}</h2>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {t("assignments.add")}
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-4 animate-rise">
              <AddAssignment classId={cls.id} onDone={() => setAdding(false)} />
            </div>
          )}

          {mine.length === 0 && !adding ? (
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-10 text-center">
              <p className="font-medium text-[var(--text)]">{t("assignments.none")}</p>
              <p className="mt-1.5 text-sm text-[var(--text-faint)]">{t("assignments.noneHint")}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] px-4">
              {mine.map((a) => (
                <Row key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
