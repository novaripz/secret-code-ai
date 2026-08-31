"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { CLASS_COLORS, daysUntil, isOverdue, urgencyScore } from "@/lib/school/types";
import { PlusIcon, XIcon } from "@/components/icons";

// Classes, and what is due in each.
//
// The list is ordered by what is most urgent inside each class rather than
// alphabetically, because the question this page answers is "what do I need to
// deal with", not "what am I enrolled in".

function AddClass({ onDone }: { onDone: () => void }) {
  const addClass = useSchoolStore((s) => s.addClass);
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [color, setColor] = useState(CLASS_COLORS[0]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addClass({ name, teacher, color });
    onDone();
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium text-[var(--text)]">{t("classes.add")}</p>
        <button type="button" onClick={onDone} aria-label={t("action.cancel")}
          className="rounded-lg p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)]">
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("classes.name")} aria-label={t("classes.name")}
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
        />
        <input
          value={teacher} onChange={(e) => setTeacher(e.target.value)}
          placeholder={t("classes.teacher")} aria-label={t("classes.teacher")}
          className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {CLASS_COLORS.map((c) => (
          <button
            key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            className={`h-6 w-6 rounded-full transition-transform ${color === c ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface-0)]" : ""}`}
            style={{ background: c }}
          />
        ))}
        <button
          type="submit" disabled={!name.trim()}
          className="ml-auto rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40"
        >
          {t("action.save")}
        </button>
      </div>
    </form>
  );
}

export default function ClassesPage() {
  const { classes, assignments, hydrated, hydrate } = useSchoolStore();
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              {t("classes.title")}
            </h1>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                <PlusIcon className="h-4 w-4" />
                {t("classes.add")}
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-5 animate-rise">
              <AddClass onDone={() => setAdding(false)} />
            </div>
          )}

          {!hydrated ? (
            <p className="text-sm text-[var(--text-faint)]">{t("empty.loading")}</p>
          ) : classes.length === 0 && !adding ? (
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
              <p className="font-medium text-[var(--text)]">{t("classes.none")}</p>
              <p className="mt-1.5 text-sm text-[var(--text-faint)]">{t("classes.noneHint")}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {classes.map((c) => {
                const mine = assignments
                  .filter((a) => a.classId === c.id)
                  .sort((x, y) => urgencyScore(x) - urgencyScore(y));
                const open = mine.filter((a) => a.status !== "done");
                const next = open[0];

                return (
                  <Link
                    key={c.id}
                    href={`/classes/${c.id}`}
                    className="animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4 transition-colors hover:border-[var(--line-strong)]"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "#6aa84f" }} />
                      <span className="min-w-0 truncate font-medium text-[var(--text)]">{c.name}</span>
                    </span>
                    {c.teacher && (
                      <span className="mt-1 block text-xs text-[var(--text-faint)]">{c.teacher}</span>
                    )}

                    <span className="mt-3 block text-sm text-[var(--text-dim)]">
                      {open.length === 0 ? (
                        t("assignments.noneHint")
                      ) : (
                        <>
                          <span className={isOverdue(next) ? "text-[var(--danger)]" : ""}>
                            {next.title}
                          </span>
                          {next.dueAt !== null && (
                            <span className="ml-1.5 text-[var(--text-faint)]">
                              {dueLabel(next.dueAt, t)}
                            </span>
                          )}
                          {open.length > 1 && (
                            <span className="mt-1 block text-xs text-[var(--text-faint)]">
                              +{open.length - 1} more
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** A due date said the way a person would say it. */
export function dueLabel(dueAt: number, t: (k: "assignments.dueToday" | "assignments.dueTomorrow" | "assignments.overdue") => string): string {
  const days = daysUntil(dueAt);
  if (days < 0) return t("assignments.overdue");
  if (days === 0) return t("assignments.dueToday");
  if (days === 1) return t("assignments.dueTomorrow");
  return new Date(dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
