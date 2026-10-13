"use client";

// A student's own grades, and how they were worked out.
//
// Two rules shape this whole component.
//
// The first is that it only ever shows the person reading it. Not "the grades
// for this class" filtered down — their own rows and nothing else, which the
// database enforces on every query whether this file asks nicely or not (see
// the select policy on `grades` in 0005). There is no id in a prop here that
// could be swapped for a classmate's, because there is no id: it reads the
// signed-in user.
//
// The second is that it shows the working. A percentage on its own is a number
// to argue with; a percentage with "tests are 75% of this and you have 88% in
// tests" is one a student can act on, and — the point — one they can check
// against the report card that will eventually arrive. When the weights were
// scaled because they did not add to 100, or because a category has nothing
// marked in it yet, it says that too. An unexplained number is a number this
// app has not earned the right to show.
//
// The what-if calculator follows the same rule: it asks `buildGrades` what a
// pretend mark would do, so its answer can never disagree with the grade
// printed above it.
//
// It reads Supabase directly rather than through the local school store: marks
// are the teacher's, they arrive from the database, and there is nothing about
// them to cache in a browser that a student can edit.
//
// A guest sees nothing at all, from the first frame. A signed-in student sees
// a skeleton the size of the card while it loads, so the class list below does
// not jump down when the grades arrive.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase/browser";
import { accountScope } from "@/store/useAuthStore";
import {
  DatabaseError,
  gradesByAssignment,
  listAssignmentsForStudent,
  listCategoriesForClasses,
  listEnrolledClasses,
  listGradesForStudent,
} from "@/lib/db";
import {
  LETTER_FLOORS,
  buildGrades,
  formatPercent,
  formatPoints,
  letterFor,
  neededScore,
  withHypothetical,
  type GradeSummary,
  type GradedAssignment,
} from "@/lib/school/grades";
import type { GradeCategory } from "@/lib/school/types";
import { Skeleton } from "@/components/ui/primitives";
import { AwardIcon, ChevronDownIcon, CircleAlertIcon, ResetIcon } from "@/components/icons";
import { ClassDot } from "./SchoolKit";

interface ClassGrade {
  classId: string;
  name: string;
  color?: string;
  summary: GradeSummary;
  categories: GradeCategory[];
  items: GradedAssignment[];
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  // "Nothing to show" is a state on its own, and distinct from a failure. A
  // student with no database configured, or signed out, is not a student with
  // no grades — so this renders nothing at all rather than an empty gradebook.
  | { kind: "unavailable" }
  | { kind: "error"; messageKey: "grades.errorDenied" | "grades.errorFetch" }
  | { kind: "ready"; classes: ClassGrade[] };

// Whether this device has a signed-in account. Read from storage on the
// client only; the server, and the hydrating first render, say "no", so the
// two agree and a guest never sees a skeleton at all.
const noop = () => () => {};
function useHasAccount(): boolean {
  return useSyncExternalStore(
    noop,
    () => accountScope() !== "",
    () => false,
  );
}

export function MyGrades({ classId }: { classId?: string } = {}) {
  const { t } = useI18n();
  const hasAccount = useHasAccount();
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    // A guest has no gradebook: nothing to fetch and nothing to show.
    if (!hasAccount) return;
    let cancelled = false;

    (async () => {
      const supabase = await getSupabase();
      if (!supabase) return setState({ kind: "unavailable" });
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return setState({ kind: "unavailable" });

      // Four reads, in two rounds: the classes have to arrive before the
      // categories can be asked for, and everything else is independent.
      const classes = await listEnrolledClasses(supabase, user.id);
      const [assignments, grades, categories] = await Promise.all([
        listAssignmentsForStudent(supabase, user.id),
        listGradesForStudent(supabase, user.id),
        listCategoriesForClasses(
          supabase,
          classes.map((c) => c.id),
        ),
      ]);

      const byAssignment = gradesByAssignment(grades);
      const rows: ClassGrade[] = classes
        .filter((c) => classId === undefined || c.id === classId)
        .map((c) => {
          const mine = categories.filter((cat) => cat.classId === c.id);
          const items = assignments
            .filter((a) => a.assignment.classId === c.id)
            .map((a) => ({
              assignment: a.assignment,
              // `?? null` and never `?? 0`. An assignment nobody has marked
              // is left out of the grade, not counted against them.
              grade: byAssignment.get(a.assignment.id) ?? null,
            }));
          return { classId: c.id, name: c.name, color: c.color, categories: mine, items, summary: buildGrades(items, mine) };
        });

      if (!cancelled) setState({ kind: "ready", classes: rows });
    })().catch((err: unknown) => {
      if (cancelled) return;
      // A denial and a fault read differently to a student, and neither of them
      // reads as "you have no grades".
      const messageKey = err instanceof DatabaseError && err.isDenied ? "grades.errorDenied" : "grades.errorFetch";
      setState({ kind: "error", messageKey });
    });

    return () => {
      cancelled = true;
    };
  }, [classId, hasAccount]);

  if (!hasAccount || state.kind === "unavailable") return null;

  // Signed in and not answered yet: the card's own shape, so nothing below
  // moves when the grades arrive.
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <section aria-busy="true" aria-label={t("grades.title")}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-[92px] w-full rounded-ui-lg" />
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-ui-lg border border-danger bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger">
        <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {t(state.messageKey)}
      </div>
    );
  }

  if (state.classes.length === 0) return null;

  return (
    <section aria-labelledby="my-grades-heading">
      <h2 id="my-grades-heading" className="eyebrow">
        {t("grades.title")}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-faint">{t("grades.privacyNote")}</p>

      <div className={`mt-3 grid gap-3 ${classId === undefined && state.classes.length > 1 ? "md:grid-cols-2" : ""}`}>
        {state.classes.map((row) => (
          <ClassCard key={row.classId} row={row} />
        ))}
      </div>
    </section>
  );
}

