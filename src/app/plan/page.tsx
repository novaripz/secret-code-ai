"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useFocusStore } from "@/store/useFocusStore";
import { buildPlan, remainingMinutes } from "@/lib/school/planner";
import { focusedMinutesByAssignment } from "@/lib/school/progress";
import type { Assignment } from "@/lib/school/types";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/Button";
import { BookIcon, CalendarCheckIcon, CalendarDaysIcon, ListTodoIcon, TimerIcon } from "@/components/icons";
import { SchoolHeader, SchoolPage, useNow } from "@/components/home/SchoolKit";
import { SyncNote } from "@/components/home/SyncNote";
import { QuickAdd } from "@/components/home/QuickAdd";
import { FocusPanel, FocusStarter, useFocusHydrated } from "@/components/home/FocusTimer";
import { AllDone, ProgressStrip } from "@/components/home/Progress";
import { CalendarExport } from "@/components/home/CalendarExport";
import { TimePicker, TonightList, WeekView } from "@/components/home/PlanViews";

// "What should I work on tonight?" -- and, since a night is part of a week,
// "what does my week look like?"
//
// The order comes from arithmetic over real due dates and point values, and
// every item carries the reason it sits where it does. Nothing here is
// generated, so nothing here can be confidently wrong.
//
// Two empty states that used to be one: a student with nothing entered yet
// needs to be shown how to add something, and a student who has finished
// everything needs to be told that's a win. The old screen said "All caught
// up" and "Panda needs some assignments" at the same time.

type View = "tonight" | "week";

// Per-viewer conveniences, remembered in this browser only. Wrapped, because
// storage can be blocked and the page must work regardless.
function remembered<T extends string | number>(key: string, fallback: T, valid: (v: string) => boolean): T {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null && valid(v)) return (typeof fallback === "number" ? Number(v) : v) as T;
  } catch {
    // Private window or blocked storage: use the default.
  }
  return fallback;
}
function remember(key: string, value: string | number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Not remembered; nothing else changes.
  }
}

export default function PlanPage() {
  const { t } = useI18n();
  const hydrated = useSchoolStore((s) => s.hydrated);
  const hydrate = useSchoolStore((s) => s.hydrate);
  const assignments = useSchoolStore((s) => s.assignments);
  const classes = useSchoolStore((s) => s.classes);
  const steps = useSchoolStore((s) => s.steps);
  const activity = useSchoolStore((s) => s.activity);
  const focusReady = useFocusHydrated();
  const focusRunning = useFocusStore((s) => s.session !== null);

  const [minutes, setMinutes] = useState(120);
  const [view, setView] = useState<View>("tonight");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Read after mount so the server render and the first client render agree.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser storage once, after hydration */
    setMinutes(remembered("sca:plan:minutes", 120, (v) => Number(v) >= 5 && Number(v) <= 600));
    setView(remembered<View>("sca:plan:view", "tonight", (v) => v === "tonight" || v === "week"));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const focused = useMemo(() => focusedMinutesByAssignment(activity), [activity]);
  const now = useNow();
  const plan = useMemo(() => buildPlan(assignments, classes, minutes, now, { steps, focused }), [assignments, classes, minutes, steps, focused, now]);
  const minutesFor = useCallback((a: Assignment) => remainingMinutes(a, steps[a.id], focused[a.id] ?? 0), [steps, focused]);

  const open = assignments.filter((a) => a.status !== "done");
  const nothingSet = assignments.length === 0;

  const switcher = (
    <div className="segmented" role="group" aria-label={t("plan.viewLabel")}>
      {(["tonight", "week"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => {
            setView(v);
            remember("sca:plan:view", v);
          }}
          className="tap"
        >
          {v === "tonight" ? <TimerIcon aria-hidden /> : <CalendarDaysIcon aria-hidden />}
          {t(v === "tonight" ? "plan.viewTonight" : "plan.viewWeek")}
        </button>
      ))}
    </div>
  );

  return (
    <SchoolPage wide={hydrated && view === "week" && !nothingSet}>
      <SchoolHeader
        icon={<CalendarCheckIcon />}
        title={t("plan.title")}
        description={t("plan.subtitle")}
        actions={
          hydrated && !nothingSet ? (
            <>
              {switcher}
              <CalendarExport className="btn-sm" />
            </>
          ) : undefined
        }
      />
      <div className="mt-3">
        <SyncNote />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {focusReady && focusRunning && <FocusPanel />}

        {!hydrated ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("empty.loading")}>
            <Skeleton className="h-[72px] w-full rounded-ui-lg" />
            <Skeleton className="h-14 w-full rounded-ui-lg" />
            <Skeleton className="h-28 w-full rounded-ui-lg" />
            <Skeleton className="h-28 w-full rounded-ui-lg" />
          </div>
        ) : (
          <>
            {!nothingSet && <ProgressStrip listClear={open.length === 0} />}
            <QuickAdd />

            {nothingSet ? (
              <EmptyState
                icon={<ListTodoIcon />}
                title={t("plan.emptyTitle")}
                description={t("plan.emptyBody")}
                action={
                  <LinkButton href="/classes" variant="secondary" icon={<BookIcon />}>
                    {t("plan.emptyAction")}
                  </LinkButton>
                }
              />
            ) : open.length === 0 ? (
              <AllDone />
            ) : view === "week" ? (
              <section aria-labelledby="week-heading">
                <h2 id="week-heading" className="sr-only">
                  {t("plan.weekLabel")}
                </h2>
                <p className="mb-3 text-sm text-ink-dim">{t("plan.weekHelp")}</p>
                <WeekView assignments={assignments} classes={classes} minutesFor={minutesFor} />
              </section>
            ) : (
              <section aria-labelledby="tonight-heading">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 id="tonight-heading" className="eyebrow">
                    {t("plan.howLong")}
                  </h2>
                </div>
                <TimePicker
                  minutes={minutes}
                  onChange={(m) => {
                    setMinutes(m);
                    remember("sca:plan:minutes", m);
                  }}
                />
                <div className="mt-4">
                  <TonightList plan={plan} classes={classes} />
                </div>
              </section>
            )}

            {focusReady && !focusRunning && (
              <section aria-labelledby="timer-heading" className="flex flex-wrap items-center justify-between gap-3 rounded-ui-lg border border-dashed border-line-strong px-4 py-3">
                <div className="min-w-0">
                  <h2 id="timer-heading" className="text-sm font-[var(--weight-strong)] text-ink">
                    {t("plan.timerTitle")}
                  </h2>
                  <p className="text-[13px] text-ink-dim">{t("plan.timerBody")}</p>
                </div>
                <FocusStarter />
              </section>
            )}
          </>
        )}
      </div>
    </SchoolPage>
  );
}
