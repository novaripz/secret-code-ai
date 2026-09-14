// Working out a grade, and showing the working.
//
// This is the part of Panda that a student will hold up next to their report
// card. If the two disagree, nothing else in the app matters, so every decision
// here is written down rather than left to the arithmetic.
//
// Pure functions, no dates, no I/O, no React. The inputs are assignments,
// categories and whatever marks exist; the output is a number and the reasoning
// that produced it. That is what makes it testable without a database, and it is
// tested -- see the script referenced in the report for this change.
//
// Three rules, in the order they matter:
//
//   1. **Ungraded work is excluded, not zeroed.** A missing mark is the absence
//      of a `Grade`, and nothing here substitutes a number for it. A student two
//      weeks into a term with one marked quiz has a grade out of that quiz. The
//      alternative -- counting the unmarked homework as 0 -- shows them 4% in
//      September and they never trust the app again. The cost is that the grade
//      is optimistic against work that is genuinely missing, which is why
//      `gradedCount` and `ungradedCount` come back alongside it and the UI says
//      how many pieces of work the number is built from.
//
//   2. **A category with no graded work is skipped, and its weight is
//      redistributed.** Otherwise the first test of the year -- the only marked
//      thing in a 75% category -- would either drag the whole grade to a quarter
//      of itself or be the whole grade. Skipping is the same rule as (1), one
//      level up.
//
//   3. **Weights that do not total 100 are normalised, and we say so.** See
//      below.
//
// On normalisation. A teacher types "Tests 75, Homework 25" and it sums to 100.
// A teacher mid-setup has typed "Tests 75" and it sums to 75. A teacher who
// changed their mind twice has 110. All three have to produce a defensible
// number, and there are only three candidate rules:
//
//   (a) refuse to grade until it sums to 100 -- correct and useless, because the
//       screen goes blank exactly when the teacher is halfway through typing;
//   (b) treat the weights as raw points out of whatever they sum to -- so the
//       teacher with 75 typed in gets a grade that is silently a quarter
//       missing, which is wrong in a way nobody would ever notice;
//   (c) normalise: divide each participating category's weight by the sum of
//       the participating weights, so the shares hold their ratio to each other
//       and add to 100.
//
// (c), always -- which is also, not coincidentally, exactly what rule 2 needs,
// since skipping an empty category leaves the remaining weights summing to
// something other than 100 too. So normalisation is not an error path here; it
// is the ordinary path, and the sum-to-100 case is just the one where it
// changes nothing. The result carries `declaredWeightTotal` and `normalised` so
// the UI can print "your teacher's weights add up to 110%, so these have been
// scaled to fit" instead of a number with no provenance. A guess we do not
// explain is a guess we should not show.

import type { Assignment, Grade, GradeCategory } from "./types";

/** One assignment and the mark on it, which is `null` when nobody has marked it. */
export interface GradedAssignment {
  assignment: Assignment;
  /** Null means ungraded. Not zero. Never coerced. */
  grade: Grade | null;
}

/** What one category contributed, and how. This is the working. */
export interface CategoryBreakdown {
  categoryId: string | null;
  name: string;
  /** The weight the teacher typed, in percentage points. */
  declaredWeight: number;
  /**
   * The weight actually applied after empty categories were dropped and the
   * rest were scaled to sum to 100. Equal to `declaredWeight` only when the
   * teacher's numbers already summed to 100 and every category had work.
   */
  appliedWeight: number;
  pointsEarned: number;
  pointsPossible: number;
  /** `pointsEarned / pointsPossible` as a percentage, or null when nothing counts. */
  percent: number | null;
  gradedCount: number;
  ungradedCount: number;
  /** True when this category has no marked work and so contributed nothing. */
  skipped: boolean;
}

