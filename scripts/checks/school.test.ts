// The school side: Canvas safety, due dates, the planner and the student tools.
//
// Run with `npx tsx scripts/checks/school.test.ts`. No framework: a few
// asserted facts and a non-zero exit, the same shape as the other checks.
//
// Everything here is pure logic, the part that can be wrong without a screen.
// Times are built from local dates (not UTC strings) because every rule under
// test speaks in the student's own days: "due tomorrow" means their tomorrow.

import { allowedCanvasBase, allowedCanvasBases, nextPageUrl } from "../../src/lib/canvas/types";
import { translate } from "../../src/lib/i18n";
import type { StringKey } from "../../src/lib/i18n/strings";
import {
  dateOnlyDue,
  dayKey,
  dueFromInputs,
  formatDue,
  isDateOnly,
  isPastDue,
  toTimeInput,
} from "../../src/lib/school/due";
import { isOverdue, type ActivityEvent, type Assignment, type GradeCategory, type SchoolClass } from "../../src/lib/school/types";
import { buildPlan, describeReasons, rankAssignments, remainingMinutes } from "../../src/lib/school/planner";
import { parseQuickAdd } from "../../src/lib/school/quickAdd";
import { buildWeek } from "../../src/lib/school/week";
import { summarizeProgress, withdrawDone } from "../../src/lib/school/progress";
import {
  extend,
  formatClock,
  hasEnded,
  pause,
  remainingMs,
  resume,
  startSession,
  titleWithClock,
} from "../../src/lib/school/focus";
import { buildIcs, escapeIcsText, foldIcsLine } from "../../src/lib/school/ics";
import { buildGrades, neededScore, type GradedAssignment } from "../../src/lib/school/grades";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}
function eq<T>(name: string, actual: T, expected: T): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(name, same, same ? "" : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------
// Canvas: the client secret only ever goes to an allowed host
// ---------------------------------------------------------------------------

console.log("\nCanvas allowlist");

const ALLOW = "myschool.instructure.com, https://other.instructure.com/ ,not a host";
eq("the allowlist is normalised and junk is dropped", allowedCanvasBases(ALLOW), [
  "https://myschool.instructure.com",
  "https://other.instructure.com",
]);
eq("no setting means nothing is allowed", allowedCanvasBases(undefined), []);
eq("an empty setting means nothing is allowed", allowedCanvasBases(""), []);
eq("a listed host is allowed, however it is typed", allowedCanvasBase("MySchool.Instructure.com/", ALLOW), "https://myschool.instructure.com");
eq("a path on a listed host still means that host", allowedCanvasBase("https://myschool.instructure.com/courses/1", ALLOW), "https://myschool.instructure.com");
eq("an unlisted host is refused", allowedCanvasBase("https://evil.example.com", ALLOW), null);
eq("a look-alike suffix is refused", allowedCanvasBase("https://myschool.instructure.com.evil.example", ALLOW), null);
eq("plain http is refused even for a listed host", allowedCanvasBase("http://myschool.instructure.com", ALLOW), null);
eq("with no allowlist, even a real-looking host is refused", allowedCanvasBase("https://myschool.instructure.com", undefined), null);

console.log("\nCanvas pagination");

const BASE = "https://myschool.instructure.com";
const link =
  '<https://myschool.instructure.com/api/v1/courses?page=1&per_page=100>; rel="current",' +
  '<https://myschool.instructure.com/api/v1/courses?page=2&per_page=100>; rel="next",' +
  '<https://myschool.instructure.com/api/v1/courses?page=1&per_page=100>; rel="first"';
eq("the next page is read from the Link header", nextPageUrl(link, BASE), `${BASE}/api/v1/courses?page=2&per_page=100`);
eq("no next link means the last page", nextPageUrl('<https://myschool.instructure.com/x?page=3>; rel="last"', BASE), null);
eq("no header means one page", nextPageUrl(null, BASE), null);
eq(
  "a next link to another host is not followed (it would carry the token)",
  nextPageUrl('<https://evil.example.com/steal?page=2>; rel="next"', BASE),
  null,
);

// ---------------------------------------------------------------------------
// Fixtures: a fixed Tuesday morning, 13 Oct 2026, 10:00 local
// ---------------------------------------------------------------------------

const t = (key: StringKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = local(2026, 10, 13, 10, 0);
const spaces = (s: string) => s.replace(/\s/g, " ");

let seq = 0;
function assignment(over: Partial<Assignment> = {}): Assignment {
  seq += 1;
  return {
    id: `a${seq}`,
    classId: "bio",
    title: `Task ${seq}`,
    dueAt: null,
    status: "todo",
    source: "local",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}
const CLASSES: SchoolClass[] = [
  { id: "bio", name: "Biology", source: "local", createdAt: 0 },
  { id: "alg", name: "Algebra II", source: "local", createdAt: 0 },
  { id: "eng", name: "English 10", source: "local", createdAt: 0 },
  { id: "his", name: "World History", source: "local", createdAt: 0 },
];

// ---------------------------------------------------------------------------
// One definition of overdue, for students and teachers
// ---------------------------------------------------------------------------

console.log("\nwhat overdue means");

const legacyNoonToday = local(2026, 10, 13, 12, 0);
const endOfToday = dateOnlyDue(NOW);
ok("a deadline stored at noon (before due times existed) reads as 'that day'", isDateOnly(legacyNoonToday));
ok("a date-only deadline is stored at 23:59 and reads as 'that day'", isDateOnly(endOfToday));
ok("8:00 is a real time", !isDateOnly(local(2026, 10, 13, 8, 0)));
ok(
  "the teacher bug: noon-stored work due today is NOT past due at 1pm",
  !isPastDue(legacyNoonToday, local(2026, 10, 13, 13, 0)),
);
ok("date-only work due today is not past due in the evening", !isPastDue(endOfToday, local(2026, 10, 13, 22, 30)));
ok("date-only work due yesterday is past due", isPastDue(dateOnlyDue(local(2026, 10, 12)), NOW));
ok("timed work at 8am is past due at 9am the same day", isPastDue(local(2026, 10, 13, 8, 0), local(2026, 10, 13, 9, 0)));
ok("timed work at 8am is not past due at 7am", !isPastDue(local(2026, 10, 13, 8, 0), local(2026, 10, 13, 7, 0)));
ok("no deadline is never past due", !isPastDue(null, NOW));
ok("done work is never overdue", !isOverdue(assignment({ dueAt: local(2026, 10, 1, 12), status: "done" }), NOW));
ok("unfinished late work is overdue", isOverdue(assignment({ dueAt: local(2026, 10, 1, 12) }), NOW));

console.log("\nentering a due date");

eq("a date with no time means the end of that day", dueFromInputs("2026-10-16", ""), dateOnlyDue(local(2026, 10, 16)));
eq("a date and a time mean that time", dueFromInputs("2026-10-16", "08:30"), local(2026, 10, 16, 8, 30));
eq("no date means no deadline", dueFromInputs("", "08:30"), null);
eq("a date-only deadline has no time to edit", toTimeInput(dateOnlyDue(NOW)), "");
eq("a timed deadline round-trips", toTimeInput(local(2026, 10, 16, 8, 30)), "08:30");
eq("day keys are local", dayKey(local(2026, 1, 2, 23, 30)), "2026-01-02");

console.log("\nsaying a due date");

const fmt = (dueAt: number | null, now = NOW) => {
  const label = formatDue(dueAt, { t, now, locale: "en-US" });
  return { text: spaces(label.text), tone: label.tone };
};
eq("no deadline", fmt(null), { text: "No due date", tone: "none" });
eq("today, no time", fmt(endOfToday), { text: "Due today", tone: "today" });
eq("today, with a time", fmt(local(2026, 10, 13, 20, 0)), { text: "Due today, 8:00 PM", tone: "today" });
eq("tomorrow", fmt(dateOnlyDue(local(2026, 10, 14))), { text: "Due tomorrow", tone: "soon" });
eq("tomorrow with a time", fmt(local(2026, 10, 14, 8, 0)), { text: "Due tomorrow, 8:00 AM", tone: "soon" });
eq("later this week is a weekday", fmt(dateOnlyDue(local(2026, 10, 16))), { text: "Due Fri", tone: "later" });
eq("further out is a date", fmt(dateOnlyDue(local(2026, 10, 23))), { text: "Due Oct 23", tone: "later" });
eq("next year says the year", fmt(dateOnlyDue(local(2027, 1, 8))), { text: "Due Jan 8, 2027", tone: "later" });
eq("past its time today", fmt(local(2026, 10, 13, 8, 0)), { text: "Overdue since 8:00 AM", tone: "overdue" });
eq("a day late", fmt(dateOnlyDue(local(2026, 10, 12))), { text: "1 day overdue", tone: "overdue" });
eq("three days late", fmt(dateOnlyDue(local(2026, 10, 10))), { text: "3 days overdue", tone: "overdue" });

// ---------------------------------------------------------------------------
// The planner's order and its reasons
// ---------------------------------------------------------------------------

console.log("\nplanner order");

{
  const late = assignment({ title: "late", dueAt: dateOnlyDue(local(2026, 10, 12)), points: 5 });
  const pinnedTomorrow = assignment({ title: "pinned", dueAt: dateOnlyDue(local(2026, 10, 14)), teacherPinned: true, points: 100 });
  const plainToday = assignment({ title: "plain", dueAt: endOfToday, points: 10 });
  const pastTimeToday = assignment({ title: "8am", dueAt: local(2026, 10, 13, 8, 0), points: 1 });
  const done = assignment({ title: "done", dueAt: dateOnlyDue(local(2026, 10, 10)), status: "done" });
  const order = rankAssignments([pinnedTomorrow, plainToday, done, late, pastTimeToday], NOW).map((r) => r.assignment.title);
  eq("overdue first, past-its-time-today next, the priority never jumps late work, done is gone", order, ["late", "8am", "pinned", "plain"]);

  const a = assignment({ title: "a", dueAt: dateOnlyDue(local(2026, 10, 15)), points: 10 });
  const b = assignment({ title: "b", dueAt: dateOnlyDue(local(2026, 10, 15)), points: 10, teacherPinned: true });
  eq("a teacher priority breaks a same-day tie", rankAssignments([a, b], NOW).map((r) => r.assignment.title), ["b", "a"]);

  const why = rankAssignments([b], NOW)[0].reasons;
  eq("reasons are said in words", describeReasons(why, t), "your teacher made it a priority · due in 2 days · worth 10 points");
}

console.log("\nplanner time");

{
  const essay = assignment({ title: "essay", dueAt: endOfToday, estimateMinutes: 30 });
  const lab = assignment({ title: "lab", dueAt: dateOnlyDue(local(2026, 10, 14)), estimateMinutes: 45 });
  const quiz = assignment({ title: "quiz", dueAt: dateOnlyDue(local(2026, 10, 15)), estimateMinutes: 20 });
  const plan = buildPlan([quiz, lab, essay], CLASSES, 60, NOW);
  eq("whole items first, then a real start on the next", plan.items.map((i) => [i.assignment.title, i.minutes, i.partial]), [
    ["essay", 30, false],
    ["lab", 30, true],
  ]);
  eq("what does not fit is listed, with how long it needs", plan.overflow.map((o) => [o.assignment.title, o.minutes]), [["quiz", 20]]);

  const steps = [
    { id: "1", text: "Outline", minutes: 10, done: true },
    { id: "2", text: "Draft", minutes: 25, done: false },
    { id: "3", text: "Edit", done: false },
  ];
  eq("a checklist decides what is left (unticked steps, even share for the unsized)", remainingMinutes(assignment({ estimateMinutes: 60 }), steps), 45);
  eq("focus time already spent comes off the estimate", remainingMinutes(assignment({ estimateMinutes: 60 }), undefined, 25), 35);
  eq("but never all the way to nothing", remainingMinutes(assignment({ estimateMinutes: 60 }), undefined, 200), 10);
  eq("no estimate falls back to half an hour", remainingMinutes(assignment()), 30);

  const withSteps = buildPlan([assignment({ id: "s", dueAt: endOfToday, estimateMinutes: 60 })], CLASSES, 120, NOW, { steps: { s: steps } });
  eq("the plan names the next step", withSteps.items[0].nextStep, "Draft");
}

// ---------------------------------------------------------------------------
// Quick-add
// ---------------------------------------------------------------------------

console.log("\nquick-add");

const qa = (text: string, now = NOW, classes: SchoolClass[] = CLASSES) => {
  const r = parseQuickAdd(text, classes, now);
  return r && { title: r.title, classId: r.classId, dueAt: r.dueAt, minutes: r.minutes, points: r.points };
};
eq("the example from the brief", qa("bio lab fri 45m"), {
  title: "Lab",
  classId: "bio",
  dueAt: dateOnlyDue(local(2026, 10, 16)),
  minutes: 45,
  points: undefined,
});
eq("joining words go with what they join, and a time is kept", qa("essay for english by thu 9am"), {
  title: "Essay",
  classId: "eng",
  dueAt: local(2026, 10, 15, 9, 0),
  minutes: undefined,
  points: undefined,
});
eq("hours and minutes, and a title with a number in it", qa("Homework 4.2 tomorrow 1h30"), {
  title: "Homework 4.2",
  classId: null,
  dueAt: dateOnlyDue(local(2026, 10, 14)),
  minutes: 90,
  points: undefined,
});
eq("a word that starts a later word in the class name, a month date and points", qa("hist reading oct 20 20pts"), {
  title: "Reading",
  classId: "his",
  dueAt: dateOnlyDue(local(2026, 10, 20)),
  minutes: undefined,
  points: 20,
});
eq("a class name on its own is a title, not an empty task", qa("biology")?.classId, null);
eq("the day usually ends the line", qa("sat prep tue")?.title, "Sat prep");
eq("a weekday that is today means today", qa("quiz tue")?.dueAt, dateOnlyDue(NOW));
eq("'next' means the week after", qa("quiz next fri")?.dueAt, dateOnlyDue(local(2026, 10, 23)));
eq("a later time today stays today", qa("read 5pm")?.dueAt, local(2026, 10, 13, 17, 0));
eq("an earlier time means tomorrow", qa("read 9am")?.dueAt, local(2026, 10, 14, 9, 0));
eq("in N days", qa("algebra worksheet in 3 days")?.dueAt, dateOnlyDue(local(2026, 10, 16)));
eq("a two-way tie names no class", qa("eng essay", NOW, [...CLASSES, { id: "eng11", name: "English 11", source: "local", createdAt: 0 }])?.classId, null);
eq("January typed in December is next January", qa("project jan 5", local(2026, 12, 20, 9))?.dueAt, dateOnlyDue(local(2027, 1, 5)));
eq("a date that does not exist is left in the title", qa("pages 2/30")?.title, "Pages 2/30");
eq("nothing typed is nothing", parseQuickAdd("   ", CLASSES, NOW), null);

// ---------------------------------------------------------------------------
// The week strip
// ---------------------------------------------------------------------------

console.log("\nweek view");

{
  const fri = assignment({ id: "fri", dueAt: dateOnlyDue(local(2026, 10, 16)), estimateMinutes: 40 });
  const late = assignment({ id: "late", dueAt: dateOnlyDue(local(2026, 10, 11)), estimateMinutes: 20 });
  const planned = assignment({ id: "planned", dueAt: dateOnlyDue(local(2026, 10, 16)), estimateMinutes: 30 });
  const carried = assignment({ id: "carried", dueAt: dateOnlyDue(local(2026, 10, 18)), estimateMinutes: 15 });
  const far = assignment({ id: "far", dueAt: dateOnlyDue(local(2026, 10, 30)) });
  const none = assignment({ id: "none" });
  const done = assignment({ id: "done", dueAt: endOfToday, status: "done" });
  const week = buildWeek([fri, late, planned, carried, far, none, done], {
    now: NOW,
    doOn: { planned: "2026-10-15", carried: "2026-10-12" },
  });
  eq("seven days from today", week.days.map((d) => d.key), [
    "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19",
  ]);
  eq("today holds the overdue work and what was planned for a day gone by", week.days[0].entries.map((e) => [e.assignment.id, e.overdue, e.carried]), [
    ["late", true, false],
    ["carried", false, true],
  ]);
  eq("a planned day beats the due day", week.days[2].entries.map((e) => [e.assignment.id, e.planned]), [["planned", true]]);
  eq("otherwise work sits on its due day", week.days[3].entries.map((e) => [e.assignment.id, e.dueThisDay]), [["fri", true]]);
  eq("each day adds up its minutes", week.days[0].minutes, 35);
  eq("beyond the week, and undated, are listed separately", [week.later.map((e) => e.assignment.id), week.undated.map((e) => e.assignment.id)], [["far"], ["none"]]);
}

// ---------------------------------------------------------------------------
// Progress and streaks
// ---------------------------------------------------------------------------

console.log("\nprogress");

{
  const events: ActivityEvent[] = [
    { at: local(2026, 10, 11, 18), kind: "focus", minutes: 25 },
    { at: local(2026, 10, 12, 19), kind: "done", assignmentId: "x" },
    { at: local(2026, 10, 13, 8), kind: "done", assignmentId: "y" },
    { at: local(2026, 10, 13, 9), kind: "focus", minutes: 25, assignmentId: "y" },
    { at: local(2026, 10, 13, 9, 30), kind: "done", assignmentId: "z" },
  ];
  const p = summarizeProgress(events, NOW);
  eq("today's tally", [p.doneToday, p.focusMinutesToday], [2, 25]);
  eq("a week of focus", p.focusMinutesWeek, 50);
  eq("three days running", p.streak, 3);

  const yesterdayOnly = summarizeProgress(events.slice(0, 2), NOW);
  eq("a streak is not broken by a day that is not over yet", [yesterdayOnly.streak, yesterdayOnly.activeToday], [2, false]);
  eq("a gap of a whole day ends it, quietly", summarizeProgress([{ at: local(2026, 10, 10, 12), kind: "done" }], NOW).streak, 0);
  eq("taking a tick back takes its event back", withdrawDone(events, "z").length, 4);
}

// ---------------------------------------------------------------------------
// The focus timer
// ---------------------------------------------------------------------------

console.log("\nfocus timer");

{
  const MIN = 60_000;
  const s = startSession({ id: "f", kind: "focus", minutes: 25, title: "Essay", now: NOW });
  eq("time left is worked out from the end, not counted", remainingMs(s, NOW + 10 * MIN), 15 * MIN);
  const paused = pause(s, NOW + 10 * MIN);
  eq("pausing sets the time left aside", [paused.endAt, paused.pausedLeftMs], [null, 15 * MIN]);
  eq("and a paused clock does not move", remainingMs(paused, NOW + 60 * MIN), 15 * MIN);
  const resumed = resume(paused, NOW + 20 * MIN);
  eq("resuming sets a new end that far ahead", resumed.endAt, NOW + 35 * MIN);
  eq("+5 min on a running clock moves the end", extend(resumed, 5, NOW + 21 * MIN).endAt, NOW + 40 * MIN);
  ok("it ends at its end", hasEnded(resumed, NOW + 35 * MIN) && !hasEnded(resumed, NOW + 34 * MIN));
  const again = extend(resumed, 5, NOW + 50 * MIN);
  eq("+5 min after the chime starts five more from now", [again.endAt, again.finishedAt], [NOW + 55 * MIN, null]);
  eq("the clock rounds up, so it never says 00:00 with time left", formatClock(59_001), "01:00");
  eq("and shows hours past an hour", formatClock(3_725_000), "1:02:05");
  eq("the tab title carries the clock", titleWithClock("Plan · Panda", "12:34"), "(12:34) Plan · Panda");
  eq("and swaps it rather than stacking", titleWithClock("(12:34) Plan · Panda", "12:33"), "(12:33) Plan · Panda");
  eq("and gives the title back when it stops", titleWithClock("(00:01) Plan · Panda", null), "Plan · Panda");
}

// ---------------------------------------------------------------------------
// Calendar export
// ---------------------------------------------------------------------------

console.log("\ncalendar export");

{
  eq("text is escaped", escapeIcsText("Read; then, write\\notes\nlater"), "Read\\; then\\, write\\\\notes\\nlater");
  const long = `SUMMARY:${"é".repeat(80)}`;
  const folded = foldIcsLine(long);
  ok(
    "long lines fold at 75 octets without splitting a character",
    folded.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75) && folded.replace(/\r\n /g, "") === long,
  );
  const ics = buildIcs(
    [
      assignment({ id: "d1", title: "Lab", classId: "bio", dueAt: dateOnlyDue(local(2026, 10, 16)) }),
      assignment({ id: "d2", title: "Quiz", classId: "alg", dueAt: local(2026, 10, 15, 8, 0) }),
      assignment({ id: "d3", title: "Old", dueAt: dateOnlyDue(local(2026, 10, 1)), status: "done" }),
      assignment({ id: "d4", title: "Someday" }),
    ],
    CLASSES,
    { now: NOW },
  );
  ok("lines end in CRLF", ics.includes("\r\n") && !/[^\r]\n/.test(ics));
  ok("a date-only deadline is an all-day event", ics.includes("DTSTART;VALUE=DATE:20261016") && ics.includes("DTEND;VALUE=DATE:20261017"));
  ok("a timed deadline ends at the deadline", ics.includes(`DTEND:${new Date(local(2026, 10, 15, 8, 0)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`));
  ok("the class is in the title", ics.includes("SUMMARY:Due: Lab (Biology)"));
  eq("done and undated work are left out", (ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
}

// ---------------------------------------------------------------------------
// What-if grades
// ---------------------------------------------------------------------------

console.log("\nwhat-if grades");

{
  const graded = (a: Assignment, points: number | null): GradedAssignment => ({
    assignment: a,
    grade: points === null ? null : { assignmentId: a.id, studentId: "s", pointsEarned: points, recordedBy: null, updatedAt: 0 },
  });
  const quiz = assignment({ id: "quiz", points: 50 });
  const final = assignment({ id: "final", points: 100 });
  const items = [graded(quiz, 40), graded(final, null)];
  eq("plain points: 40/50 so far, what does the final need for 80%", neededScore(items, [], "final", 80), { kind: "needs", points: 80, possible: 100 });
  eq("a target full marks cannot reach says so, and how close it gets", neededScore(items, [], "final", 99)?.kind, "unreachable");
  eq("a target already met with a zero says so", neededScore(items, [], "final", 25), { kind: "already" });
  eq("a marked assignment has no what-if", neededScore(items, [], "quiz", 90), null);

  const cats: GradeCategory[] = [
    { id: "tests", classId: "c", name: "Tests", weight: 75, position: 0 },
    { id: "hw", classId: "c", name: "Homework", weight: 25, position: 1 },
  ];
  const test1 = assignment({ id: "t1", points: 100, categoryId: "tests" });
  const hw = assignment({ id: "hw1", points: 20, categoryId: "hw" });
  const exam = assignment({ id: "exam", points: 100, categoryId: "tests" });
  const weighted = [graded(test1, 70), graded(hw, 18), graded(exam, null)];
  const answer = neededScore(weighted, cats, "exam", 83);
  eq("weights are honoured: a B needs 91.5 on the exam", answer, { kind: "needs", points: 91.5, possible: 100 });
  const check = buildGrades(
    [graded(test1, 70), graded(hw, 18), graded(exam, 91.5)],
    cats,
  ).percent as number;
  ok("and that score really does reach a B", check >= 83, `${check}%`);
}

// ---------------------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.log(`${failures} school check(s) failed.`);
  process.exit(1);
}
console.log("All school checks passed.");
