// The planner.
//
// Deliberately arithmetic, not a language model. A student asking "what should
// I do tonight" deserves an answer they can check, and every line of the plan
// below can be traced to a due date and a point value they can see for
// themselves. The model is good at explaining a plan; it is not the right tool
// for deciding one, because it cannot be held to the numbers.
//
// Two things now lift work up the list: a teacher marking it a priority, and it
// being worth far more than the rest of the class's open work. Both are lifts,
// not overrides. A student who misses something overdue because a shinier
// thing sat on top of it is worse off than one who was never shown the flag at
// all, so the lift is measured in days and clamped so it can never reach past
// today into the overdue pile. Everything it does to the order it also says out
// loud in `reasons`, because an order a student cannot argue with is not one
// they can trust.
//
// The reasons are data, not sentences: `describeReasons` turns them into words
// in the student's own language. They used to be English baked in here, which
// made the plan the one screen that ignored the language picker.
//
// `urgencyScore` in ./types.ts is still what the class pages sort by: one class
// on screen has no cross-class spread to read and no room for a chip. The plan
// is where the lift belongs, because the plan is the thing that claims to know
// what you should do first.

import type { Translate } from "./due";
import { daysUntil, isOverdue, urgencyDays, type Assignment, type SchoolClass, type Subtask } from "./types";

/** Why an item sits where it does, as facts the UI puts into words. */
export type PlanReason =
  | { kind: "pinned" }
  | { kind: "overdue"; days: number }
  | { kind: "dueToday" }
  | { kind: "dueTomorrow" }
  | { kind: "dueIn"; days: number }
  | { kind: "noDue" }
  | { kind: "started" }
  | { kind: "steps"; left: number; total: number }
  | { kind: "points"; points: number; multiple?: number };

export interface PlanItem {
  assignment: Assignment;
  className: string;
  /** Minutes the plan gives it tonight. */
  minutes: number;
  /** Plain-language reasons this sits where it does. */
  reasons: PlanReason[];
  /** The teacher marked it a priority. Shown as a chip, not just a colour. */
  pinned: boolean;
  /** Worth well above the rest of the open work in its class. */
  heavy: boolean;
  /** Not enough time to finish it tonight, but enough to make a real dent. */
  partial: boolean;
  /** The first unticked step of the student's own checklist, when there is one. */
  nextStep?: string;
}

export interface PlanOverflow {
  assignment: Assignment;
  className: string;
  minutes: number;
}

export interface Plan {
  items: PlanItem[];
  /** Minutes left over after the plan. */
  spare: number;
  /** Work that did not fit in the time available, in the order it would come next. */
  overflow: PlanOverflow[];
}

/** What the student has told Panda about their own work, beyond the assignment row. */
export interface PlanContext {
  /** Checklists by assignment id. */
  steps?: Record<string, Subtask[]>;
  /** Minutes already spent in focus sessions, by assignment id. */
  focused?: Record<string, number>;
}

/** Fallback when nobody has said how long something takes. */
export const DEFAULT_MINUTES = 30;

/** The smallest block worth putting on a plan. */
const MIN_BLOCK = 5;

/** Below this, a partial start is not worth sitting down for. */
const MIN_PARTIAL = 15;

// How far up the list each kind of lift may carry something, in days.
//
// Days, not points, because days are the unit the rest of the ordering already
// speaks and a lift expressed in the same unit is one a student can reason
// about: "your teacher made this a priority, so Panda treats it as two days
// sooner". Two and one are small on purpose. A priority essay due Friday
// should beat an ordinary worksheet due Thursday; it should not beat the lab
// report that was due last week.
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
 * applied), then the priority flag, then what it is worth. Two decisions in
 * that are worth defending.
 *
 * First, the lift is clamped at today. `Math.max(days - lift, 0)` means nothing
 * a teacher flags and nothing worth a fortune can be scored as though it were
 * overdue, so an assignment that is genuinely late always sits above one that
 * is merely important. Late work is the thing that costs a student a grade they
 * cannot get back. "Late" includes work whose time has passed earlier today,
 * which `urgencyDays` counts as a day behind.
 *
 * Second, everything below the day figure is scaled to stay inside one day
 * (1000 + 500 + 250 < 2000). The flag breaks ties between things due the same
 * day and never silently jumps one; a student comparing two rows due Thursday
 * sees the priority one first, which is exactly what their teacher meant, and
 * nothing more than that.
 */
export function planScore(a: Assignment, medians: Map<string, number>, now = Date.now()): number {
  if (a.status === "done") return Number.MAX_SAFE_INTEGER;

  const days = urgencyDays(a, now);
  const pinned = a.teacherPinned === true;
  const heavy = isHeavy(a, medians);

  const lift = (pinned ? PINNED_LIFT_DAYS : 0) + (heavy ? HEAVY_LIFT_DAYS : 0);
  // Overdue keeps its real, negative day count: nothing lifts past it.
  const effectiveDays = days < 0 ? days : Math.max(days - lift, 0);

  const weight = Math.min(a.points ?? 10, 500);
  return effectiveDays * 2000 - (pinned ? 1000 : 0) - (heavy ? 250 : 0) - weight;
}

/** An assignment with the facts the UI needs to label it. */
export interface RankedAssignment {
  assignment: Assignment;
  pinned: boolean;
  heavy: boolean;
  /** Plain-language reasons this sits where it does. */
  reasons: PlanReason[];
}

