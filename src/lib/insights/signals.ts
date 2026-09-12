// Turning things that happen in a chat into evidence.
//
// The design decision: capture is deliberately dumb. These functions record
// what happened and where it happened, and make no judgement about what it
// means — all interpretation lives in aggregate.ts, so the rules can change
// later without invalidating stored signals. Signals are facts; findings are
// opinions, and only opinions expire.
//
// Everything takes its inputs as arguments and returns a value. No store, no
// database, no clock of its own beyond a `now` you can pass in.

import type { MessageAction } from "@/components/chat/MessageActions";
import type { Assignment, SchoolClass } from "@/lib/school/types";
import type { SignalKind, StruggleSignal, Topic } from "./types";

/**
 * Which buttons count as evidence of difficulty.
 *
 * "translate" is not in here as a struggle: reading the answer in Spanish is a
 * language signal, not a confusion signal, and treating a bilingual student's
 * normal behaviour as a deficit is exactly the mistake this feature exists to
 * avoid. It still gets recorded — englishLevel.ts reads it — but it never
 * lands on a teacher's "needs attention" list on its own.
 */
export const STRUGGLE_ACTIONS: MessageAction[] = ["simplify", "hint", "different", "example"];

/** "check" is neutral: a student checking their work is doing the right thing. */
export const NEUTRAL_ACTIONS: MessageAction[] = ["check", "translate"];

/**
 * The topic an assignment is about.
 *
 * We use the assignment itself as the topic rather than trying to extract
 * "quadratic factoring" from its text. A title a teacher wrote is a label
 * both of them recognise; a phrase a model pulled out of free text is a guess
 * we would then print next to a confidence.
 */
export function topicForAssignment(a: Assignment, cls?: SchoolClass): Topic {
  return {
    id: a.id,
    label: a.title,
    classId: a.classId,
    className: cls?.name,
  };
}

/** The fallback when a chat is attached to a class but not a single assignment. */
export function topicForClass(cls: SchoolClass): Topic {
  return { id: `class:${cls.id}`, label: cls.name, classId: cls.id, className: cls.name };
}

let counter = 0;
function signalId(at: number): string {
  counter += 1;
  return `sig_${at.toString(36)}_${counter.toString(36)}`;
}

export interface CaptureContext {
  topic: Topic;
  sessionId?: string;
  at?: number;
}

/** A button press under an assistant reply. The strongest signal we get. */
export function signalFromAction(action: MessageAction, ctx: CaptureContext): StruggleSignal {
  const at = ctx.at ?? Date.now();
  return { id: signalId(at), topic: ctx.topic, kind: "action", action, at, sessionId: ctx.sessionId };
}

/**
 * Phrases that mean "I don't get it" in the languages this app is actually
 * used in.
 *
 * Kept to unambiguous stems on purpose. A wider net catches "I don't get why
 * the answer is 7", which is a student reasoning out loud, not a student
 * stuck, and counting it would inflate every finding. Under-counting here is
 * fine: the buttons carry most of the load.
 */
const CONFUSION_PATTERNS: RegExp[] = [
  /\bi\s*(do\s*n[o']?t|dont|don't)\s+(get|understand)\s+(it|this|that|any\s*of\s*(it|this))\b/i,
  /\bi'?m\s+(so\s+)?(lost|confused)\b/i,
  /\bmakes?\s+no\s+sense\b/i,
  /\bstill\s+(do\s*n[o']?t|dont|don't)\s+(get|understand)\b/i,
  /\bno\s+entiendo\b/i,
  /\bno\s+lo\s+entiendo\b/i,
  /\bestoy\s+perdid[oa]\b/i,
  /\bno\s+s[eé]\s+c[oó]mo\b/i,
];

/** True when the student said, in their own words, that they are lost. */
export function looksConfused(text: string): boolean {
  return CONFUSION_PATTERNS.some((re) => re.test(text));
}

/** A signal for explicit "I don't get it" language. Returns null when there isn't one. */
export function signalFromText(text: string, ctx: CaptureContext): StruggleSignal | null {
  if (!looksConfused(text)) return null;
  const at = ctx.at ?? Date.now();
  return { id: signalId(at), topic: ctx.topic, kind: "phrase", at, sessionId: ctx.sessionId };
}

/**
 * Coming back to the same assignment in a later session.
 *
 * Returning is only evidence when it is a *return* — same assignment, new
 * session, and at least an hour later. Scrolling back up in the same
 * conversation is not a second attempt.
 */
export const RETRY_MIN_GAP_MS = 60 * 60 * 1000;

export function signalFromRetry(
  ctx: CaptureContext & { previousSessionAt: number },
): StruggleSignal | null {
  const at = ctx.at ?? Date.now();
  if (at - ctx.previousSessionAt < RETRY_MIN_GAP_MS) return null;
  return { id: signalId(at), topic: ctx.topic, kind: "retry", at, sessionId: ctx.sessionId };
}

/**
 * A long silence before the next message.
 *
 * The weakest thing we record, and the one most likely to be a student
 * putting their phone down for dinner. Three minutes is long enough that it
 * is probably thinking-or-stuck rather than typing, and the aggregator
 * weights it near zero regardless.
 */
export const DWELL_MIN_SECONDS = 180;
export const DWELL_MAX_SECONDS = 45 * 60;

export function signalFromDwell(idleSeconds: number, ctx: CaptureContext): StruggleSignal | null {
  if (idleSeconds < DWELL_MIN_SECONDS || idleSeconds > DWELL_MAX_SECONDS) return null;
  const at = ctx.at ?? Date.now();
  return { id: signalId(at), topic: ctx.topic, kind: "dwell", at, sessionId: ctx.sessionId, idleSeconds };
}

/** How much each kind counts toward the evidence bar. See aggregate.ts. */
export const KIND_WEIGHT: Record<SignalKind, number> = {
  action: 1,
  phrase: 1,
  retry: 1,
  // A pause is context, not proof. It can colour a finding but never make one.
  dwell: 0.25,
};
