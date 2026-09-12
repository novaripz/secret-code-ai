// The shape the teacher screens need, written down before the data layer exists.
//
// src/lib/db and src/lib/insights are being built in parallel, so this file is
// the contract rather than the implementation: every screen is typed against
// these interfaces, and wiring the real thing up later means writing functions
// that return these shapes instead of rewriting any UI. The names deliberately
// echo supabase/migrations/0001_init.sql (profiles, enrollments, invites,
// assignment_status) so the mapping is obvious and boring.
//
// The one opinionated part is the analytics types. Every signal carries its own
// evidence count and the window it was measured over, because a number a
// teacher cannot interrogate is a number they should not act on. There is
// deliberately no `mastery` or `score` field to fill in: if we do not have the
// evidence for it, we do not get to render it.

import type { Assignment, AssignmentRules } from "@/lib/school/types";

/** A row of `profiles` joined to `enrollments`: someone already in the class. */
export interface RosterStudent {
  id: string;
  displayName: string;
  email: string;
  /** Epoch millis they joined the class. */
  joinedAt: number;
  /** Last time they did anything Panda saw. Null when they never have. */
  lastActiveAt: number | null;
  /** From assignment_status, counted across this class's assignments. */
  done: number;
  doing: number;
  todo: number;
  overdue: number;
}

/** A row of `invites`: an email the teacher added that has no account yet. */
export interface RosterInvite {
  id: string;
  email: string;
  invitedAt: number;
}

export interface TeacherClass {
  id: string;
  name: string;
  /** Free text the teacher sees on their own list: "Period 3". */
  period?: string;
  color?: string;
  studentCount: number;
  pendingInviteCount: number;
  assignmentCount: number;
  /** Soonest upcoming due date across the class, epoch millis. */
  nextDueAt: number | null;
  /** How many students have something overdue right now. */
  studentsBehind: number;
}

/** An assignment plus the rules row that travels with it. */
export interface TeacherAssignment extends Assignment {
  rules: Omit<AssignmentRules, "assignmentId">;
  /** Counts from assignment_status, so the list can show progress at a glance. */
  done: number;
  doing: number;
  todo: number;
}

// ------------------------------------------------------------- learning signal

/**
 * How loud a struggle signal is. Kept as three words rather than a number so
 * the UI can encode it in shape and colour as well as in text — a teacher
 * scanning between classes reads the stripe before they read the sentence.
 */
export type Severity = "watch" | "warning" | "critical";

/**
 * One observed behaviour behind a topic signal.
 *
 * `count` is the whole point. "4 hint requests on factoring this week" is a
 * sentence a teacher can check; "62% mastery" is not.
 */
export interface Evidence {
  kind: "hintRequest" | "repeatedQuestion" | "translation" | "simplification" | "stalled" | "retry";
  count: number;
  /** Plain-language rendering, e.g. "hint requests on factoring". */
  label: string;
}

export interface TopicSignal {
  id: string;
  topic: string;
  /** Which assignment(s) this showed up in, for the teacher to go look at. */
  context: string;
  severity: Severity;
  /** How many distinct students contributed. Aggregate views only. */
  studentCount: number;
  /** Days the evidence was gathered over — a count with no window is meaningless. */
  windowDays: number;
  evidence: Evidence[];
}

export interface ClassAnalytics {
  classId: string;
  windowDays: number;
  /** Students Panda saw at all in the window; the denominator for everything. */
  activeStudents: number;
  totalStudents: number;
  /** Ranked loudest first. */
  topics: TopicSignal[];
  /** Things going well, so the screen is not purely a list of failures. */
  steady: TopicSignal[];
}

export interface StudentAnalytics {
  studentId: string;
  windowDays: number;
  /** Sessions with Panda in the window. Not transcripts — counts only. */
  sessions: number;
  topics: TopicSignal[];
}

/** Total evidence behind a signal, which is what the UI ranks and labels by. */
export function evidenceTotal(signal: TopicSignal): number {
  return signal.evidence.reduce((n, e) => n + e.count, 0);
}
