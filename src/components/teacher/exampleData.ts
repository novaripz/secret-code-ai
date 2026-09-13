// Example data, clearly marked as such, so every teacher screen renders the way
// it will look in March rather than the way it looks on day one.
//
// An empty dashboard hides every design mistake: you cannot tell whether a
// ranked list ranks well until something is in it, and you cannot tell whether
// a roster row survives a long name until a long name is in it. This file is
// therefore the fixture, not a fallback — when src/lib/db and src/lib/insights
// land, `useTeacherData` swaps its source and nothing in the components moves.
//
// The analytics fixtures that used to live at the bottom of this file are gone:
// the teacher screens read `struggle_signals` now, and inventing "3 hint
// requests on difference of squares" next to a real sixteen-year-old's name is
// the one thing those screens must never do. What is left describes classes,
// rosters and assignments only.
//
// Everything here is invented. The names are ordinary-but-varied on purpose:
// this app is for multilingual students and a roster that is all Smiths would
// let a layout bug through.

import type { RosterInvite, RosterStudent, TeacherAssignment, TeacherClass } from "./types";

const DAY = 86_400_000;
/** Anchored to a fixed point so server and client render the same string. */
const NOW = Date.UTC(2026, 8, 12, 15, 0, 0);

export const EXAMPLE_NOW = NOW;

export const exampleClasses: TeacherClass[] = [
  {
    id: "c-alg2",
    name: "Algebra II",
    period: "Period 2 · Room 114",
    color: "#4a90d9",
    studentCount: 27,
    pendingInviteCount: 3,
    assignmentCount: 9,
    nextDueAt: NOW + 2 * DAY,
    studentsBehind: 6,
  },
  {
    id: "c-bio",
    name: "Biology",
    period: "Period 4 · Lab B",
    color: "#6aa84f",
    studentCount: 24,
    pendingInviteCount: 0,
    assignmentCount: 6,
    nextDueAt: NOW + 5 * DAY,
    studentsBehind: 1,
  },
  {
    id: "c-ush",
    name: "US History",
    period: "Period 6 · Room 210",
    color: "#c9793e",
    studentCount: 31,
    pendingInviteCount: 1,
    assignmentCount: 4,
    nextDueAt: NOW - 1 * DAY,
    studentsBehind: 11,
  },
];

export const exampleRoster: Record<string, RosterStudent[]> = {
  "c-alg2": [
    { id: "s-1", displayName: "Amara Okonkwo", email: "amara.okonkwo@school.edu", joinedAt: NOW - 40 * DAY, lastActiveAt: NOW - 2 * 3_600_000, done: 7, doing: 1, todo: 1, overdue: 0 },
    { id: "s-2", displayName: "Diego Marín-Estrada", email: "diego.marin@school.edu", joinedAt: NOW - 40 * DAY, lastActiveAt: NOW - 26 * 3_600_000, done: 4, doing: 2, todo: 3, overdue: 2 },
    { id: "s-3", displayName: "Mei-Ling Chen", email: "meiling.chen@school.edu", joinedAt: NOW - 38 * DAY, lastActiveAt: NOW - 5 * 3_600_000, done: 8, doing: 0, todo: 1, overdue: 0 },
    { id: "s-4", displayName: "Yusuf Rahmani", email: "yusuf.rahmani@school.edu", joinedAt: NOW - 31 * DAY, lastActiveAt: NOW - 9 * DAY, done: 2, doing: 1, todo: 6, overdue: 4 },
    { id: "s-5", displayName: "Priya Venkataraman", email: "priya.v@school.edu", joinedAt: NOW - 31 * DAY, lastActiveAt: NOW - 30 * 60_000, done: 6, doing: 2, todo: 1, overdue: 1 },
    { id: "s-6", displayName: "Jonah Feldman", email: "jonah.feldman@school.edu", joinedAt: NOW - 12 * DAY, lastActiveAt: null, done: 0, doing: 0, todo: 9, overdue: 3 },
  ],
  "c-bio": [
    { id: "s-7", displayName: "Sofia Petrova", email: "sofia.petrova@school.edu", joinedAt: NOW - 44 * DAY, lastActiveAt: NOW - 4 * 3_600_000, done: 5, doing: 1, todo: 0, overdue: 0 },
    { id: "s-8", displayName: "Kwame Asante", email: "kwame.asante@school.edu", joinedAt: NOW - 44 * DAY, lastActiveAt: NOW - 2 * DAY, done: 4, doing: 0, todo: 2, overdue: 1 },
  ],
  "c-ush": [
    { id: "s-9", displayName: "Isabela Nascimento", email: "isabela.n@school.edu", joinedAt: NOW - 20 * DAY, lastActiveAt: NOW - 3 * 3_600_000, done: 3, doing: 1, todo: 0, overdue: 0 },
    { id: "s-10", displayName: "Tran Minh Khoa", email: "khoa.tran@school.edu", joinedAt: NOW - 20 * DAY, lastActiveAt: NOW - 6 * DAY, done: 1, doing: 0, todo: 3, overdue: 2 },
  ],
};

