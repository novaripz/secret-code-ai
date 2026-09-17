// Catching the moment Panda answers a student with a line of its own briefing.
//
// This is a real incident, not a hypothetical. Against production, a student
// sent "question number 4, answer in five words" and Panda replied, in full,
// "Never steer the conversation toward programming." — a clause lifted verbatim
// out of CHAT_SYSTEM_PROMPT. In the same run of eight messages, "question
// number 5, answer in five words" came back as "Concept the question is really
// testing.", which is rung 2 of the ladder in TEACHING_POLICY with its list
// marker and leading "The" shaved off. A later run of fourteen equally
// degenerate prompts leaked nothing at all, so this is stochastic: the live
// chain leads with a low-reasoning-effort model on a system prompt that has
// grown long, and instruction regurgitation is that combination's known
// failure. It cannot be reproduced on demand, and it must not be treated as
// fixed because a given run came back clean.
//
// A prompt rule asking the model not to do this ships alongside this file, but
// a prompt rule is a hope, and this text is read by fourteen year olds. The
// server is the one party that holds both the instructions and the reply, so
// the server is where a leak is actually decidable.
//
// WHY WORD SPANS AND NOT LINES. The obvious rule — compare the reply against
// the prompt's lines — misses both real leaks. Neither was a line: the first
// was a clause out of the middle of "- Never steer the conversation toward
// programming unless they brought it up.", and the second dropped "2. The "
// from the front of its rung. So the prompt is flattened to one stream of
// normalised words, and a reply leaks when the words it OPENS with occur as a
// contiguous run somewhere in that stream. Position in the prompt is
// irrelevant; being the model's own briefing, read back out, is the offence.
//
// WHY ONLY THE OPENING. Both leaks were the whole reply, and a reply that
// starts as instruction text has already failed whatever it goes on to say.
// Scanning an entire reply instead would mean holding all of it back to
// decide, which trades a first-token cost on every message against a bug that
// fired twice in eight — see the streaming note on PromptLeakGuard.

import {
  BUILD_EFFORT_ADDENDUM,
  CHAT_SYSTEM_PROMPT,
  EXPLAIN_DEPTH_ADDENDUM,
  EXPLAIN_MODE_ADDENDUM,
  MODE_ADDENDUM,
  NO_ASSIGNMENT_ACCESS,
  NO_EXPLAIN_ADDENDUM,
  NOT_UNDERSTOOD,
  SYSTEM_PROMPT,
  TEACHING_POLICY,
} from "./systemPrompt";

/**
 * How much verbatim prompt text has to open a reply before it counts.
 *
 * Both thresholds must be met, and the pair is what makes a false positive
 * impossible for an ordinary sentence. The worked example is the one that
 * nearly broke this: "Their question is the topic." is a real sentence of the
 * prompt AND a sentence a student could sincerely say, so it has to stay
 * sayable. Normalised it is five words and twenty-seven characters — under
 * both floors, so it is safe twice over.
 *
 * The character floor is not redundant with the word floor. Six words of
 * ordinary connective English ("is it the one you were") is about twenty
 * characters, so demanding thirty-two characters across six words demands an
 * average word length above five: content words, not scaffolding. The two real
 * leaks clear it — forty-seven characters over six words, and thirty-eight
 * over six.
 *
 * Raising the floors further was tempting and is wrong. "Concept the question
 * is really testing." is only thirty-eight characters, so a round
 * sixty-character floor would have caught neither leak we actually measured.
 */
export const MIN_LEAK_WORDS = 6;
export const MIN_LEAK_CHARS = 32;

/**
 * What the student sees instead. One sentence, honest that something went
 * wrong, and useful — it asks for the thing that would have produced a better
 * answer. Silence would look like a hang, and a raw error tells a fourteen
 * year old nothing they can act on.
 *
 * It is deliberately also the right reply to the messages that triggered this:
 * "question number 4" with no question attached genuinely needs asking back.
 */
