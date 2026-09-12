// The one-way door between what Panda knows and what a teacher sees.
//
// The design decision: this is a projection, not a view. `toTeacherReport`
// builds a new object out of counts and labels, field by field, instead of
// spreading the summary and deleting the sensitive parts. Spreading is how
// transcripts leak — someone adds a field upstream, and it silently arrives
// downstream. Here, a new field has to be typed out by hand in a file whose
// whole job is to be read carefully.
//
// A student tells Panda "I still don't get it and I feel stupid". The teacher
// should learn that factoring needs another pass on Tuesday. The teacher
// should not learn the sentence. Both of those are served by counts.

import type { StruggleSummary, TeacherReport, TeacherTopicRow, TopicFinding } from "./types";

function row(f: TopicFinding): TeacherTopicRow {
  // Built explicitly. Do not replace with a spread of `f` — see the file comment.
  return {
    topicLabel: f.topic.label,
    className: f.topic.className,
    confidence: f.confidence,
    evidenceCount: f.evidenceCount,
    daysSeen: f.daysSeen,
    lastSeenAt: f.lastSeenAt,
    evidenceLine: f.evidenceLine,
  };
}

/**
 * Project the summary down to what a teacher may see.
 *
 * "watching" rows are kept and labelled rather than hidden. A teacher seeing
 * "2 hint requests, not a pattern yet" learns something true and learns that
 * the tool is not inflating. Hiding thin evidence would make everything shown
 * look equally solid, which is the failure mode this whole module is built
 * against.
 */
export function toTeacherReport(summary: StruggleSummary): TeacherReport {
  const needsAttention: TeacherTopicRow[] = [];
  const watching: TeacherTopicRow[] = [];
  for (const f of summary.findings) {
    (f.confidence === "watching" ? watching : needsAttention).push(row(f));
  }
  return {
    studentId: summary.studentId,
    fromAt: summary.fromAt,
    toAt: summary.toAt,
    needsAttention,
    watching,
    englishLevel: summary.english.level,
    englishEvidenceCount: summary.english.evidenceCount,
    englishConfidence: summary.english.confidence,
    englishReasons: [...summary.english.reasons],
    signalCount: summary.signalCount,
  };
}
