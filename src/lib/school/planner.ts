// The planner.
//
// Deliberately arithmetic, not a language model. A student asking "what should
// I do tonight" deserves an answer they can check, and every line of the plan
// below can be traced to a due date and a point value they can see for
// themselves. The model is good at explaining a plan; it is not the right tool
// for deciding one, because it cannot be held to the numbers.
//
// Two things now lift work up the list: a teacher pinning it, and it being
// worth far more than the rest of the class's open work. Both are lifts, not
// overrides. A student who misses something overdue because a shinier thing sat
// on top of it is worse off than one who was never shown the pin at all, so the
// lift is measured in days and clamped so it can never reach past today into
// the overdue pile. Everything it does to the order it also says out loud in
// `why`, because an order a student cannot argue with is not one they can
// trust.
//
// `urgencyScore` in ./types.ts is still what the class pages sort by: one class
// on screen has no cross-class spread to read and no room for a chip. The plan
// is where the lift belongs, because the plan is the thing that claims to know
// what you should do first.

import { daysUntil, type Assignment, type SchoolClass } from "./types";

export interface PlanItem {
  assignment: Assignment;
  className: string;
  minutes: number;
  /** Plain-language reason this sits where it does. */
  why: string;
  /** The teacher marked it. Shown as a chip, not just a colour. */
  pinned: boolean;
  /** Worth well above the rest of the open work in its class. */
  heavy: boolean;
}

export interface Plan {
  items: PlanItem[];
  /** Minutes left over after the plan. */
  spare: number;
  /** Work that did not fit in the time available. */
  overflow: Assignment[];
}

/** Fallback when nobody has said how long something takes. */
const DEFAULT_MINUTES = 30;

// How far up the list each kind of lift may carry something, in days.
//
// Days, not points, because days are the unit the rest of the ordering already
// speaks and a lift expressed in the same unit is one a student can reason
// about: "your teacher pinned this, so Panda treats it as two days sooner". Two
// and one are small on purpose. A pinned essay due Friday should beat an
// unpinned worksheet due Thursday; it should not beat the lab report that was
// due last week.
const PINNED_LIFT_DAYS = 2;
const HEAVY_LIFT_DAYS = 1;

/**
 * How much a point value has to beat its peers before it counts as "worth a
 * lot".
 *
 * There is no honest absolute threshold here. Fifty points is a whole unit test
 * in one class and a warm-up in another, so a hardcoded number would be right
 * for one teacher's grading scheme and quietly wrong for every other. The
 * comparison is against the median of the open work in the *same class*:
 * median rather than mean because one 500-point final would drag a mean up far
 * enough to make everything else look trivial, and the median is the number a
 * student would arrive at themselves by looking down the list.
 */
const HEAVY_MULTIPLE = 2;

/** Below this many scored assignments in a class, there is no spread to read. */
const MIN_PEERS_FOR_HEAVY = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The median open point value per class, for the classes that have enough
 * scored work to have a median worth trusting.
 *
 * Computed over open work only. Comparing tonight's homework against a semester
 * of finished assignments answers a question nobody asked; what a student wants
 * to know is whether this is the big one among the things still on their plate.
 */
export function classPointMedians(open: Assignment[]): Map<string, number> {
  const byClass = new Map<string, number[]>();
  for (const a of open) {
    if (a.points === undefined) continue;
    const list = byClass.get(a.classId);
    if (list) list.push(a.points);
    else byClass.set(a.classId, [a.points]);
  }

  const medians = new Map<string, number>();
  for (const [classId, points] of byClass) {
    if (points.length < MIN_PEERS_FOR_HEAVY) continue;
    const m = median(points);
    if (m > 0) medians.set(classId, m);
  }
  return medians;
}

/** How many times the class median this assignment is worth, or null. */
function pointMultiple(a: Assignment, medians: Map<string, number>): number | null {
  const m = medians.get(a.classId);
  if (m === undefined || a.points === undefined) return null;
  return a.points / m;
}

function isHeavy(a: Assignment, medians: Map<string, number>): boolean {
  const multiple = pointMultiple(a, medians);
  return multiple !== null && multiple >= HEAVY_MULTIPLE;
}

/**
 * Where one assignment sits in the queue. Lower is sooner.
 *
 * The precedence, deliberately, is: overdue, then due date (with the lift
 * applied), then the pin, then what it is worth. Two decisions in that are
 * worth defending.
 *
 * First, the lift is clamped at today. `Math.max(days - lift, 0)` means nothing
 * a teacher pins and nothing worth a fortune can be scored as though it were
 * overdue, so an assignment that is genuinely late always sits above one that
 * is merely important. Late work is the thing that costs a student a grade they
 * cannot get back.
 *
 * Second, everything below the day figure is scaled to stay inside one day
 * (1000 + 500 + 250 < 2000). The pin breaks ties between things due the same
 * day and never silently jumps one; a student comparing two rows due Thursday
 * sees the pinned one first, which is exactly what their teacher meant, and
 * nothing more than that.
 */
