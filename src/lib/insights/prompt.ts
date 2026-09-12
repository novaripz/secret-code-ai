// Feeding what we noticed back into the teaching.
//
// The design decision, and the product's whole thesis: adapting the LANGUAGE
// must never lower the CONTENT. A model told "this student's English is
// emerging" will, left alone, quietly start teaching easier maths. That is the
// single failure this file exists to prevent, so the instruction is stated
// explicitly, stated twice, and stated in terms of what to keep rather than
// what to avoid.
//
// The addendum is built from the summary, not from raw signals, so the model
// only ever sees what survived the evidence bar — it cannot spend a lesson on
// a topic that was really one bad evening.

import { actionableFindings } from "./aggregate";
import type { EnglishLevel, StruggleSummary } from "./types";

/** Roughly how to pitch the English. Never changes what is being taught. */
const ENGLISH_PITCH: Record<EnglishLevel, string> = {
  emerging: `Their working English is EMERGING.
- Short sentences. One idea per sentence. Everyday words.
- Say the key term in English, then gloss it once in Spanish in brackets, then
  keep using the English term. They are learning the word, not avoiding it.
- Concrete examples with numbers or objects before any general rule.`,
  developing: `Their working English is DEVELOPING.
- Plain sentences, but you do not need to clip them. Avoid idioms and
  multi-clause questions.
- Keep subject vocabulary in English. Gloss a term in Spanish only the first
  time it appears, or when they stall on it.
- Lead with an example, then name the rule.`,
  intermediate: `Their working English is INTERMEDIATE.
- Write normally. Explain a hard word when you use one; do not pre-simplify
  everything.
- Subject vocabulary stays in English throughout.`,
  confident: `Their working English is CONFIDENT.
- Write normally, at full level. Do not simplify unless they ask.`,
  unknown: `You do not have enough evidence about their English yet.
- Write plainly, watch how they reply, and adjust. Do not assume they need
  simpler English, and never assume it from their name or their first language.`,
};

/**
 * The invariant, in the model's own idiom.
 *
 * Separated from the pitch so it is appended whatever the level is — including
 * "confident", where the temptation is different but the rule is the same.
 */
export const LANGUAGE_NOT_CONTENT = `
EASIER WORDS, NOT EASIER WORK.

You may change how you say things. You may not change what you are teaching.
The problem stays at grade level, the reasoning stays complete, the technical
term stays in English. If you find yourself giving a smaller problem, a
shortcut, or a conclusion without its reasoning because their English is still
growing, stop and rewrite the sentence instead.

Mixing in their first language is allowed and often good: a Spanish sentence
that unlocks a hard idea is worth more than an English sentence that does not
land. Keep the subject vocabulary in English even when the explanation around
it switches, so they finish the lesson owning the word they will meet on the
test.

Never mention any of this to the student. Do not tell them what level you
think they are at, do not say you are simplifying, and never say anything that
sounds like a record is being kept.`;

/**
 * Build the addendum. Returns "" when there is nothing honest to say, because
 * an addendum full of "we are not sure" is just noise in the context window.
 */
export function buildAdaptiveAddendum(summary: StruggleSummary): string {
  const focus = actionableFindings(summary).slice(0, 3);
  const hasEnglish = summary.english.level !== "unknown";
  if (focus.length === 0 && !hasEnglish) return "";

  let out = `

WHAT THIS STUDENT HAS BEEN STRUGGLING WITH.`;

  if (focus.length > 0) {
    out += `

These came from what they actually did in the app over the last two weeks, not
from a test. Spend extra time here when it is relevant:`;
    for (const f of focus) {
      // The evidence line goes in deliberately. The model behaves better when
      // it can see the strength of a claim, and it keeps this text checkable
      // against what a teacher is shown.
      out += `
- ${f.topic.label}${f.topic.className ? ` (${f.topic.className})` : ""} — ${f.confidence}: ${f.evidenceLine}.`;
    }
    out += `

When one of these comes up, do not just answer it and move on. Slow down, check
the step underneath it, and give them one small thing to try themselves. Do not
announce that you are doing this and never tell them they are behind on it.`;
  }

  out += `

${ENGLISH_PITCH[summary.english.level]}`;
  if (summary.english.codeSwitches) {
    out += `
- They mix English and Spanish in one message. Mirror that when it helps. It is
  a skill, not a mistake, and never correct it.`;
  }
  out += `
${LANGUAGE_NOT_CONTENT}`;
  return out;
}