function reasonsFor(a: Assignment, medians: Map<string, number>, now: number, steps?: Subtask[]): PlanReason[] {
  const out: PlanReason[] = [];

  if (a.teacherPinned === true) out.push({ kind: "pinned" });

  if (a.dueAt !== null) {
    const days = daysUntil(a.dueAt, now);
    if (isOverdue(a, now)) out.push({ kind: "overdue", days: Math.max(0, -days) });
    else if (days === 0) out.push({ kind: "dueToday" });
    else if (days === 1) out.push({ kind: "dueTomorrow" });
    else out.push({ kind: "dueIn", days });
  } else {
    out.push({ kind: "noDue" });
  }

  if (steps && steps.length > 0) {
    out.push({ kind: "steps", left: steps.filter((s) => !s.done).length, total: steps.length });
  } else if (a.status === "doing") {
    out.push({ kind: "started" });
  }

  // The multiple, not the raw number, when there is a spread to compare
  // against: "worth 3x the usual" is a sentence a student can check by looking
  // at the rest of the class. "worth 90 points" on its own is not.
  const multiple = pointMultiple(a, medians);
  if (a.points !== undefined) {
    if (multiple !== null && multiple >= HEAVY_MULTIPLE) {
      out.push({ kind: "points", points: a.points, multiple: Math.round(multiple * 10) / 10 });
    } else {
      out.push({ kind: "points", points: a.points });
    }
  }

  return out;
}

/** One reason in the student's language. */
export function describeReason(r: PlanReason, t: Translate): string {
  switch (r.kind) {
    case "pinned":
      return t("plan.reasonPinned");
    case "overdue":
      return r.days === 0
        ? t("plan.reasonOverdueToday")
        : r.days === 1
          ? t("plan.reasonOverdueOne")
          : t("plan.reasonOverdue", { count: r.days });
    case "dueToday":
      return t("plan.reasonDueToday");
    case "dueTomorrow":
      return t("plan.reasonDueTomorrow");
    case "dueIn":
      return t("plan.reasonDueIn", { count: r.days });
    case "noDue":
      return t("plan.reasonNoDue");
    case "started":
      return t("plan.reasonStarted");
    case "steps":
      return t("plan.reasonSteps", { left: r.left, total: r.total });
    case "points":
      return r.multiple !== undefined
        ? t("plan.reasonPointsHeavy", { points: r.points, multiple: r.multiple })
        : t("plan.reasonPoints", { points: r.points });
  }
}

/** All of an item's reasons as one line. */
export function describeReasons(reasons: PlanReason[], t: Translate): string {
  return reasons.map((r) => describeReason(r, t)).join(t("plan.reasonJoin"));
}

/**
 * The queue, in the order Panda would work through it, with each item carrying
 * why it is there.
 *
 * Exported because the home screen shows the top of the same queue. One
 * ordering, computed one way, so the strip on the home page and the plan can
 * never disagree with each other in front of a student.
 */
export function rankAssignments(
  assignments: Assignment[],
  now = Date.now(),
  context: PlanContext = {},
): RankedAssignment[] {
  const open = assignments.filter((a) => a.status !== "done");
  const medians = classPointMedians(open);

  return open
    .map((a) => ({ a, score: planScore(a, medians, now) }))
    .sort((x, y) => x.score - y.score)
    .map(({ a }) => ({
      assignment: a,
      pinned: a.teacherPinned === true,
      heavy: isHeavy(a, medians),
      reasons: reasonsFor(a, medians, now, context.steps?.[a.id]),
    }));
}

function roundUp(minutes: number, step: number): number {
  return Math.ceil(minutes / step) * step;
}

/**
 * How long is left on one assignment, as honestly as Panda can tell.
 *
 * Three sources, best first. A checklist the student wrote is the best: the
 * unticked steps, at the minutes they gave each one (and an even share of the
 * estimate for the steps they gave none). Failing that, time already spent in
 * focus sessions comes off the estimate -- this is what makes "already
 * started" actually shrink the plan, which it used to say and never did. It is
 * floored rather than allowed to reach zero, because an estimate is a guess and
 * "nothing left" is a claim only the student can make, by ticking it done.
 */
export function remainingMinutes(a: Assignment, steps?: Subtask[], focusedMinutes = 0): number {
  const estimate = a.estimateMinutes ?? DEFAULT_MINUTES;

  if (steps && steps.length > 0) {
    const share = estimate / steps.length;
    const left = steps.filter((s) => !s.done).reduce((n, s) => n + (s.minutes ?? share), 0);
    return Math.max(MIN_BLOCK, roundUp(left, MIN_BLOCK));
  }

  if (focusedMinutes > 0) {
    const floor = Math.min(10, estimate);
    return Math.max(MIN_BLOCK, roundUp(Math.max(estimate - focusedMinutes, floor), MIN_BLOCK));
  }

  return Math.max(MIN_BLOCK, estimate);
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
  context: PlanContext = {},
): Plan {
  const byId = new Map(classes.map((c) => [c.id, c.name]));
  const ranked = rankAssignments(assignments, now, context);

  const items: PlanItem[] = [];
  const overflow: PlanOverflow[] = [];
  let left = availableMinutes;

  for (const { assignment: a, pinned, heavy, reasons } of ranked) {
    const steps = context.steps?.[a.id];
    const needs = remainingMinutes(a, steps, context.focused?.[a.id] ?? 0);
    const className = byId.get(a.classId) ?? "";
    const nextStep = steps?.find((s) => !s.done)?.text;

    if (needs <= left) {
      items.push({ assignment: a, className, minutes: needs, reasons, pinned, heavy, partial: false, nextStep });
      left -= needs;
    } else if (left >= MIN_PARTIAL) {
      // Not enough time to finish, but enough to make a real dent. Better than
      // leaving the most urgent thing untouched because it does not fit whole.
      items.push({ assignment: a, className, minutes: left, reasons, pinned, heavy, partial: true, nextStep });
      left = 0;
    } else {
      overflow.push({ assignment: a, className, minutes: needs });
    }
  }

  return { items, spare: left, overflow };
}
