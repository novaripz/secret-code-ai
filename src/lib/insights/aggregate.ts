// Turning evidence into findings, conservatively.
//
// The design decision is the bar. Two data points is not a finding, and the
// type system is not allowed to hide that: everything below the bar still
// comes back, labelled "watching", with its count attached. Nothing is
// dropped and nothing is promoted.
//
// The thresholds below are judgement calls, written down here rather than
// scattered through the code so a teacher-facing argument about them has one
// place to happen.

import type { MessageAction } from "@/components/chat/MessageActions";
import { KIND_WEIGHT, STRUGGLE_ACTIONS } from "./signals";
import type {
  Confidence,
  EnglishLevelEstimate,
  SignalKind,
  StruggleSignal,
  StruggleSummary,
  TopicFinding,
} from "./types";

/**
 * How far back we look. Two weeks is about one unit of school: long enough
 * that a real difficulty shows up twice, short enough that something they
 * fixed in September is not still on the list in October.
 */
export const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Weighted evidence needed before we will say anything at all.
 *
 * Three, because two presses of "I don't understand" is a hard question and
 * three is a pattern. This is the number that decides whether a teacher reads
 * a row as a claim, so it is set where a sceptical teacher would still nod.
 */
export const LIKELY_POINTS = 3;

/**
 * And what it takes to say "clear": twice the evidence, *and* it came back.
 *
 * The second condition is the important one. Six presses in one frustrated
 * evening is one bad evening. Six presses across two days is a topic they
 * cannot get past, and those deserve different words.
 */
export const CLEAR_POINTS = 6;
export const CLEAR_MIN_SPREAD = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(at: number): number {
  return Math.floor(at / DAY_MS);
}

const EMPTY_BY_KIND: Record<SignalKind, number> = { action: 0, phrase: 0, retry: 0, dwell: 0 };

/** Human names for the buttons, for the evidence line. Plural-aware. */
const ACTION_PHRASE: Record<MessageAction, [string, string]> = {
  simplify: ["“I don’t understand”", "“I don’t understand” presses"],
  hint: ["hint request", "hint requests"],
  different: ["ask for another explanation", "asks for another explanation"],
  example: ["request for an example", "requests for an example"],
  check: ["work check", "work checks"],
  translate: ["translation request", "translation requests"],
};

function count(n: number, [one, many]: [string, string]): string {
  return `${n} ${n === 1 ? one : many}`;
}

function evidenceLine(f: Omit<TopicFinding, "evidenceLine">): string {
  const parts: string[] = [];
  for (const [action, n] of Object.entries(f.byAction) as [MessageAction, number][]) {
    if (STRUGGLE_ACTIONS.includes(action) && n > 0) parts.push(count(n, ACTION_PHRASE[action]));
  }
  if (f.byKind.phrase > 0) parts.push(count(f.byKind.phrase, ["time saying they were lost", "times saying they were lost"]));
  if (f.byKind.retry > 0) parts.push(count(f.byKind.retry, ["return to it later", "returns to it later"]));
  if (parts.length === 0 && f.byKind.dwell > 0) {
    parts.push(count(f.byKind.dwell, ["long pause", "long pauses"]));
  }
  const what = parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
    : (parts[0] ?? "no clear evidence");
  const span = f.daysSeen > 1 ? `, over ${f.daysSeen} days` : ", all on one day";
  return `${what} on ${f.topic.label}${span}`;
}

function confidenceFor(points: number, daysSeen: number, sessionsSeen: number): Confidence {
  const spread = Math.max(daysSeen, sessionsSeen);
  if (points >= CLEAR_POINTS && spread >= CLEAR_MIN_SPREAD) return "clear";
  if (points >= LIKELY_POINTS) return "likely";
  return "watching";
}

/** Loudest first: clear before likely before watching, then by evidence, then recency. */
const RANK: Record<Confidence, number> = { clear: 0, likely: 1, watching: 2 };

/**
 * Build the picture. Pure: same signals and same `now` give the same summary.
 *
 * Signals outside the window are ignored rather than decayed — a half-life
 * would be a second invented number, and the point of this module is to have
 * as few of those as possible.
 */
export function summarizeStruggles(
  studentId: string,
  signals: StruggleSignal[],
  english: EnglishLevelEstimate,
  now = Date.now(),
): StruggleSummary {
  const fromAt = now - WINDOW_MS;
  const inWindow = signals.filter((s) => s.at >= fromAt && s.at <= now);

  const groups = new Map<string, StruggleSignal[]>();
  for (const s of inWindow) {
    const list = groups.get(s.topic.id);
    if (list) list.push(s);
    else groups.set(s.topic.id, [s]);
  }

  const findings: TopicFinding[] = [];
  for (const list of groups.values()) {
    const byKind = { ...EMPTY_BY_KIND };
    const byAction: Partial<Record<MessageAction, number>> = {};
    const days = new Set<number>();
    const sessions = new Set<string>();
    let points = 0;
    let firstSeenAt = Infinity;
    let lastSeenAt = -Infinity;

    for (const s of list) {
      byKind[s.kind] += 1;
      if (s.action) byAction[s.action] = (byAction[s.action] ?? 0) + 1;
      // Neutral buttons are recorded but never counted toward difficulty: a
      // student asking for a translation or a work check is doing their job.
      const counts = s.kind !== "action" || (s.action && STRUGGLE_ACTIONS.includes(s.action));
      if (counts) points += KIND_WEIGHT[s.kind];
      days.add(dayKey(s.at));
      if (s.sessionId) sessions.add(s.sessionId);
      firstSeenAt = Math.min(firstSeenAt, s.at);
      lastSeenAt = Math.max(lastSeenAt, s.at);
    }

    // A topic whose only traffic was neutral is not a struggle at all.
    if (points === 0) continue;

    const base = {
      topic: list[0].topic,
      confidence: confidenceFor(points, days.size, sessions.size),
      evidenceCount: list.length,
      byKind,
      byAction,
      daysSeen: days.size,
      sessionsSeen: sessions.size,
      firstSeenAt,
      lastSeenAt,
    };
    findings.push({ ...base, evidenceLine: evidenceLine(base) });
  }

  findings.sort(
    (a, b) =>
      RANK[a.confidence] - RANK[b.confidence] ||
      b.evidenceCount - a.evidenceCount ||
      b.lastSeenAt - a.lastSeenAt,
  );

  return { studentId, fromAt, toAt: now, findings, english, signalCount: inWindow.length };
}

/** The findings Panda should actually spend extra time on. Never "watching" ones. */
export function actionableFindings(summary: StruggleSummary): TopicFinding[] {
  return summary.findings.filter((f) => f.confidence !== "watching");
}
