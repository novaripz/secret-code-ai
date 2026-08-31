// The planner.
//
// Deliberately arithmetic, not a language model. A student asking "what should
// I do tonight" deserves an answer they can check, and every line of the plan
// below can be traced to a due date and a point value they can see for
// themselves. The model is good at explaining a plan; it is not the right tool
// for deciding one, because it cannot be held to the numbers.

import { daysUntil, urgencyScore, type Assignment, type SchoolClass } from "./types";

export interface PlanItem {
  assignment: Assignment;
  className: string;
  minutes: number;
  /** Plain-language reason this sits where it does. */
  why: string;
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

function reason(a: Assignment, now: number): string {
  const bits: string[] = [];

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
  if (a.points !== undefined) bits.push(`worth ${a.points} points`);

  return bits.join(", ");
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
  const open = assignments
    .filter((a) => a.status !== "done")
    .sort((x, y) => urgencyScore(x, now) - urgencyScore(y, now));

  const items: PlanItem[] = [];
  const overflow: Assignment[] = [];
  let left = availableMinutes;

  for (const a of open) {
    const needs = a.estimateMinutes ?? DEFAULT_MINUTES;
    if (needs <= left) {
      items.push({
        assignment: a,
        className: byId.get(a.classId) ?? "",
        minutes: needs,
        why: reason(a, now),
      });
      left -= needs;
    } else if (left >= 15) {
      // Not enough time to finish, but enough to make a real dent. Better than
      // leaving the most urgent thing untouched because it does not fit whole.
      items.push({
        assignment: a,
        className: byId.get(a.classId) ?? "",
        minutes: left,
        why: `${reason(a, now)} — start it, you won't finish tonight`,
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
