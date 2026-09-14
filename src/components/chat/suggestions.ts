// What the chips under an empty chat should say.
//
// The design decision: a suggestion is a claim about the student, so it only
// gets made when the insights engine has already agreed to make it. This module
// reads `actionableFindings`, which drops everything at "watching" confidence,
// and never looks at raw signals. That boundary is the whole point — if the
// engine decides two hint presses on one afternoon are not evidence, the chips
// must stay quiet too, because a chip saying "want to work on your fractions?"
// to a student who has never opened a fraction is the moment they stop
// believing anything Panda says about them.
//
// So there is no "nearly a finding" tier here, and no topic invented from a
// message the student typed. With nothing actionable, the generic starters come
// back unchanged — a neutral chip is a fine thing to show and costs nothing,
// while a wrong personal one costs trust we do not get back.
//
// The other rule is translation. Every chip is a whole sentence in the
// catalogue with the topic interpolated as {topic}, never a translated fragment
// glued to a topic name: word order differs per language and concatenation
// produces sentences no locale would write.

import type { StringKey } from "@/lib/i18n";
import type { TopicFinding } from "@/lib/insights";

/** A chip, resolved to text by the caller's `t` so this file stays pure. */
export interface Suggestion {
  /** Stable across renders; used as the React key. */
  id: string;
  key: StringKey;
  vars?: Record<string, string>;
}

/** The neutral chips, and the honest answer when we know nothing yet. */
export const GENERIC_STARTERS: StringKey[] = [
  "chat.starterScreenshot",
  "chat.starterApi",
  "chat.starterPlanSite",
  "chat.starterCheckWork",
];

/**
 * One phrasing per finding, cycled by position rather than chosen at random.
 *
 * Varying the verb matters: three chips that all say "practise X" read like a
 * nag, while practise / explain / check reads like someone who remembers what
 * happened. Cycling by index keeps it deterministic, so the chips do not
 * reshuffle on every render.
 */
const FINDING_TEMPLATES: StringKey[] = [
  "chat.suggestPractice",
  "chat.suggestExplain",
  "chat.suggestMistake",
];

/** Four is the ceiling: past that it stops being a suggestion and becomes a menu. */
const MAX_SUGGESTIONS = 4;

/**
 * Build the chips for an empty chat.
 *
 * Findings come first and are capped at three, so at least one neutral chip
 * survives even for a student with a lot going on — there should always be a
 * way into the chat that is not about something they are finding hard.
 */
export function buildSuggestions(findings: TopicFinding[]): Suggestion[] {
  const personal: Suggestion[] = findings
    .slice(0, FINDING_TEMPLATES.length)
    // The label is the assignment title a teacher wrote, never free text from
    // the student or the model, so it is safe to put in a sentence as-is.
    .filter((f) => f.topic.label.trim().length > 0)
    .map((f, i) => ({
      id: `finding:${f.topic.id}`,
      key: FINDING_TEMPLATES[i],
      vars: { topic: f.topic.label },
    }));

  const generic: Suggestion[] = GENERIC_STARTERS.map((key) => ({ id: key, key }));

  // Generic chips fill whatever room is left, in their existing order, so the
  // no-evidence case is byte-for-byte the starters that shipped before.
  return [...personal, ...generic].slice(0, MAX_SUGGESTIONS);
}