export const exampleInvites: Record<string, RosterInvite[]> = {
  "c-alg2": [
    { id: "i-1", email: "nadia.haddad@school.edu", invitedAt: NOW - 3 * DAY },
    { id: "i-2", email: "l.ferreira@school.edu", invitedAt: NOW - 3 * DAY },
    { id: "i-3", email: "samuel.osei@school.edu", invitedAt: NOW - 9 * 3_600_000 },
  ],
  "c-bio": [],
  "c-ush": [{ id: "i-4", email: "hana.suzuki@school.edu", invitedAt: NOW - 1 * DAY }],
};

export const exampleAssignments: Record<string, TeacherAssignment[]> = {
  "c-alg2": [
    {
      id: "a-1", classId: "c-alg2", title: "Factoring quadratics — practice set B",
      instructions: "Problems 1–18. Show the factored form and the check.",
      dueAt: NOW + 2 * DAY, points: 20, status: "todo", estimateMinutes: 45,
      source: "local", createdAt: NOW - 6 * DAY, updatedAt: NOW - 6 * DAY,
      rules: {
        answers: "guided", translation: "allowed", simplification: "allowed",
        pandaInstructions: "Do not give the factored form. Ask what two numbers multiply to c and add to b.",
      },
      done: 11, doing: 7, todo: 9,
    },
    {
      id: "a-2", classId: "c-alg2", title: "Unit 3 quiz corrections",
      instructions: "Redo every problem you missed, with a sentence on what went wrong.",
      dueAt: NOW - 1 * DAY, points: 15, status: "todo", estimateMinutes: 30,
      source: "local", createdAt: NOW - 12 * DAY, updatedAt: NOW - 4 * DAY,
      rules: {
        answers: "afterUnderstanding", translation: "allowed", simplification: "disabled",
        restrictionReason: "Corrections are about reading the original problem closely, so the wording stays as written.",
      },
      done: 18, doing: 3, todo: 6,
    },
    {
      id: "a-3", classId: "c-alg2", title: "Graphing project — parabolas in the wild",
      instructions: "Photograph something parabolic, fit an equation to it, and write a paragraph on the fit.",
      dueAt: NOW + 9 * DAY, points: 50, status: "todo", estimateMinutes: 120,
      source: "canvas", externalId: "canvas-88213", createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY,
      rules: { answers: "allowed", translation: "allowed", simplification: "allowed" },
      done: 2, doing: 9, todo: 16,
    },
  ],
  "c-bio": [
    {
      id: "a-4", classId: "c-bio", title: "Cell respiration reading questions",
      instructions: "Chapter 7, questions 1–10.",
      dueAt: NOW + 5 * DAY, points: 10, status: "todo", estimateMinutes: 40,
      source: "local", createdAt: NOW - 3 * DAY, updatedAt: NOW - 3 * DAY,
      rules: { answers: "guided", translation: "allowed", simplification: "allowed" },
      done: 9, doing: 6, todo: 9,
    },
  ],
  "c-ush": [
    {
      id: "a-5", classId: "c-ush", title: "Primary source analysis — Reconstruction",
      instructions: "Two documents, one paragraph each: who wrote it, for whom, and what they wanted.",
      dueAt: NOW - 1 * DAY, points: 25, status: "todo", estimateMinutes: 60,
      source: "local", createdAt: NOW - 10 * DAY, updatedAt: NOW - 10 * DAY,
      rules: {
        answers: "guided", translation: "disabled", simplification: "allowed",
        restrictionReason: "The exam is in English and this is the practice, so read the source in English — Panda can still simplify it.",
      },
      done: 12, doing: 8, todo: 11,
    },
  ],
};
