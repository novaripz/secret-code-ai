"use client";

// The two ways to look at the plan: tonight, and the week.
//
// Tonight is the planner's own answer -- what to do first, how long it gets,
// and why it sits there. The why is the point of the screen, so on a phone it
// is allowed to wrap onto two lines instead of being cut off at the width of
// three words, and the buttons move under the text rather than squeezing it.
//
// The week is the student's own: everything open, on the day they mean to do
// it (or the day it is due, until they say otherwise), with how much each day
// adds up to. Moving a piece of work is a plain select, which works with a
// thumb, a keyboard and a screen reader alike.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { describeReasons, type Plan, type PlanItem, type PlanReason } from "@/lib/school/planner";
import { buildWeek, type WeekEntry } from "@/lib/school/week";
import { addDays, dayKey, startOfDay } from "@/lib/school/due";
import { isOverdue, type Assignment, type SchoolClass } from "@/lib/school/types";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useFocusStore } from "@/store/useFocusStore";
import { FOCUS_PRESETS } from "@/lib/school/focus";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ListTodoIcon, PinIcon, TimerIcon } from "@/components/icons";
import { ClassDot, DueBadge, LiftChip, useNow } from "./SchoolKit";

export const TIME_CHOICES = [30, 60, 90, 120, 180];

const DUE_REASONS = new Set<PlanReason["kind"]>(["overdue", "dueToday", "dueTomorrow", "dueIn", "noDue"]);

function minutesLabel(m: number, t: ReturnType<typeof useI18n>["t"]): string {
  if (m < 60) return t("plan.minutes", { minutes: m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? t("plan.hoursMinutes", { hours: h, minutes: rest }) : t("plan.hours", { hours: h });
}

export function useMinutesLabel() {
  const { t } = useI18n();
  return (m: number) => minutesLabel(m, t);
}

/** "How long have you got?" -- the presets, and a box for anything else. */
export function TimePicker({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const { t } = useI18n();
  const label = useMinutesLabel();
  const custom = !TIME_CHOICES.includes(minutes);
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("plan.howLong")}>
      {TIME_CHOICES.map((m) => (
        <button key={m} type="button" className="chip tap" aria-pressed={minutes === m} onClick={() => onChange(m)}>
          {label(m)}
        </button>
      ))}
      {editing || custom ? (
        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">{t("plan.customTime")}</span>
          <input
            type="number"
            min={5}
            max={600}
            step={5}
            inputMode="numeric"
            defaultValue={custom ? minutes : 45}
            autoFocus={editing}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 5 && v <= 600) onChange(v);
            }}
            className="input h-8 w-20 rounded-full px-3 text-[13px]"
          />
          <span className="text-[13px] text-ink-dim">{t("plan.minShort")}</span>
        </label>
      ) : (
        <button type="button" className="chip tap" onClick={() => setEditing(true)}>
          {t("plan.customTime")}
        </button>
      )}
    </div>
  );
}