export const LEAK_REPLACEMENT =
  "Sorry — that came out wrong on my end. Can you say a bit more about what you're asking, or paste the question itself?";

/**
 * Lowercased, punctuation-free words.
 *
 * Case and punctuation are exactly what varied between the prompt and the
 * leaked text ("2. The concept…" came back as "Concept the…"), so neither may
 * be allowed to matter. Apostrophes are dropped rather than kept so that
 * "don't" and "dont" are one word, since which of the two a model emits is a
 * coin toss.
 */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Normalised length of a run of words, as the thresholds measure it. */
function charLength(words: string[]): number {
  return words.join(" ").length;
}

/**
 * A word that normalisation can never produce, so a run of words can never be
 * matched across the seam between two constants that are merely neighbours in
 * the list below.
 */
const SEAM = "SEAM";

/**
 * Every word of every instruction Panda can be given, in order.
 *
 * The static constants only. The assembled prompt also carries the student's
 * own adaptation text and a reply-language line built from their settings, and
 * those are excluded on purpose: they are prose ABOUT the student, which Panda
 * may legitimately echo back to them ("you've been finding quadratics hard"),
 * and folding them in would turn the one thing a student is allowed to hear
 * into a trigger. What leaked, and what we are answerable for, is the text we
 * wrote.
 */
/**
 * Drops the sentences the prompt puts in quotes.
 *
 * This is not a nicety, it is a correctness fix the checks caught. The prompt
 * hands Panda wording to actually say — `Say the helpful next thing instead:
 * "try the first step and tell me what you get"`, and `Something like: "I
 * can't see that assignment from here…"`. Those are the one category of prompt
 * text that is MEANT to reach a student, and with them in the corpus the guard
 * ate two replies that were doing exactly as they were told. A quoted span is
 * an example, not an instruction, so it is not instruction text for this
 * purpose.
 *
 * The span is capped so that an unpaired quote mark can only ever swallow a
 * sentence or two rather than a whole section of policy.
 */
function withoutQuotedExamples(text: string): string {
  return text.replace(/["“”][\s\S]{0,300}?["“”]/g, " ");
}

function corpusWords(): string[] {
  const sources = [
    SYSTEM_PROMPT,
    CHAT_SYSTEM_PROMPT,
    TEACHING_POLICY,
    EXPLAIN_MODE_ADDENDUM,
    NO_EXPLAIN_ADDENDUM,
    NOT_UNDERSTOOD,
    NO_ASSIGNMENT_ACCESS,
    ...Object.values(EXPLAIN_DEPTH_ADDENDUM),
    ...Object.values(BUILD_EFFORT_ADDENDUM),
    ...Object.values(MODE_ADDENDUM),
  ];
  const words: string[] = [];
  for (const source of sources) {
    words.push(...normalizeWords(withoutQuotedExamples(source)), SEAM);
  }
  return words;
}

const CORPUS = corpusWords();

/** Where each word occurs, so a candidate span is a lookup rather than a scan. */
const FIRST_WORD_INDEX = (() => {
  const index = new Map<string, number[]>();
  for (let i = 0; i < CORPUS.length; i++) {
    const at = index.get(CORPUS[i]);
    if (at) at.push(i);
    else index.set(CORPUS[i], [i]);
  }
  return index;
})();

/**
 * Does this text OPEN with instruction text, at or past the thresholds?
 *
 * The whole-reply form of the check, for callers that already hold the finished
 * text and for the checks. `undefined` means clean; a string is the verbatim
 * run that leaked, for the server log.
 */
export function leakedPromptText(reply: string): string | undefined {
  const words = normalizeWords(reply);
  if (words.length < MIN_LEAK_WORDS) return undefined;
  let starts = FIRST_WORD_INDEX.get(words[0]) ?? [];
  for (let n = 1; n <= words.length && starts.length > 0; n++) {
    if (n >= MIN_LEAK_WORDS && charLength(words.slice(0, n)) >= MIN_LEAK_CHARS) {
      return words.slice(0, n).join(" ");
    }
    starts = starts.filter((p) => CORPUS[p + n] === words[n]);
  }
  return undefined;
}