export interface GradeSummary {
  /**
   * The grade, 0-100, or null when there is nothing to compute one from.
   *
   * Null rather than 0 for the same reason a missing `Grade` is null: "no work
   * has been marked yet" is not a bad grade, and a screen that prints 0% at a
   * student in the first week of term is lying to them.
   */
  percent: number | null;
  categories: CategoryBreakdown[];
  /** Total marked pieces of work behind `percent`. The denominator of trust. */
  gradedCount: number;
  /** Assignments with points that nobody has marked. Shown, not counted. */
  ungradedCount: number;
  /** Sum of the weights the teacher typed, across categories that have work. */
  declaredWeightTotal: number;
  /**
   * True when the applied weights differ from the declared ones -- because they
   * did not sum to 100, or because an empty category was dropped. The UI must
   * say so when this is true; see the note at the top of this file.
   */
  normalised: boolean;
  /**
   * True when no categories were involved at all and this is plain points over
   * plain points. The breakdown then has a single entry with a null id.
   */
  uncategorised: boolean;
}

const EMPTY: GradeSummary = {
  percent: null,
  categories: [],
  gradedCount: 0,
  ungradedCount: 0,
  declaredWeightTotal: 0,
  normalised: false,
  uncategorised: false,
};

/**
 * A grade out of everything marked, with the working.
 *
 * `categories` may be empty, in which case this is plain points across all
 * graded work -- the right answer for a teacher who has not set weights up and
 * a much better one than refusing to show a grade.
 *
 * Assignments with no `points` are ignored entirely: an ungraded reading worth
 * nothing cannot move a grade in either direction, and counting it as 0/0 would
 * make the "how many pieces of work" figure meaningless.
 */
export function buildGrades(
  items: readonly GradedAssignment[],
  categories: readonly GradeCategory[],
): GradeSummary {
  // Only work that is worth something can affect a grade. `points` of 0 is a
  // deliberate "this is not marked out of anything" and is excluded with the
  // rest -- dividing by it is the other way to produce a number nobody can
  // defend.
  const scored = items.filter((i) => (i.assignment.points ?? 0) > 0);
  if (scored.length === 0) return EMPTY;

  if (categories.length === 0) {
    return flatSummary(scored);
  }

  const ordered = [...categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  // Uncategorised work is not silently dropped. A teacher who files most things
  // and forgets one would otherwise have a student's grade quietly miss it, and
  // the student would have no way to see that it had. It becomes its own bucket
  // and takes a share like any other, which is visible in the breakdown.
  const buckets: { id: string | null; name: string; weight: number }[] = ordered.map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
  }));
  const loose = scored.filter((i) => !i.assignment.categoryId || !ordered.some((c) => c.id === i.assignment.categoryId));
  if (loose.length > 0) {
    // The weight it gets is the average of the declared ones. There is no right
    // answer here -- the teacher never said -- and an average is the choice that
    // neither buries the work nor lets it dominate. The breakdown names the
    // bucket "Uncategorised" so the teacher can see it and go file things.
    const average = ordered.length > 0 ? sum(ordered.map((c) => c.weight)) / ordered.length : 100;
    buckets.push({ id: null, name: "Uncategorised", weight: average });
  }

  const rows = buckets.map((bucket) => {
    const mine = scored.filter((i) =>
      bucket.id === null
        ? loose.includes(i)
        : i.assignment.categoryId === bucket.id,
    );
    return measure(bucket.id, bucket.name, bucket.weight, mine);
  });

  return combine(rows);
}

/**
 * No categories: percentage of all points earned over all points marked.
 *
 * Not a degraded mode. It is what most teachers mean by "your grade" and it is
 * the same rule as a single category worth everything, which is how it is
 * represented -- one breakdown row, so the UI has exactly one shape to render.
 */
function flatSummary(scored: readonly GradedAssignment[]): GradeSummary {
  const row = measure(null, "All work", 100, scored);
  const summary = combine([row]);
  return { ...summary, uncategorised: true, normalised: false };
}

