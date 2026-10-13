// Folding the class database into a student's device copy.
//
// The device copy has always been the thing every student screen reads, and it
// still is: it works offline, on a guest laptop and on a deployment with no
// database at all. What changed is that for a signed-in student it is now also
// a cache of what their teachers set, refreshed from the database whenever a
// school page opens. Before, those were two worlds that never met, and a
// student whose teacher had set three assignments saw "No classes yet".
//
// The rule for merging is ownership, decided per row:
//   - Rows with origin "school" belong to the teacher. Each refresh replaces
//     them wholesale, so an assignment the teacher deleted disappears and an
//     edited due date updates. The student never edits these; they can only
//     mark them done, which is written back to the database separately.
//   - Rows without an origin belong to the student, who made them on this
//     device. A refresh never touches them.
//   - The student's own layer (checklists, planned days, progress) is keyed by
//     assignment id and survives a refresh, minus entries for assignments that
//     no longer exist anywhere.
//   - A done/undone the database has not acknowledged yet is laid over the
//     database's answer, so a refresh made while offline cannot undo a tick.

import type { Assignment, AssignmentRules, SchoolClass, SchoolData } from "./types";

export interface RemoteSchool {
  classes: SchoolClass[];
  items: { assignment: Assignment; rules: AssignmentRules }[];
}

function pick<T>(record: Record<string, T>, keep: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(record)) if (keep.has(id)) out[id] = value;
  return out;
}

export function mergeFromSchool(local: SchoolData, remote: RemoteSchool): SchoolData {
  const deviceClasses = local.classes.filter((c) => c.origin !== "school");
  const deviceAssignments = local.assignments.filter((a) => a.origin !== "school");
  const deviceIds = new Set(deviceAssignments.map((a) => a.id));

  // Only what the student's own screens use, so a teacher id or anything else
  // the query happens to return never lands in browser storage.
  const schoolClasses: SchoolClass[] = remote.classes.map((c) => ({
    id: c.id,
    name: c.name,
    teacher: c.teacher,
    color: c.color,
    source: c.source,
    externalId: c.externalId,
    createdAt: c.createdAt,
    origin: "school",
  }));
  const classIds = new Set(schoolClasses.map((c) => c.id));

  const items = remote.items.filter((i) => classIds.has(i.assignment.classId));
  const schoolAssignments: Assignment[] = items.map(({ assignment }) => ({
    ...assignment,
    status: local.pendingStatus[assignment.id] ?? assignment.status,
    origin: "school",
  }));

  const live = new Set([...deviceIds, ...schoolAssignments.map((a) => a.id)]);
  const schoolIds = new Set(schoolAssignments.map((a) => a.id));

  return {
    ...local,
    classes: [...schoolClasses, ...deviceClasses],
    assignments: [...schoolAssignments, ...deviceAssignments],
    rules: [...items.map((i) => i.rules), ...local.rules.filter((r) => deviceIds.has(r.assignmentId))],
    steps: pick(local.steps, live),
    doOn: pick(local.doOn, live),
    pendingStatus: pick(local.pendingStatus, schoolIds),
  };
}
