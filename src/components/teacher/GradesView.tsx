"use client";

// The gradebook: what the categories are worth, what everyone scored, and how
// those two produce a grade.
//
// One screen rather than three, because they are one job. A teacher setting
// "Tests 75%" wants to see immediately what that did to the class average, and
// a teacher entering marks wants the weights in front of them while they do it.
//
// The grid is the part that decides whether this gets used twice. A teacher
// marks thirty papers in a sitting, and every modal, every mouse trip back to a
// "save" button, every confirmation is a reason to go back to the spreadsheet
// they already have. So: every cell is an input, Enter moves down the column to
// the next student, the arrow keys move in all four directions, and a write
// leaves on blur without asking. Nothing is saved twice; nothing needs a click.
//
// The rule that runs through every number here is the one from
// src/lib/school/grades.ts — an empty box means ungraded, which is not a zero.
// Clearing a box deletes the mark. Typing 0 records a zero. They are different
// keystrokes because they are different facts, and the legend under the grid
// says so out loud rather than hoping it is obvious.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTeacherStore } from "./store";
import { useDialog } from "@/components/ui/Dialog";
import { gradeKey } from "@/lib/db";
import { buildGrades, formatPercent, letterFor, type GradedAssignment } from "@/lib/school/grades";
import type { Grade, GradeCategory } from "@/lib/school/types";
import {
  ActionErrorNote,
  Chip,
  LoadNote,
  Scroller,
  SectionHeading,
  buttonClass,
  cardClass,
  fieldClass,
  labelClass,

} from "./primitives";