function PlanRow({ item, index, color }: { item: PlanItem; index: number; color?: string }) {
  const { t } = useI18n();
  const label = useMinutesLabel();
  const setStatus = useSchoolStore((s) => s.setStatus);
  const startFocus = useFocusStore((s) => s.start);
  const a = item.assignment;
  const late = isOverdue(a);
  // The due date is already the badge above the title; the line under it
  // carries the rest of the reasons rather than saying the date twice.
  const reasons = describeReasons(item.reasons.filter((r) => !DUE_REASONS.has(r.kind)), t);

  return (
    <li className="card animate-rise flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-[var(--weight-strong)] tabular-nums ${
            index === 0 ? "bg-accent text-accent-contrast" : "bg-surface-2 text-ink-dim"
          }`}
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <DueBadge dueAt={a.dueAt} />
            {item.pinned && <LiftChip kind="pinned" />}
            {item.heavy && <LiftChip kind="heavy" />}
          </div>
          <Link
            href={`/classes/${a.classId}/${a.id}`}
            className="mt-1.5 block text-[15px] font-[var(--weight-strong)] leading-snug text-ink underline-offset-4 hover:underline"
          >
            {late && <span className="sr-only">{t("assignments.overdue")}: </span>}
            {a.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-dim">
            <span className="inline-flex items-center gap-1.5 align-middle">
              <ClassDot color={color} className="h-2 w-2" />
              <span className="font-[var(--weight-ui)] text-ink-dim">{item.className}</span>
            </span>
            {reasons && <span className="text-ink-faint"> · {reasons}</span>}
          </p>
          {item.nextStep && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink">
              <ListTodoIcon className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden />
              <span className="truncate">{t("plan.nextStep", { step: item.nextStep })}</span>
            </p>
          )}
          {item.partial && <p className="mt-1 text-[13px] text-warn">{t("plan.partial")}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <span className="badge mr-auto sm:mr-0">{label(item.minutes)}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm tap"
            onClick={() =>
              startFocus({
                kind: "focus",
                minutes: Math.min(item.minutes, FOCUS_PRESETS.focus),
                title: a.title,
                assignmentId: a.id,
                classId: a.classId,
              })
            }
          >
            <TimerIcon aria-hidden />
            {t("plan.startFocus")}
          </button>
          <button type="button" className="btn btn-outline btn-sm tap" onClick={() => setStatus(a.id, "done")}>
            <CheckIcon aria-hidden />
            {t("assignments.markDone")}
          </button>
        </div>
      </div>
    </li>
  );
}

export function TonightList({ plan, classes }: { plan: Plan; classes: SchoolClass[] }) {
  const { t } = useI18n();
  const label = useMinutesLabel();
  const [showOverflow, setShowOverflow] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div>
      <ol className="flex flex-col gap-2.5" aria-label={t("plan.tonight")}>
        {plan.items.map((item, i) => (
          <PlanRow key={item.assignment.id} item={item} index={i} color={classes.find((c) => c.id === item.assignment.classId)?.color} />
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-dim">
        {plan.spare > 0 && <span>{t("plan.spare", { time: label(plan.spare) })}</span>}
        {plan.overflow.length > 0 && (
          <button
            type="button"
            className="tap inline-flex items-center gap-1 font-[var(--weight-ui)] text-ink-dim underline-offset-4 hover:text-ink hover:underline"
            aria-expanded={showOverflow}
            onClick={() => setShowOverflow((v) => !v)}
          >
            {t(plan.overflow.length === 1 ? "plan.overflowOne" : "plan.overflow", { count: plan.overflow.length })}
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${showOverflow ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="tap inline-flex items-center font-[var(--weight-ui)] text-ink-dim underline-offset-4 hover:text-ink hover:underline"
          aria-expanded={showWhy}
          onClick={() => setShowWhy((v) => !v)}
        >
          {t("plan.why")}
        </button>
      </div>

      {showOverflow && plan.overflow.length > 0 && (
        <ul className="mt-2.5 divide-y divide-line rounded-ui-lg border border-dashed border-line-strong">
          {plan.overflow.map((o) => (
            <li key={o.assignment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <Link href={`/classes/${o.assignment.classId}/${o.assignment.id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">
                {o.assignment.title}
              </Link>
              <span className="text-[13px] text-ink-faint">{o.className}</span>
              <DueBadge dueAt={o.assignment.dueAt} />
              <span className="badge">{label(o.minutes)}</span>
            </li>
          ))}
        </ul>
      )}

      {showWhy && (
        <p className="mt-2.5 animate-rise rounded-ui-lg border border-line bg-surface-1 p-4 text-sm leading-relaxed text-ink-dim">
          {plan.items[0] && (
            <>
              {t("plan.whyFirst", { title: plan.items[0].assignment.title, reasons: describeReasons(plan.items[0].reasons, t) })}{" "}
            </>
          )}
          {t("plan.whyRule")}
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- week

type DayChoice = { key: string; label: string };

/**
 * One piece of work in the week.
 *
 * In a day column it is compact, and moving it is two buttons -- a day
 * earlier, a day later -- because a column is too narrow for a menu and
 * "do it a day sooner" is the move a student actually makes. In the lists
 * under the strip (later, undated) there is room for a full day picker.
 */
function WeekCard({
  entry,
  classes,
  days,
  dayIndex,
}: {
  entry: WeekEntry;
  classes: Map<string, SchoolClass>;
  days: DayChoice[];
  /** Which column it is in, or null in the lists below the strip. */
  dayIndex: number | null;
}) {
  const { t } = useI18n();
  const label = useMinutesLabel();
  const setDoOn = useSchoolStore((s) => s.setDoOn);
  const doOn = useSchoolStore((s) => s.doOn[entry.assignment.id]);
  const a = entry.assignment;
  const cls = classes.get(a.classId);
  const dueKey = a.dueAt !== null ? dayKey(a.dueAt) : null;

  // Landing back on its own due day clears the plan rather than storing a
  // choice that says nothing.
  const moveTo = (index: number) => {
    const key = days[index]?.key;
    if (!key) return;
    setDoOn(a.id, key === dueKey ? null : key);
  };

  return (
    <li className="rounded-ui border border-line bg-surface-1 p-2.5 shadow-ui-1">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1 h-3.5 w-1 shrink-0 rounded-full" style={{ background: cls?.color ?? "var(--line-strong)" }} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/classes/${a.classId}/${a.id}`}
            className="line-clamp-3 break-words text-[13px] font-[var(--weight-ui)] leading-snug text-ink hover:underline"
          >
            {a.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {cls?.name ? `${cls.name} · ` : ""}
            {label(entry.minutes)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {entry.overdue ? (
          <span className="badge badge-danger">{t("assignments.overdue")}</span>
        ) : entry.dueThisDay ? (
          <span className="badge badge-warn">{t("plan.weekDue")}</span>
        ) : null}
        {entry.carried && <span className="badge">{t("plan.weekCarried")}</span>}
        {a.teacherPinned && (
          <span className="badge badge-accent px-1.5" title={t("priority.teacherPick")}>
            <PinIcon aria-hidden />
            <span className="sr-only">{t("priority.teacherPick")}</span>
          </span>
        )}
        {dayIndex !== null && (
          <span className="ml-auto flex">
            <button
              type="button"
              className="icon-btn icon-btn-sm tap-pad"
              disabled={dayIndex === 0}
              onClick={() => moveTo(dayIndex - 1)}
              aria-label={dayIndex > 0 ? t("plan.weekEarlier", { title: a.title, day: days[dayIndex - 1].label }) : t("plan.weekMove", { title: a.title })}
              title={dayIndex > 0 ? t("plan.weekEarlier", { title: a.title, day: days[dayIndex - 1].label }) : undefined}
            >
              <ChevronLeftIcon aria-hidden />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-sm tap-pad"
              disabled={dayIndex >= days.length - 1}
              onClick={() => moveTo(dayIndex + 1)}
              aria-label={dayIndex < days.length - 1 ? t("plan.weekLaterTo", { title: a.title, day: days[dayIndex + 1].label }) : t("plan.weekMove", { title: a.title })}
              title={dayIndex < days.length - 1 ? t("plan.weekLaterTo", { title: a.title, day: days[dayIndex + 1].label }) : undefined}
            >
              <ChevronRightIcon aria-hidden />
            </button>
          </span>
        )}
      </div>
      {dayIndex === null && (
        <label className="mt-2 block">
          <span className="sr-only">{t("plan.weekMove", { title: a.title })}</span>
          <select
            value={doOn ?? ""}
            onChange={(e) => setDoOn(a.id, e.target.value || null)}
            className="h-9 w-full rounded-ui-sm border border-line bg-surface-0 px-2 text-xs text-ink-dim"
          >
            <option value="">{a.dueAt === null ? t("plan.weekNoDay") : t("plan.weekOnDueDay")}</option>
            {days.map((d) => (
              <option key={d.key} value={d.key}>
                {t("plan.weekDoOn", { day: d.label })}
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}

export function WeekView({ assignments, classes, minutesFor }: { assignments: Assignment[]; classes: SchoolClass[]; minutesFor: (a: Assignment) => number }) {
  const { t, locale } = useI18n();
  const label = useMinutesLabel();
  const doOn = useSchoolStore((s) => s.doOn);
  const now = useNow();
  const week = useMemo(() => buildWeek(assignments, { now, doOn, minutesFor }), [assignments, doOn, minutesFor, now]);
  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const today = startOfDay(now);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dayNum = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" });
  const choices = Array.from({ length: 7 }, (_, i) => {
    const start = addDays(today, i);
    return { key: dayKey(start), label: i === 0 ? t("plan.today") : i === 1 ? t("plan.tomorrow") : longDay.format(start) };
  });
  const busiest = Math.max(60, ...week.days.map((d) => d.minutes));

  return (
    <div>
      <ol className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-label={t("plan.weekLabel")}>
        {week.days.map((day, i) => (
          <li
            key={day.key}
            className={`flex min-w-0 flex-col rounded-ui-lg border p-2.5 ${
              day.isToday ? "border-accent bg-accent-soft/40" : "border-line bg-surface-0"
            }`}
            aria-label={choices[i].label}
          >
            <div className="flex items-center justify-between gap-2 px-0.5 xl:flex-col xl:items-start xl:gap-0.5">
              <p className="flex items-baseline gap-1.5">
                <span className={`text-[13px] font-[var(--weight-strong)] ${day.isToday ? "text-accent-text" : "text-ink"}`}>
                  {i === 0 ? t("plan.today") : weekday.format(day.start)}
                </span>
                <span className="text-xs text-ink-faint">{dayNum.format(day.start)}</span>
              </p>
              <span className="text-xs tabular-nums text-ink-faint">{day.minutes > 0 ? label(day.minutes) : t("plan.weekFree")}</span>
            </div>
            {/* How full the day is, against the busiest day this week. */}
            <div aria-hidden className="mx-0.5 mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (day.minutes / busiest) * 100)}%` }} />
            </div>
            {day.entries.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-2">
                {day.entries.map((e) => (
                  <WeekCard key={e.assignment.id} entry={e} classes={byId} days={choices} dayIndex={i} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 hidden px-0.5 text-xs text-ink-faint md:block">{t("plan.weekNothing")}</p>
            )}
          </li>
        ))}
      </ol>

      {(week.later.length > 0 || week.undated.length > 0) && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {week.later.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">{t("plan.weekLater")}</h3>
              <ul className="flex flex-col gap-2">
                {week.later.map((e) => (
                  <WeekCard key={e.assignment.id} entry={e} classes={byId} days={choices} dayIndex={null} />
                ))}
              </ul>
            </section>
          )}
          {week.undated.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">{t("plan.weekUndated")}</h3>
              <ul className="flex flex-col gap-2">
                {week.undated.map((e) => (
                  <WeekCard key={e.assignment.id} entry={e} classes={byId} days={choices} dayIndex={null} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
