// What the app is allowed to notice about a student, and what it is allowed to
// say about it.
//
// The design decision here is that a struggle is never a score. Everything in
// this file carries the evidence that produced it, because the one thing a
// teacher needs to be able to do with a claim like "she's stuck on factoring"
// is check it. A number with no receipts is unfalsifiable, and an
// unfalsifiable number about a fourteen year old is worse than no number.
//
// The second decision is the privacy boundary, enforced further down in
// `TeacherReport`: signals hold ids and counts, never message text, so the
// teacher-facing shape structurally cannot leak a chat transcript.

import type { MessageAction } from "@/components/chat/MessageActions";

/**
 * A topic is whatever the student and the teacher would both call the thing.
 *
 * It is derived from the assignment and the class, never guessed from free
 * text, because "I don't get this" tells you nothing about the subject and
 * inventing a topic from it produces a report that is confidently wrong.
 */
export interface Topic {
  /** Stable key used for grouping. Assignment id when we have one. */
  id: string;
  /** What a human calls it: the assignment title. */
  label: string;
  /** The class it belongs to, when known. */
  classId?: string;
  /** The class name, carried so a report reads without a second lookup. */
  className?: string;
}

/**
 * The kinds of evidence we trust, ordered roughly by how loud they are.
 *
 * `action` covers the buttons under a reply — those are the strongest signal
 * in the app because pressing one is deliberate. `phrase` is the student
 * typing "no entiendo" or "i still dont get it" in their own words. `retry`
 * is coming back to the same assignment again in a later session. `dwell` is
 * a long gap before the next message, which is weak on its own and treated
 * that way.
 */
export type SignalKind = "action" | "phrase" | "retry" | "dwell";

export interface StruggleSignal {
  id: string;
  topic: Topic;
  kind: SignalKind;
  /** Which button, when kind is "action". */
  action?: MessageAction;
  /** Epoch millis. */
  at: number;
  /**
   * Which chat session this came from. Repetition inside one session is much
   * weaker evidence than the same difficulty returning on another day, and
   * the aggregator needs to be able to tell those apart.
   */
  sessionId?: string;
  /** Seconds since the previous student message, when kind is "dwell". */
  idleSeconds?: number;
}

/**
 * How much we are willing to claim.
 *
 * Deliberately three coarse words rather than a percentage. "watching" is the
 * honest label for one or two data points and it is a first-class state, not
 * a failure state — the point is that thin evidence stays visible instead of
 * being rounded up into a finding.
 */
export type Confidence = "watching" | "likely" | "clear";

export interface TopicFinding {
  topic: Topic;
  confidence: Confidence;
  /** Total signals in the window. Always shown next to the confidence. */
  evidenceCount: number;
  /** Breakdown by kind, so the sentence can name what actually happened. */
  byKind: Record<SignalKind, number>;
  /** Which buttons were pressed, and how often. */
  byAction: Partial<Record<MessageAction, number>>;
  /** How many distinct days the signals span. One day is one bad afternoon. */
  daysSeen: number;
  /** How many distinct chat sessions. */
  sessionsSeen: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /**
   * A plain sentence a teacher can read and check, e.g.
   * "4 hint requests and 2 'I don't understand' on Quadratic Factoring, over 3 days".
   * Generated, never free text from the model.
   */
  evidenceLine: string;
}

/**
 * Coarse and honest. Not CEFR, because we have no test — we have button
 * presses. Five buckets is as fine as button presses can honestly support.
 *
 * Never inferred from the student's first language, their name, or their
 * country. Only from what they do in this app.
 */
export type EnglishLevel = "emerging" | "developing" | "intermediate" | "confident" | "unknown";

export interface EnglishLevelEstimate {
  level: EnglishLevel;
  /** Same rule as findings: no claim without a count behind it. */
  evidenceCount: number;
  confidence: Confidence;
  /** Short human-readable reasons, e.g. "asked for a translation 5 times". */
  reasons: string[];
  /** True when the student mixes languages mid-sentence. Not a deficit. */
  codeSwitches: boolean;
}

/** The full picture, for Panda's own use. May reference session ids. */
export interface StruggleSummary {
  studentId: string;
  /** The window these findings cover. */
  fromAt: number;
  toAt: number;
  /** Ordered loudest first. Includes "watching" entries. */
  findings: TopicFinding[];
  english: EnglishLevelEstimate;
  /** Total signals considered, including ones too thin to become findings. */
  signalCount: number;
}

/**
 * WHY THIS IS A SEPARATE TYPE.
 *
 * A teacher gets learning signals, not surveillance. Chat with Panda is the
 * place a student is willing to admit they do not understand something, and
 * that only stays true if they know the transcript is not being forwarded to
 * the person who grades them. So the teacher-facing shape is a distinct type
 * that has no field capable of carrying message text, no session ids, and no
 * free-text anything the student wrote — topics, counts, dates, and generated
 * evidence lines only.
 *
 * This is enforced structurally rather than by a comment asking people to be
 * careful, because "remember not to put the transcript in" is a rule that
 * survives exactly one refactor. If a future feature needs quotes, it needs a
 * new type and a new consent conversation, and that friction is the feature.
 */
export interface TeacherTopicRow {
  topicLabel: string;
  className?: string;
  confidence: Confidence;
  evidenceCount: number;
  daysSeen: number;
  lastSeenAt: number;
  /** Generated from counts only. */
  evidenceLine: string;
}

export interface TeacherReport {
  studentId: string;
  fromAt: number;
  toAt: number;
  /** Only findings that cleared the evidence bar. */
  needsAttention: TeacherTopicRow[];
  /** Thin evidence, surfaced honestly as "not a finding yet". */
  watching: TeacherTopicRow[];
  englishLevel: EnglishLevel;
  englishEvidenceCount: number;
  englishConfidence: Confidence;
  englishReasons: string[];
  signalCount: number;
}
