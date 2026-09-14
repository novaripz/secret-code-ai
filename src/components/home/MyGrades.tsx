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
// It reads Supabase directly rather than through the local school store: marks
// are the teacher's, they arrive from the database, and there is nothing about
// them to cache in a browser that a student can edit.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/browser";
import {
  DatabaseError,
  gradesByAssignment,
  listAssignmentsForStudent,
  listCategoriesForClasses,
  listEnrolledClasses,
  listGradesForStudent,
} from "@/lib/db";
import { buildGrades, formatPercent, formatPoints, letterFor, type GradeSummary } from "@/lib/school/grades";
import type { GradeCategory } from "@/lib/school/types";

interface ClassGrade {
  classId: string;
  name: string;
  color?: string;
  summary: GradeSummary;
  categories: GradeCategory[];
}

type State =
  | { kind: "loading" }
  // "Nothing to show" is a state on its own, and distinct from a failure. A
  // student with no database configured, or signed out, is not a student with
  // no grades — so this renders nothing at all rather than an empty gradebook.
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "ready"; classes: ClassGrade[] };

export function MyGrades({ classId }: { classId?: string } = {}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
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
        listCategoriesForClasses(supabase, classes.map((c) => c.id)),
      ]);

      const byAssignment = gradesByAssignment(grades);
      const rows: ClassGrade[] = classes
        .filter((c) => classId === undefined || c.id === classId)
        .map((c) => {
          const mine = categories.filter((cat) => cat.classId === c.id);
          return {
            classId: c.id,
            name: c.name,
            color: c.color,
            categories: mine,
            summary: buildGrades(
              assignments
                .filter((a) => a.assignment.classId === c.id)
                .map((a) => ({
                  assignment: a.assignment,
                  // `?? null` and never `?? 0`. An assignment nobody has marked
                  // is left out of the grade, not counted against them.
                  grade: byAssignment.get(a.assignment.id) ?? null,
                })),
              mine,
            ),
          };
        });

      if (!cancelled) setState({ kind: "ready", classes: rows });
    })().catch((err: unknown) => {
      if (cancelled) return;
      // A denial and a fault read differently to a student, and neither of them
      // reads as "you have no grades".
      const message =
        err instanceof DatabaseError && err.isDenied
          ? "Your session may have expired. Signing in again is worth a try."
          : "We couldn't reach the gradebook just now. This is not the same as having no grades.";
      setState({ kind: "error", message });
    });

    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (state.kind === "loading" || state.kind === "unavailable") return null;

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
        style={{ borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}
      >
        {state.message}
      </div>
    );
  }

  if (state.classes.length === 0) return null;

  return (
    <section aria-labelledby="my-grades-heading">
      <h2
        id="my-grades-heading"
        className="text-sm font-medium text-[var(--text)]"
      >
        Your grades
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-faint)]">
        Only yours — nobody else can see them here, and you cannot see anyone else&apos;s. Work your
        teacher hasn&apos;t marked yet is left out rather than counted as zero.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {state.classes.map((row) => (
          <ClassCard key={row.classId} row={row} />
        ))}
      </div>
    </section>
  );
}

function ClassCard({ row }: { row: ClassGrade }) {
  const { summary } = row;
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: row.color ?? "var(--line-strong)" }}
          />
          <span className="min-w-0 truncate font-medium text-[var(--text)]">{row.name}</span>
        </span>

        <span className="text-lg font-semibold tabular-nums text-[var(--text)]">
          {formatPercent(summary.percent)}
          {summary.percent !== null && (
            <span className="ml-1.5 text-sm font-normal text-[var(--text-dim)]">
              {letterFor(summary.percent)}
            </span>
          )}
        </span>
      </div>

      {summary.percent === null ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-faint)]">
          Nothing has been marked in this class yet, so there is no grade to show. That is not a
          zero — it is an empty page.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-faint)]">
            From {summary.gradedCount} marked {summary.gradedCount === 1 ? "piece" : "pieces"} of
            work
            {summary.ungradedCount > 0
              ? `. ${summary.ungradedCount} more ${
                  summary.ungradedCount === 1 ? "is" : "are"
                } waiting to be marked and ${
                  summary.ungradedCount === 1 ? "is" : "are"
                } not counted yet.`
              : "."}
          </p>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2 rounded text-xs text-[var(--text-dim)] underline underline-offset-4 transition-colors hover:text-[var(--text)]"
          >
            {open ? "Hide how this was worked out" : "How was this worked out?"}
          </button>

          {open && <Breakdown summary={summary} />}
        </>
      )}
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
  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-[var(--text-faint)]">
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                {summary.uncategorised ? "All work" : "Category"}
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Points
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Your %
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Share of grade
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((c) => (
              <tr key={c.categoryId ?? c.name} className="border-t border-[var(--line)]">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-[var(--text)]">
                  {c.name}
                  {c.skipped && (
                    <span className="ml-1.5 text-[var(--text-faint)]">nothing marked yet</span>
                  )}
                </th>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--text-dim)]">
                  {c.skipped ? "—" : formatPoints(c.pointsEarned, c.pointsPossible)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--text-dim)]">
                  {formatPercent(c.percent)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--text-dim)]">
                  {c.skipped ? "—" : `${c.appliedWeight}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.normalised && !summary.uncategorised && (
        // Said plainly, because a student comparing this to a syllabus that
        // says "75%" deserves to know why the number here is different.
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
          The shares above are not exactly the percentages on your syllabus. Categories with nothing
          marked yet are left out, and the rest are scaled to add up to 100% while keeping the same
          balance between them — so one marked test does not become your whole grade, and an
          unmarked one does not drag it down.
        </p>
      )}

      {summary.uncategorised && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
          This class has no weighted categories, so your grade is simply the points you earned out
          of the points on the work that has been marked.
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
        This is Panda&apos;s arithmetic on the marks your teacher entered. Your school&apos;s report
        card is the official one; if the two disagree, ask your teacher.
      </p>
    </div>
  );
}