function ClassCard({ row }: { row: ClassGrade }) {
  const { t } = useI18n();
  const { summary } = row;
  const [open, setOpen] = useState<"none" | "working" | "whatif">("none");
  const canWhatIf = row.items.some((i) => i.grade === null && (i.assignment.points ?? 0) > 0);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <ClassDot color={row.color} />
          <span className="min-w-0 truncate font-[var(--weight-strong)] text-ink">{row.name}</span>
        </span>

        <span className="text-xl font-[var(--weight-strong)] tabular-nums tracking-tight text-ink">
          {formatPercent(summary.percent)}
          {summary.percent !== null && <span className="ml-1.5 text-sm font-normal text-ink-dim">{letterFor(summary.percent)}</span>}
        </span>
      </div>

      {summary.percent === null ? (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">{t("grades.noneMarked")}</p>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
          {summary.gradedCount === 1 ? t("grades.markedOne") : t("grades.marked", { count: summary.gradedCount })}
          {summary.ungradedCount > 0 && (
            <>
              {" "}
              {summary.ungradedCount === 1 ? t("grades.waitingOne") : t("grades.waiting", { count: summary.ungradedCount })}
            </>
          )}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {summary.percent !== null && (
          <button
            type="button"
            onClick={() => setOpen((v) => (v === "working" ? "none" : "working"))}
            aria-expanded={open === "working"}
            className="tap inline-flex items-center gap-1 rounded-ui-sm text-sm text-ink-dim underline-offset-4 transition-colors hover:text-ink hover:underline md:text-[13px]"
          >
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open === "working" ? "rotate-180" : ""}`} aria-hidden />
            {t(open === "working" ? "grades.hideHowWorkedOut" : "grades.howWorkedOut")}
          </button>
        )}
        {canWhatIf && (
          <button
            type="button"
            onClick={() => setOpen((v) => (v === "whatif" ? "none" : "whatif"))}
            aria-expanded={open === "whatif"}
            className="tap inline-flex items-center gap-1 rounded-ui-sm text-sm text-accent-text underline-offset-4 hover:underline md:text-[13px]"
          >
            <AwardIcon className="h-3.5 w-3.5" aria-hidden />
            {t("grades.whatIf")}
          </button>
        )}
      </div>

      {open === "working" && <Breakdown summary={summary} />}
      {open === "whatif" && <WhatIf row={row} />}
    </div>
  );
}

/**
 * "What do I need on the final?" and "what if I got these?" -- the two
 * questions students ask before a test, answered by the same arithmetic that
 * produced their real grade. Nothing typed here is saved or sent anywhere.
 */
function WhatIf({ row }: { row: ClassGrade }) {
  const { t } = useI18n();
  const ungraded = useMemo(() => row.items.filter((i) => i.grade === null && (i.assignment.points ?? 0) > 0), [row.items]);
  const [pretend, setPretend] = useState<Record<string, number>>({});
  const current = row.summary.percent;
  const defaultTarget = useMemo(() => {
    // The next letter up from where they are, which is the question most
    // students are actually asking.
    const above = [...LETTER_FLOORS].reverse().find((l) => current === null || l.floor > current);
    return above?.letter ?? "A";
  }, [current]);
  const [target, setTarget] = useState(defaultTarget);
  const [focus, setFocus] = useState(ungraded[0]?.assignment.id ?? "");

  const projected = useMemo(() => buildGrades(withHypothetical(row.items, pretend), row.categories).percent, [row.items, row.categories, pretend]);
  const floor = LETTER_FLOORS.find((l) => l.letter === target)?.floor ?? 90;
  const answer = focus ? neededScore(row.items, row.categories, focus, floor, pretend) : null;
  const focusTitle = ungraded.find((i) => i.assignment.id === focus)?.assignment.title ?? "";
  const anyPretend = Object.keys(pretend).length > 0;

  return (
    <div className="mt-3 animate-rise border-t border-line pt-3">
      <p className="text-[13px] leading-relaxed text-ink-dim">{t("grades.whatIfIntro")}</p>

      <div className="mt-3 rounded-ui border border-line bg-surface-0 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <label className="inline-flex items-center gap-2">
            <span>{t("grades.whatIfTo")}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="input h-9 w-auto py-0 pr-8">
              {LETTER_FLOORS.map((l) => (
                <option key={l.letter} value={l.letter}>
                  {l.letter} ({l.floor}%)
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex min-w-0 items-center gap-2">
            <span>{t("grades.whatIfOn")}</span>
            <select value={focus} onChange={(e) => setFocus(e.target.value)} className="input h-9 w-auto max-w-[16rem] truncate py-0 pr-8">
              {ungraded.map((i) => (
                <option key={i.assignment.id} value={i.assignment.id}>
                  {i.assignment.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink" aria-live="polite">
          {answer === null
            ? null
            : answer.kind === "already"
              ? t("grades.whatIfAlready", { letter: target, title: focusTitle })
              : answer.kind === "unreachable"
                ? t("grades.whatIfUnreachable", { letter: target, best: formatPercent(answer.best) })
                : t("grades.whatIfNeeds", {
                    points: formatPoints(answer.points, answer.possible),
                    percent: formatPercent((answer.points / answer.possible) * 100),
                    title: focusTitle,
                    letter: target,
                  })}
        </p>
      </div>

      <div className="mt-3">
        <p className="text-[13px] font-[var(--weight-ui)] text-ink-dim">{t("grades.whatIfTry")}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {ungraded.map((i) => (
            <li key={i.assignment.id} className="flex items-center gap-2">
              <label className="min-w-0 flex-1 truncate text-sm text-ink" htmlFor={`wi-${i.assignment.id}`}>
                {i.assignment.title}
              </label>
              <input
                id={`wi-${i.assignment.id}`}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={pretend[i.assignment.id] ?? ""}
                placeholder="—"
                onChange={(e) =>
                  setPretend((p) => {
                    const next = { ...p };
                    if (e.target.value === "") delete next[i.assignment.id];
                    else next[i.assignment.id] = Math.max(0, Number(e.target.value));
                    return next;
                  })
                }
                className="input h-9 w-20 text-right tabular-nums"
              />
              <span className="w-12 shrink-0 text-xs tabular-nums text-ink-faint">/ {i.assignment.points}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-dim">
            {t("grades.whatIfProjected")}{" "}
            <span className="font-[var(--weight-strong)] tabular-nums text-ink">
              {formatPercent(projected)}
              {projected !== null && ` ${letterFor(projected)}`}
            </span>
          </p>
          {anyPretend && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPretend({})}>
              <ResetIcon aria-hidden />
              {t("grades.whatIfReset")}
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{t("grades.whatIfNote")}</p>
    </div>
  );
}

/**
 * The working: every category, what was earned in it, and the share of the
 * grade it actually carried.
 *
 * `appliedWeight` rather than the weight the teacher typed, because the applied
 * one is the number that produced the grade above. Printing the declared weight
 * next to a grade it did not produce would be the same kind of lie as counting
 * an unmarked assignment as zero.
 */
function Breakdown({ summary }: { summary: GradeSummary }) {
  const { t } = useI18n();

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="scroll-x max-w-full">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-ink-faint">
              <th scope="col" className="py-1 pr-3 text-left font-[var(--weight-ui)]">
                {t(summary.uncategorised ? "grades.colAllWork" : "grades.colCategory")}
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-[var(--weight-ui)]">
                {t("grades.colPoints")}
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-[var(--weight-ui)]">
                {t("grades.colYourPercent")}
              </th>
              <th scope="col" className="py-1 text-right font-[var(--weight-ui)]">
                {t("grades.colShare")}
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((c) => (
              <tr key={c.categoryId ?? c.name} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                  {c.name}
                  {c.skipped && <span className="ml-1.5 text-ink-faint">{t("grades.nothingMarkedYet")}</span>}
                </th>
                <td className="py-1.5 pr-3 text-right tabular-nums text-ink-dim">{c.skipped ? "—" : formatPoints(c.pointsEarned, c.pointsPossible)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-ink-dim">{formatPercent(c.percent)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink-dim">{c.skipped ? "—" : `${c.appliedWeight}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.normalised && !summary.uncategorised && (
        // Said plainly, because a student comparing this to a syllabus that
        // says "75%" deserves to know why the number here is different.
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{t("grades.normalisedNote")}</p>
      )}

      {summary.uncategorised && <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{t("grades.uncategorisedNote")}</p>}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{t("grades.officialNote")}</p>
    </div>
  );
}