export function GradesView({ classId }: { classId: string }) {
  const loadGradebook = useTeacherStore((s) => s.loadGradebook);
  const state = useTeacherStore((s) => s.gradebookState[classId]) ?? {
    loading: false,
    error: null,
    loaded: false,
  };
  const actionError = useTeacherStore((s) => s.actionError);
  const clearActionError = useTeacherStore((s) => s.clearActionError);

  useEffect(() => {
    void loadGradebook(classId);
  }, [classId, loadGradebook]);

  return (
    <>
      <LoadNote state={state} what="the gradebook" onRetry={() => void loadGradebook(classId)} />
      <ActionErrorNote error={actionError} onDismiss={clearActionError} />
      {state.loaded && (
        <>
          <CategoryPanel classId={classId} />
          <div className="mt-8">
            <GradeGrid classId={classId} />
          </div>
          <div className="mt-8">
            <ClassSummary classId={classId} />
          </div>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ weights

/**
 * Add, rename, reweight, reorder, delete.
 *
 * The total is shown live and a total other than 100 is *warned about, never
 * blocked*. A teacher mid-way through typing "Tests 75" has a total of 75, and
 * a form that refuses to save until the sum is right is a form they cannot use
 * at all. The warning says what the app will actually do with the numbers as
 * they stand, which is the only version of this message worth printing.
 */
function CategoryPanel({ classId }: { classId: string }) {
  const categories = useTeacherStore((s) => s.categories[classId] ?? []);
  const addCategory = useTeacherStore((s) => s.addCategory);
  const editCategory = useTeacherStore((s) => s.editCategory);
  const removeCategory = useTeacherStore((s) => s.removeCategory);
  const moveCategory = useTeacherStore((s) => s.moveCategory);
  const dialog = useDialog();

  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const total = categories.reduce((n, c) => n + c.weight, 0);
  const off = categories.length > 0 && Math.abs(total - 100) > 0.01;

  async function confirmRemove(category: GradeCategory) {
    const ok = await dialog.confirm({
      title: `Delete "${category.name}"?`,
      description:
        "The assignments filed under it keep their marks and become uncategorised. Only the weighting is lost.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) await removeCategory(classId, category.id);
  }

  return (
    <section>
      <SectionHeading
        title="Categories and weights"
        sub="What each kind of work is worth. Tests 75, homework 25 — whatever your syllabus says."
      />

      {categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm leading-relaxed text-[var(--text-faint)]">
          No categories yet. Grades are worked out as plain points across everything you have
          marked, which is right for a lot of classes. Add categories when you want tests to count
          for more than homework.
        </p>
      ) : (
        <div className={`${cardClass} divide-y divide-[var(--line)]`}>
          {categories.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 p-3">
              <input
                value={c.name}
                aria-label={`${c.name} name`}
                onChange={(e) => void editCategory(classId, c.id, { name: e.target.value })}
                className={`${fieldClass} min-w-0 flex-1 sm:max-w-xs`}
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  inputMode="decimal"
                  value={String(c.weight)}
                  aria-label={`${c.name} weight, percent`}
                  onChange={(e) =>
                    void editCategory(classId, c.id, { weight: Number(e.target.value) || 0 })
                  }
                  className={`${fieldClass} w-24 tabular-nums`}
                />
                <span className="text-sm text-[var(--text-faint)]">%</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => void moveCategory(classId, c.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${c.name} up`}
                  className="tap inline-flex items-center rounded-lg border border-[var(--line-strong)] px-2 py-1.5 text-sm md:text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  onClick={() => void moveCategory(classId, c.id, 1)}
                  disabled={i === categories.length - 1}
                  aria-label={`Move ${c.name} down`}
                  className="tap inline-flex items-center rounded-lg border border-[var(--line-strong)] px-2 py-1.5 text-sm md:text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  onClick={() => void confirmRemove(c)}
                  aria-label={`Delete ${c.name}`}
                  className="tap inline-flex items-center rounded-lg border border-[var(--line-strong)] px-2.5 py-1.5 text-sm md:text-xs text-[var(--text-faint)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm text-[var(--text-dim)]">Total</span>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: off ? "var(--warn)" : "var(--success)" }}
            >
              {Number(total.toFixed(2))}%
            </span>
          </div>
        </div>
      )}

      {off && (
        // Warned, not blocked — and told exactly what happens instead, because
        // "these don't add up to 100" without a consequence is a scold.
        <p
          role="status"
          className="mt-3 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed"
          style={{ borderColor: "var(--warn)", background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          Your weights add up to {Number(total.toFixed(2))}%, not 100%. Nothing is broken and you can
          leave it: grades are worked out by scaling these so they add to 100, keeping the same
          ratio between them. Students are told that this happened.
        </p>
      )}

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void addCategory(classId, name, Number(weight) || 0);
          setName("");
          setWeight("");
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
          <span className={labelClass}>New category</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tests"
            className={fieldClass}
          />
        </label>
        <label className="flex w-28 flex-col gap-1.5">
          <span className={labelClass}>Weight %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="75"
            className={`${fieldClass} tabular-nums`}
          />
        </label>
        <button type="submit" disabled={!name.trim()} className={buttonClass}>
          Add
        </button>
      </form>
    </section>
  );
}

// --------------------------------------------------------------------- grid

/**
 * The roster down the side, the assignments across the top, one input per cell.
 *
 * Why a grid and not a page per assignment: a teacher marks a stack of papers
 * in one sitting and then wants to see who is missing three things, and both of
 * those are the same two-dimensional view. The trade is that it is wide, so it
 * lives in its own horizontal scroller with the name column pinned — the page
 * itself never slides sideways, which is the rule on every screen here.
 */
function GradeGrid({ classId }: { classId: string }) {
  const roster = useTeacherStore((s) => s.roster[classId] ?? []);
  const assignments = useTeacherStore((s) => s.assignments[classId] ?? []);
  const categories = useTeacherStore((s) => s.categories[classId] ?? []);
  const grades = useTeacherStore((s) => s.grades[classId]);
  const saveGrade = useTeacherStore((s) => s.saveGrade);

  // Only work worth points can be marked. An assignment with no point value is
  // a reading or a reminder; giving it a column would be inviting a mark that
  // cannot count for anything.
  const columns = useMemo(
    () =>
      assignments
        .filter((a) => (a.points ?? 0) > 0)
        .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)),
    [assignments],
  );

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const cells = useRef(new Map<string, HTMLInputElement>());

  /**
   * Keyboard movement. Enter goes down, because a teacher works a column of
   * papers for one assignment; the arrows go where they say. The browser's own
   * Tab order (across the row) is left alone rather than hijacked — overriding
   * Tab breaks getting out of the grid, and a teacher who wants to move across
   * already has a key that does it.
   */
  function move(row: number, col: number, dRow: number, dCol: number) {
    const nextRow = Math.min(Math.max(row + dRow, 0), roster.length - 1);
    const nextCol = Math.min(Math.max(col + dCol, 0), columns.length - 1);
    const el = cells.current.get(`${nextRow}:${nextCol}`);
    if (el) {
      el.focus();
      el.select();
    }
  }

  if (roster.length === 0 || columns.length === 0) {
    return (
      <section>
        <SectionHeading title="Grades" />
        <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-sm leading-relaxed text-[var(--text-faint)]">
          {roster.length === 0
            ? "Nobody is in this class yet. Add students on the Roster tab and they will appear here."
            : "No assignment in this class is worth any points yet. Give one a point value and a column appears."}
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeading
        title="Grades"
        sub="Type a score and press Enter to drop to the next student. Saves as you go."
      />

      <Scroller>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Scores for every student on every graded assignment in this class
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[9rem] border-b border-[var(--line)] bg-[var(--surface-0)] px-3 py-2 text-left text-xs font-medium text-[var(--text-dim)]"
              >
                Student
              </th>
              {columns.map((a) => (
                <th
                  key={a.id}
                  scope="col"
                  className="min-w-[7rem] border-b border-[var(--line)] px-2 py-2 text-left align-bottom"
                >
                  <Link
                    href={`/teacher/classes/${classId}/assignments/${a.id}`}
                    className="block truncate text-sm md:text-xs font-medium text-[var(--text)] underline-offset-4 hover:underline"
                    title={a.title}
                  >
                    {a.title}
                  </Link>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--text-faint)]">
                    out of {a.points}
                    {a.categoryId && categoryName.has(a.categoryId)
                      ? ` · ${categoryName.get(a.categoryId)}`
                      : ""}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="min-w-[5.5rem] border-b border-[var(--line)] px-2 py-2 text-right text-xs font-medium text-[var(--text-dim)]"
              >
                Grade
              </th>
            </tr>
          </thead>

          <tbody>
            {roster.map((student, row) => {
              const items: GradedAssignment[] = columns.map((a) => ({
                assignment: a,
                grade: grades?.get(gradeKey(a.id, student.id)) ?? null,
              }));
              const summary = buildGrades(items, categories);

              return (
                <tr key={student.id} className="border-b border-[var(--line)] last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[12rem] truncate bg-[var(--surface-0)] px-3 py-1.5 text-left text-sm font-normal text-[var(--text)]"
                  >
                    <Link
                      href={`/teacher/classes/${classId}/students/${student.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {student.displayName}
                    </Link>
                  </th>

                  {columns.map((a, col) => {
                    const grade = grades?.get(gradeKey(a.id, student.id)) ?? null;
                    return (
                      <td key={a.id} className="px-2 py-1.5">
                        <GradeCell
                          grade={grade}
                          possible={a.points ?? 0}
                          label={`${student.displayName}, ${a.title}`}
                          register={(el) => {
                            if (el) cells.current.set(`${row}:${col}`, el);
                            else cells.current.delete(`${row}:${col}`);
                          }}
                          onMove={(dRow, dCol) => move(row, col, dRow, dCol)}
                          onSave={(points) => void saveGrade(classId, a.id, student.id, points)}
                        />
                      </td>
                    );
                  })}

                  <td className="px-2 py-1.5 text-right">
                    <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                      {formatPercent(summary.percent)}
                    </span>
                    {summary.percent !== null && (
                      <span className="ml-1.5 text-xs text-[var(--text-faint)]">
                        {letterFor(summary.percent)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Scroller>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
        An empty box means not marked yet, and is left out of the grade entirely — it is not a
        zero. To record a zero, type <span className="font-medium text-[var(--text-dim)]">0</span>.
        To undo a mark, clear the box. Enter or ↓ moves to the next student, ↑ back, ← and → across.
      </p>
    </section>
  );
}

/**
 * One cell. Local while it is being typed in, saved when focus leaves it.
 *
 * The local copy exists because a controlled input driven straight off the
 * store would fight the teacher mid-keystroke — "1" on the way to "18" is a
 * write, and a rollback of it would move the cursor. Blur is the commit, and
 * Enter blurs on the way to the next row.
 *
 * An empty string is a first-class value here: it means "no mark", it is what
 * clearing the box produces, and it saves as a delete rather than a 0.
 */
function GradeCell({
  grade,
  possible,
  label,
  register,
  onMove,
  onSave,
}: {
  grade: Grade | null;
  possible: number;
  label: string;
  register: (el: HTMLInputElement | null) => void;
  onMove: (dRow: number, dCol: number) => void;
  onSave: (points: number | null) => void;
}) {
  const stored = grade === null ? "" : String(grade.pointsEarned);
  const [text, setText] = useState(stored);
  const [focused, setFocused] = useState(false);

  // While the teacher is not in this box, the store is the truth — so an
  // optimistic write that failed and rolled back shows up here rather than
  // leaving a number on screen that is not in the database.
  const value = focused ? text : stored;

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === stored.trim()) return;
    if (trimmed === "") {
      onSave(null);
      return;
    }
    const points = Number(trimmed);
    if (!Number.isFinite(points) || points < 0) {
      // Not a number, or negative. Put the stored value back rather than
      // saving something nobody meant; the box is the wrong place for an error
      // message that would push the whole grid around.
      setText(stored);
      return;
    }
    onSave(points);
  }

  // Over the point value is not an error — extra credit is real — but it is
  // worth showing, because it is also what a typo looks like.
  const over = value !== "" && Number(value) > possible;

  return (
    <input
      ref={register}
      value={value}
      inputMode="decimal"
      aria-label={`${label}, out of ${possible}`}
      onFocus={(e) => {
        setText(stored);
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          commit(text);
          onMove(e.key === "Enter" ? 1 : 1, 0);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          commit(text);
          onMove(-1, 0);
        } else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
          // Only when the caret is already at the edge, so the arrows still
          // move within a number the teacher is correcting.
          e.preventDefault();
          commit(text);
          onMove(0, -1);
        } else if (
          e.key === "ArrowRight" &&
          e.currentTarget.selectionStart === e.currentTarget.value.length
        ) {
          e.preventDefault();
          commit(text);
          onMove(0, 1);
        } else if (e.key === "Escape") {
          setText(stored);
          e.currentTarget.blur();
        }
      }}
      placeholder="—"
      // A grade cell is the one control a teacher hits hundreds of times in
      // a row, so it gets the 44px floor even though the grid around it stays
      // a desktop shape. The row grows; the grid still scrolls sideways in its
      // own container, which is what keeps the page itself from doing so.
      className="tap inline-flex items-center w-20 rounded-lg border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1.5 text-sm tabular-nums text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]"
      style={over ? { borderColor: "var(--warn)" } : undefined}
    />
  );
}

// ----------------------------------------------------------------- summaries

/**
 * The class as a whole, and every student in it.
 *
 * The class average is the mean of the students' grades, not the class's total
 * points over its total possible. They differ whenever people have different
 * amounts marked, and the first is the one that answers "how is this class
 * doing" — it gives each person one vote.
 */
function ClassSummary({ classId }: { classId: string }) {
  const roster = useTeacherStore((s) => s.roster[classId] ?? []);
  const assignments = useTeacherStore((s) => s.assignments[classId] ?? []);
  const categories = useTeacherStore((s) => s.categories[classId] ?? []);
  const grades = useTeacherStore((s) => s.grades[classId]);

  const rows = useMemo(
    () =>
      roster.map((student) => ({
        student,
        summary: buildGrades(
          assignments.map((a) => ({
            assignment: a,
            grade: grades?.get(gradeKey(a.id, student.id)) ?? null,
          })),
          categories,
        ),
      })),
    [roster, assignments, categories, grades],
  );

  const withGrades = rows.filter((r) => r.summary.percent !== null);
  const average =
    withGrades.length === 0
      ? null
      : withGrades.reduce((n, r) => n + (r.summary.percent as number), 0) / withGrades.length;

  if (roster.length === 0) return null;

  return (
    <section>
      <SectionHeading
        title="Where everyone stands"
        sub="Built only from work that has been marked. Nothing unmarked is counted as a zero."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip>
          Class average {formatPercent(average === null ? null : Math.round(average * 100) / 100)}
        </Chip>
        <Chip tone="neutral">
          {withGrades.length} of {roster.length} with a grade so far
        </Chip>
      </div>

      <div className={`${cardClass} divide-y divide-[var(--line)]`}>
        {rows.map(({ student, summary }) => (
          <div key={student.id} className="p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/teacher/classes/${classId}/students/${student.id}`}
                className="min-w-0 truncate text-sm font-medium text-[var(--text)] underline-offset-4 hover:underline"
              >
                {student.displayName}
              </Link>
              <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                {formatPercent(summary.percent)}
                {summary.percent !== null && (
                  <span className="ml-1.5 text-xs font-normal text-[var(--text-faint)]">
                    {letterFor(summary.percent)}
                  </span>
                )}
              </span>
            </div>

            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
              {summary.gradedCount === 0
                ? "Nothing marked yet, so there is no grade to show — which is not the same as a zero."
                : `From ${summary.gradedCount} marked ${
                    summary.gradedCount === 1 ? "piece" : "pieces"
                  } of work${
                    summary.ungradedCount > 0
                      ? `, with ${summary.ungradedCount} still unmarked and left out`
                      : ""
                  }.`}
            </p>

            {summary.percent !== null && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {summary.categories
                  .filter((c) => !c.skipped)
                  .map((c) => (
                    <Chip key={c.categoryId ?? c.name}>
                      {c.name} {formatPercent(c.percent)} · {c.appliedWeight}% of the grade
                    </Chip>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
        Students see their own grade and this same breakdown, and nobody else&apos;s — the database
        refuses a request for a classmate&apos;s marks, not just this screen.
      </p>
    </section>
  );
}