/**
 * The streaming form: the same check, decided as the words arrive.
 *
 * WHY THIS DOES NOT COST A FIRST TOKEN. Buffering a reply to inspect it was
 * rejected outright — time to first token is about a second today and every
 * student pays it on every message, which is a bad trade against a bug that
 * fired twice in eight messages. So nothing is buffered by default. Text is
 * held back only while it is STILL a verbatim run of the prompt, and released
 * the instant it stops being one, which for an ordinary reply is the first
 * chunk: "Hey!", "Sure —", "A quadratic is…" leave the corpus immediately and
 * are forwarded with nothing added to the wait.
 *
 * The honest cost, stated rather than hidden: a reply that opens on a word the
 * prompt also contains ("The", "You") is held for the one further chunk it
 * takes to diverge — tens of milliseconds, inside the animation frame the
 * client already coalesces chunks into. A reply whose opening really is
 * verbatim prompt text is held until it either clears the thresholds and is
 * replaced, or ends short of them and is released whole. That last case is the
 * only one that can delay a legitimate reply meaningfully, and it means the
 * reply was a short sentence that reads exactly like a line of the briefing.
 *
 * The guard disarms permanently on release, so the rest of the reply streams
 * with no check at all.
 */
export class PromptLeakGuard {
  private armed = true;
  private held = "";

  /**
   * Feeds a chunk in and gets back what may be shown now. When `leaked` is
   * true the caller must stop forwarding the model and say `LEAK_REPLACEMENT`
   * instead; `text` is empty in that case, because everything held back was
   * the leak.
   */
  push(chunk: string): { text: string; leaked: boolean } {
    if (!this.armed) return { text: chunk, leaked: false };
    this.held += chunk;

    const words = normalizeWords(this.held);
    // A chunk can end mid-word. Treating "programm" as a whole word would look
    // like a divergence and release the first half of a leak, so the trailing
    // fragment is matched as a prefix instead and only settles as a word when
    // the rest of it arrives.
    const partial = /[a-z0-9]$/i.test(this.held) && words.length > 0 ? words[words.length - 1] : "";
    const complete = partial ? words.slice(0, -1) : words;

    let starts = complete.length > 0 ? (FIRST_WORD_INDEX.get(complete[0]) ?? []) : undefined;
    for (let n = 1; n < complete.length && starts && starts.length > 0; n++) {
      starts = starts.filter((p) => CORPUS[p + n] === complete[n]);
    }
    if (starts !== undefined && partial) {
      starts = starts.filter((p) => (CORPUS[p + complete.length] ?? "").startsWith(partial));
    }
    if (starts === undefined) {
      if (partial) {
        // The very first word is still arriving. Judge it as a prefix of any
        // word in the prompt; most openings fail that at once and stream.
        const any = [...FIRST_WORD_INDEX.keys()].some((w) => w.startsWith(partial));
        return any ? { text: "", leaked: false } : this.release();
      }
      // Nothing but punctuation or whitespace so far — a fenced or bolded
      // reply starts this way. It cannot be judged yet and there is nothing
      // worth showing yet either, so it waits one chunk.
      return { text: "", leaked: false };
    }
    if (starts.length === 0) return this.release();

    if (complete.length >= MIN_LEAK_WORDS && charLength(complete) >= MIN_LEAK_CHARS) {
      this.armed = false;
      this.held = "";
      return { text: "", leaked: true };
    }
    return { text: "", leaked: false };
  }

  /** Whatever is still held when the model stops. A short run is not a leak. */
  flush(): string {
    const text = this.held;
    this.held = "";
    this.armed = false;
    return text;
  }

  private release(): { text: string; leaked: boolean } {
    this.armed = false;
    const text = this.held;
    this.held = "";
    return { text, leaked: false };
  }
}
