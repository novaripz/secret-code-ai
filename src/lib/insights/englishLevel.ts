// Estimating how much English a student is working in.
//
// The design decision is what we refuse to use. Not their name, not their
// country, not the interface language they picked, not their first language.
// Those predict nothing about a person's English and using them would build a
// machine that decides a Spanish-speaking kid needs easier work before he has
// typed a word. Only behaviour counts: which buttons he presses and how he
// writes when he writes in English.
//
// The output stays coarse on purpose. Button presses can honestly support
// four buckets and a shrug; they cannot support "B1.2".

import type { MessageAction } from "@/components/chat/MessageActions";
import type { Confidence, EnglishLevel, EnglishLevelEstimate, StruggleSignal } from "./types";

/** One thing the student wrote, with the language we believe it was in. */
export interface WritingSample {
  text: string;
  at: number;
  /**
   * Set when the app already knows (the composer's locale, say). Left
   * undefined we only look at shape, never at content, to guess.
   */
  language?: string;
}

/** Below this many pieces of evidence we say "unknown" and mean it. */
export const MIN_ENGLISH_EVIDENCE = 4;
export const CONFIDENT_ENGLISH_EVIDENCE = 10;

/**
 * Words that appear in almost any Spanish sentence. Used only to notice
 * code-switching *inside an English message*, which is a strength worth
 * knowing about, not to score anyone's Spanish.
 */
const SPANISH_MARKERS = /\b(que|porque|pero|como|cuando|esto|esta|para|muy|no\s+entiendo|s[ií]|tambi[eé]n|puedo|ayuda)\b/i;
const ENGLISH_MARKERS = /\b(the|and|is|to|of|what|how|because|but|this|that|with)\b/i;

function meanWordsPerSentence(text: string): number {
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return 0;
  const words = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  return words.reduce((a, b) => a + b, 0) / sentences.length;
}

/**
 * Estimate the working English level.
 *
 * Weighting, and why: translation requests are the clearest statement a
 * student can make that the English was the obstacle, so they pull the
 * estimate down hardest. "I don't understand" is ambiguous — it might be the
 * maths — so it pulls gently. Writing long English sentences of their own
 * pulls up, because producing is harder than reading.
 */
export function estimateEnglishLevel(
  signals: StruggleSignal[],
  samples: WritingSample[],
): EnglishLevelEstimate {
  const actions = signals.filter((s) => s.kind === "action" && s.action) as (StruggleSignal & {
    action: MessageAction;
  })[];
  const translates = actions.filter((s) => s.action === "translate").length;
  const simplifies = actions.filter((s) => s.action === "simplify").length;

  const english = samples.filter(
    (s) => s.language === "en" || (s.language === undefined && ENGLISH_MARKERS.test(s.text)),
  );
  const codeSwitches = samples.some(
    (s) => ENGLISH_MARKERS.test(s.text) && SPANISH_MARKERS.test(s.text),
  );
  const avgLen = english.length
    ? english.map((s) => meanWordsPerSentence(s.text)).reduce((a, b) => a + b, 0) / english.length
    : 0;

  const evidenceCount = translates + simplifies + samples.length;
  const reasons: string[] = [];

  if (evidenceCount < MIN_ENGLISH_EVIDENCE) {
    return {
      level: "unknown",
      evidenceCount,
      confidence: "watching",
      reasons: ["not enough to say yet"],
      codeSwitches,
    };
  }

  // Start in the middle and let behaviour move it. Neither end is a default.
  let score = 0;
  if (translates > 0) {
    score -= translates >= 4 ? 2 : 1;
    reasons.push(`asked for a translation ${translates} time${translates === 1 ? "" : "s"}`);
  }
  if (simplifies >= 3) {
    score -= 1;
    reasons.push(`pressed “I don’t understand” ${simplifies} times`);
  }
  if (english.length >= 2) {
    if (avgLen >= 12) {
      score += 2;
      reasons.push(`writes in English in full sentences (about ${Math.round(avgLen)} words)`);
    } else if (avgLen >= 6) {
      score += 1;
      reasons.push(`writes in English in short sentences (about ${Math.round(avgLen)} words)`);
    } else {
      reasons.push("writes in English in a few words at a time");
    }
  }
  if (codeSwitches) {
    // Explicitly not a penalty. Reaching for the word you have is what a
    // bilingual learner does, and the prompt layer leans into it.
    reasons.push("mixes English and Spanish in the same message");
  }

  const level: EnglishLevel =
    score <= -2 ? "emerging" : score <= 0 ? "developing" : score === 1 ? "intermediate" : "confident";

  const confidence: Confidence =
    evidenceCount >= CONFIDENT_ENGLISH_EVIDENCE ? "likely" : "watching";

  return { level, evidenceCount, confidence, reasons, codeSwitches };
}