/** One category's earned/possible, counting only work that has a mark. */
function measure(
  categoryId: string | null,
  name: string,
  declaredWeight: number,
  items: readonly GradedAssignment[],
): CategoryBreakdown {
  let pointsEarned = 0;
  let pointsPossible = 0;
  let gradedCount = 0;
  let ungradedCount = 0;

  for (const item of items) {
    const possible = item.assignment.points ?? 0;
    if (item.grade === null) {
      // The rule this whole file exists for: an unmarked assignment adds
      // nothing to the numerator AND nothing to the denominator. Adding it to
      // the denominator alone is the zeroing bug wearing a different hat.
      ungradedCount += 1;
      continue;
    }
    pointsEarned += item.grade.pointsEarned;
    pointsPossible += possible;
    gradedCount += 1;
  }

  return {
    categoryId,
    name,
    declaredWeight,
    // Filled in by `combine`, which is the only place that can know what the
    // other categories did.
    appliedWeight: 0,
    pointsEarned,
    pointsPossible,
    percent: pointsPossible > 0 ? (pointsEarned / pointsPossible) * 100 : null,
    gradedCount,
    ungradedCount,
    skipped: gradedCount === 0,
  };
}

/** Scale the participating weights to 100 and take the weighted average. */
function combine(rows: CategoryBreakdown[]): GradeSummary {
  const active = rows.filter((r) => !r.skipped && r.percent !== null);
  const declaredWeightTotal = round(sum(active.map((r) => r.declaredWeight)));
  const gradedCount = sum(rows.map((r) => r.gradedCount));
  const ungradedCount = sum(rows.map((r) => r.ungradedCount));

  if (active.length === 0) {
    // Work exists, none of it is marked. A real state at the start of a term,
    // and the honest answer is "not yet", which is what a null percent means.
    return {
      percent: null,
      categories: rows.map((r) => ({ ...r, appliedWeight: 0 })),
      gradedCount,
      ungradedCount,
      declaredWeightTotal,
      normalised: false,
      uncategorised: false,
    };
  }

  // A teacher who set every weight to 0 -- or who has one category, at 0 -- has
  // said nothing about relative importance. Splitting evenly is the only
  // reading of "all the same" available, and it is better than dividing by
  // zero or showing nothing.
  const total = sum(active.map((r) => r.declaredWeight));
  const shares = active.map((r) => (total > 0 ? r.declaredWeight / total : 1 / active.length));

  const percent = sum(active.map((r, i) => (r.percent as number) * shares[i]));

  const appliedById = new Map(active.map((r, i) => [r, round(shares[i] * 100)]));
  const categories = rows.map((r) => ({ ...r, appliedWeight: appliedById.get(r) ?? 0 }));

  // Normalised means "the numbers applied are not the numbers typed", which is
  // true both when the weights did not sum to 100 and when a category was
  // dropped for having no work. Both need the same sentence on screen, so they
  // are the same flag.
  const normalised =
    rows.some((r) => r.skipped) || Math.abs(declaredWeightTotal - 100) > 0.01;

  return {
    percent: round(percent),
    categories,
    gradedCount,
    ungradedCount,
    declaredWeightTotal,
    normalised,
    uncategorised: false,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Two decimal places. Enough to be checkable, not enough to imply precision. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------------- display

/**
 * A letter, US-style, for a percentage.
 *
 * Offered next to the number and never instead of it. Scales differ by school
 * and by teacher, so this is a default rather than a truth; the percentage is
 * the thing a student can check against their report card.
 */
export function letterFor(percent: number): string {
  if (percent >= 93) return "A";
  if (percent >= 90) return "A-";
  if (percent >= 87) return "B+";
  if (percent >= 83) return "B";
  if (percent >= 80) return "B-";
  if (percent >= 77) return "C+";
  if (percent >= 73) return "C";
  if (percent >= 70) return "C-";
  if (percent >= 67) return "D+";
  if (percent >= 60) return "D";
  return "F";
}

/** "87.5%" — trailing zeros dropped, because 87.00% reads as false precision. */
export function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  return `${Number(percent.toFixed(1))}%`;
}

/** "18/20". Same trimming, so a half mark shows and a whole one does not. */
export function formatPoints(earned: number, possible: number): string {
  return `${Number(earned.toFixed(2))}/${Number(possible.toFixed(2))}`;
}
