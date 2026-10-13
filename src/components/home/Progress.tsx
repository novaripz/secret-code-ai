"use client";

// Gentle progress: done today, a run of days, focused minutes this week.
//
// Only ever good news or no news. A zero is shown as an invitation rather than
// a score ("first one's the hardest"), a streak is not broken by a day that is
// still going, and nothing here is red. The rules live in
// lib/school/progress.ts; this file only says them nicely.

import { useMemo } from "react";
import { Flame } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { summarizeProgress } from "@/lib/school/progress";
import { useSchoolStore } from "@/store/useSchoolStore";
import { CircleCheckIcon, TimerIcon, TrophyIcon } from "@/components/icons";
import { PandaSitting } from "@/components/Panda";

/**
 * One number. On a phone the three sit side by side as small tiles -- value
 * over label, no icon, no hint -- because three full-width cards would push
 * the plan itself below the fold, and the plan is why the student came.
 */
function Tile({ icon, value, label, hint }: { icon: React.ReactNode; value: React.ReactNode; label: string; hint: string }) {
  return (
    <div className="card flex min-w-0 flex-col px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-ui bg-accent-soft text-accent-text sm:flex [&>svg]:h-[18px] [&>svg]:w-[18px]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
          <span className="text-xl font-[var(--weight-strong)] tabular-nums tracking-tight text-ink">{value}</span>
          <span className="text-xs leading-snug text-ink-dim sm:truncate sm:text-[13px]">{label}</span>
        </p>
        <p className="hidden truncate text-xs text-ink-faint sm:block">{hint}</p>
      </div>
    </div>
  );
}

export function ProgressStrip({ listClear = false }: { listClear?: boolean } = {}) {
  const { t } = useI18n();
  const activity = useSchoolStore((s) => s.activity);
  const p = useMemo(() => summarizeProgress(activity), [activity]);

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-2.5" role="group" aria-label={t("plan.progressLabel")}>
      <Tile
        icon={<CircleCheckIcon aria-hidden />}
        value={p.doneToday}
        label={t("plan.progressDone")}
        hint={p.doneToday === 0 ? t(listClear ? "plan.progressDoneClear" : "plan.progressDoneZero") : p.doneWeek > p.doneToday ? t("plan.progressDoneWeek", { count: p.doneWeek }) : t("plan.progressDoneNice")}
      />
      <Tile
        icon={<Flame aria-hidden="true" strokeWidth={1.85} />}
        value={p.streak}
        label={t(p.streak === 1 ? "plan.progressStreakOne" : "plan.progressStreak")}
        hint={p.streak === 0 ? t("plan.progressStreakZero") : p.activeToday ? t("plan.progressStreakToday") : t("plan.progressStreakKeep")}
      />
      <Tile
        icon={<TimerIcon aria-hidden />}
        value={p.focusMinutesWeek}
        label={t("plan.progressFocus")}
        hint={p.focusMinutesWeek === 0 ? t("plan.progressFocusZero") : t("plan.progressFocusToday", { minutes: p.focusMinutesToday })}
      />
    </div>
  );
}

/** The plan with nothing left on it: a win, said like one. */
export function AllDone() {
  const { t } = useI18n();
  const activity = useSchoolStore((s) => s.activity);
  const p = useMemo(() => summarizeProgress(activity), [activity]);
  return (
    <div className="card relative overflow-hidden px-6 py-10 text-center sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ background: "var(--brand-gradient)" }} />
      <div className="relative flex flex-col items-center">
        <PandaSitting className="h-[120px] w-[96px]" />
        <p className="mt-4 inline-flex items-center gap-2 text-2xl font-[var(--weight-strong)] tracking-tight text-ink">
          <TrophyIcon className="h-6 w-6 text-warn" aria-hidden />
          {t("plan.allDoneTitle")}
        </p>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-dim">
          {p.doneToday > 0 ? t(p.doneToday === 1 ? "plan.allDoneTodayOne" : "plan.allDoneToday", { count: p.doneToday }) : t("plan.allDoneBody")}
          {p.streak > 1 && ` ${t("plan.allDoneStreak", { count: p.streak })}`}
        </p>
      </div>
    </div>
  );
}