export function planScore(
  a: Assignment,
  medians: Map<string, number>,
  now = Date.now(),
): number {
  if (a.status === "done") return Number.MAX_SAFE_INTEGER;

  const days = a.dueAt === null ? 60 : daysUntil(a.dueAt, now);
  const pinned = a.teacherPinned === true;
  const heavy = isHeavy(a, medians);

  const lift = (pinned ? PINNED_LIFT_DAYS : 0) + (heavy ? HEAVY_LIFT_DAYS : 0);
  // Overdue keeps its real, negative day count: nothing lifts past it.
  const effectiveDays = days < 0 ? days : Math.max(days - lift, 0);

  const weight = Math.min(a.points ?? 10, 500);
  return effectiveDays * 2000 - (pinned ? 1000 : 0) - (heavy ? 250 : 0) - weight;
}

/** An assignment with the two facts the UI needs to label it. */
export interface RankedAssignment {
  assignment: Assignment;
  pinned: boolean;
  heavy: boolean;
  /** Plain-language reason this sits where it does. */
  why: string;
}

function reason(a: Assignment, medians: Map<string, number>, now: number): string {
  const bits: string[] = [];

  if (a.teacherPinned === true) bits.push("pinned by your teacher");

  if (a.dueAt !== null) {
    const days = daysUntil(a.dueAt, now);
    if (days < 0) bits.push(`overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`);
    else if (days === 0) bits.push("due today");
    else if (days === 1) bits.push("due tomorrow");
    else bits.push(`due in ${days} days`);
  } else {
    bits.push("no due date");
  }

  if (a.status === "doing") bits.push("already started");

  // The multiple, not the raw number, when there is a spread to compare
  // against: "worth 3x the usual" is a sentence a student can check by looking
  // at the rest of the class. "worth 90 points" on its own is not.
  const multiple = pointMultiple(a, medians);
  if (a.points !== undefined) {
    if (multiple !== null && multiple >= HEAVY_MULTIPLE) {
      const rounded = Math.round(multiple * 10) / 10;
      bits.push(`worth ${a.points} points, ${rounded}x the usual for this class`);
    } else {
      bits.push(`worth ${a.points} points`);
    }
  }

  return bits.join(", ");
}

/**
 * The queue, in the order Panda would work through it, with each item carrying
 * why it is there.
 *
 * Exported because the home screen shows the top of the same queue. One
 * ordering, computed one way, so the strip on the home page and the plan can
 * never disagree with each other in front of a student.
 */
export function rankAssignments(assignments: Assignment[], now = Date.now()): RankedAssignment[] {
  const open = assignments.filter((a) => a.status !== "done");
  const medians = classPointMedians(open);

  return open
    .map((a) => ({
      assignment: a,
      pinned: a.teacherPinned === true,
      heavy: isHeavy(a, medians),
      why: reason(a, medians, now),
    }))
    .sort((x, y) => planScore(x.assignment, medians, now) - planScore(y.assignment, medians, now));
}

/**
 * Fits the most urgent work into the time available.
 *
 * Greedy by urgency rather than clever: a student wants the important thing
 * first, not an optimal packing that buries tomorrow's essay behind three
 * short tasks.
 */
export function buildPlan(
  assignments: Assignment[],
  classes: SchoolClass[],
  availableMinutes: number,
  now = Date.now(),
): Plan {
  const byId = new Map(classes.map((c) => [c.id, c.name]));
  const ranked = rankAssignments(assignments, now);

  const items: PlanItem[] = [];
  const overflow: Assignment[] = [];
  let left = availableMinutes;

  for (const { assignment: a, pinned, heavy, why } of ranked) {
    const needs = a.estimateMinutes ?? DEFAULT_MINUTES;
    if (needs <= left) {
      items.push({
        assignment: a,
        className: byId.get(a.classId) ?? "",
        minutes: needs,
        why,
        pinned,
        heavy,
      });
      left -= needs;
    } else if (left >= 15) {
      // Not enough time to finish, but enough to make a real dent. Better than
      // leaving the most urgent thing untouched because it does not fit whole.
      items.push({
        assignment: a,
        className: byId.get(a.classId) ?? "",
        minutes: left,
        why: `${why} — start it, you won't finish tonight`,
        pinned,
        heavy,
      });
      left = 0;
    } else {
      overflow.push(a);
    }
  }

  return { items, spare: left, overflow };
}

/** One sentence explaining why the first item is first. */
export function explainOrder(plan: Plan): string {
  const first = plan.items[0];
  if (!first) return "";
  return `${first.assignment.title} is first because it's ${first.why}.`;
}
