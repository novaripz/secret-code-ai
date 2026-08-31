"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useI18n } from "@/lib/i18n";
import { buildPlan, explainOrder } from "@/lib/school/planner";
import { isOverdue } from "@/lib/school/types";
import { CheckIcon, PlayIcon } from "@/components/icons";

// "What should I work on tonight?"
//
// The order comes from arithmetic over real due dates and point values, and
// every item carries the reason it sits where it does. Nothing here is
// generated, so nothing here can be confidently wrong.

const CHOICES = [30, 60, 90, 120, 180];

function Focus({ title, minutes, onDone }: { title: string; minutes: number; onDone: () => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-6 text-center">
      <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">{t("focus.goal")}</p>
      <p className="mt-2 text-lg font-medium text-[var(--text)]">{title}</p>
      <p className="mt-5 font-mono text-5xl tabular-nums tracking-tight text-[var(--text)]">
        {mm}:{ss}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          {running ? t("focus.pause") : t("focus.start")}
        </button>
        <button
          onClick={onDone}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
        >
          {t("focus.finish")}
        </button>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const { hydrated, hydrate, assignments, classes, setStatus } = useSchoolStore();
  const { t } = useI18n();
  const [minutes, setMinutes] = useState(120);
  const [focus, setFocus] = useState<{ title: string; minutes: number } | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const plan = useMemo(
    () => buildPlan(assignments, classes, minutes),
    [assignments, classes, minutes],
  );

  const open = assignments.filter((a) => a.status !== "done");

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{t("plan.title")}</h1>

          {!hydrated ? (
            <p className="mt-6 text-sm text-[var(--text-faint)]">{t("empty.loading")}</p>
          ) : open.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
              <p className="font-medium text-[var(--text)]">{t("assignments.noneHint")}</p>
              <p className="mt-1.5 text-sm text-[var(--text-faint)]">{t("plan.noData")}</p>
              <Link href="/classes" className="mt-4 inline-block text-sm text-[var(--text-dim)] underline">
                {t("classes.title")}
              </Link>
            </div>
          ) : focus ? (
            <div className="mt-6 animate-rise">
              <Focus title={focus.title} minutes={focus.minutes} onDone={() => setFocus(null)} />
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm text-[var(--text-dim)]">{t("plan.howLong")}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {CHOICES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMinutes(m)}
                    aria-pressed={minutes === m}
                    className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                      minutes === m
                        ? "border-[var(--text)] bg-[var(--surface-2)] font-medium text-[var(--text)]"
                        : "border-[var(--line)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    {m >= 60 ? `${m / 60}h` : `${m}m`}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                {plan.items.map((item, i) => (
                  <div
                    key={item.assignment.id}
                    className="animate-rise flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-dim)]">
                      {i + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/classes/${item.assignment.classId}/${item.assignment.id}`}
                        className={`block truncate text-sm font-medium ${
                          isOverdue(item.assignment) ? "text-[var(--danger)]" : "text-[var(--text)]"
                        }`}
                      >
                        {item.assignment.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-faint)]">
                        {item.className} · {item.why}
                      </p>
                    </div>

                    <span className="shrink-0 text-xs text-[var(--text-faint)]">
                      {t("plan.minutes", { minutes: item.minutes })}
                    </span>

                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setFocus({ title: item.assignment.title, minutes: item.minutes })}
                        aria-label={t("plan.startFocus")}
                        title={t("plan.startFocus")}
                        className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      >
                        <PlayIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setStatus(item.assignment.id, "done")}
                        aria-label={t("assignments.markDone")}
                        title={t("assignments.markDone")}
                        className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--success)]"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {plan.items.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-faint)]">
                  {plan.spare > 0 && <span>{plan.spare} min spare</span>}
                  {plan.overflow.length > 0 && (
                    <span>{plan.overflow.length} won&apos;t fit tonight</span>
                  )}
                  <button onClick={() => setShowWhy((v) => !v)} className="underline underline-offset-4">
                    {t("plan.why")}
                  </button>
                </div>
              )}

              {showWhy && plan.items.length > 0 && (
                <p className="mt-2.5 animate-rise rounded-xl border border-[var(--line)] bg-[var(--surface-0)] p-3.5 text-sm leading-relaxed text-[var(--text-dim)]">
                  {explainOrder(plan)} Everything after it is ordered the same way: what&apos;s overdue
                  first, then what&apos;s due soonest, then what&apos;s worth the most.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
