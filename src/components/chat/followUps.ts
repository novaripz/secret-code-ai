// Turning a finished reply into the two or three things a student would
// actually say next.
//
// The row under an assistant message used to be the same four chips forever:
// I don't understand / Give me a hint / Explain another way / Check my work.
// They are fine chips, but they are about the CONVERSATION, so they read the
// same under a proof, a code listing and a pep talk. A student scanning them
// learns quickly that they never refer to anything, and stops reading them.
//
// WHERE THESE COME FROM, AND WHY NOT THE MODEL. The obvious answer is to ask
// the model for three follow-ups. That is a second call — double the tokens
// and a second wait bolted onto the feature people already complain is slow —
// so the only acceptable version is the model emitting them inside the turn it
// is already streaming. The framed stream in ./frames.ts has no frame for
// that, and both the route and the system prompt that would have to grow one
// are outside this work. So these are derived on the client, here, from the
// text of the reply.
//
// Client-derived means the honesty bar is higher, not lower. A chip that only
// LOOKS specific is worse than a generic one, because the student trusted it.
// So every rule below keys off something structural the reply demonstrably
// contains — a numbered procedure, a fenced listing, a typeset expression, a
// bolded term, a question aimed back at them — and there is no rule that
// guesses at subject matter from prose. A reply with none of those structures
// yields nothing at all, and the caller falls back to the generic row, which is
// exactly what shipped before. That is the right failure: unchanged, not wrong.
//
// The parse is the same `parseMarkdown` the message body is rendered from, so
// a chip can never claim a code block the renderer did not draw, and detection
// does not drift from display as the markdown dialect grows.

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import type { StringKey } from "@/lib/i18n";
import { stripRemembered } from "./remember";

/**
 * One derived chip.
 *
 * `key`/`vars` are the label, resolved by the caller's `t` so this file has no
 * React and no locale in it. `prompt` is what lands in the transcript as the
 * student's turn, and stays English for the same reason `actionPrompt` does:
 * it is an instruction to the model, which is told separately what language to
 * answer in, and translating it here would send a sentence no catalogue has
 * been proof-read against.
 */
export interface FollowUp {
  /** Stable across renders; the React key. */
  id: string;
  key: StringKey;
  vars?: Record<string, string>;
  prompt: string;
}

/** Three is the ceiling here — the caller adds its own chips around these. */
const MAX_FOLLOW_UPS = 3;

/** A bold run long enough to be a phrase but short enough to be a term. */
const TERM_MAX_CHARS = 40;
const TERM_MAX_WORDS = 4;

function inlinesOf(block: Block): Inline[] {
  if (block.type === "p" || block.type === "h") return block.inlines;
  if (block.type === "ul" || block.type === "ol") return block.items.flatMap((i) => i.inlines);
  return [];
}

/**
 * The first bold run that reads like a piece of vocabulary.
 *
 * Models bold two very different things: a term they are introducing, and a
 * whole sentence they want to shout. Only the first is worth a "what does this
 * mean?" chip, and the difference is reliably length and punctuation — a term
 * is a few words with nothing sentence-shaped in it. A label ending in a colon
 * ("**Step 2:**") is a heading in disguise and is rejected too.
 *
 * Deliberately not language-aware: this measures shape, not meaning, so it
 * behaves the same whether the reply came back in English or Spanish.
 */
function firstTerm(blocks: Block[]): string | undefined {
  for (const block of blocks) {
    for (const inline of inlinesOf(block)) {
      if (inline.kind !== "bold") continue;
      const text = inline.text.trim().replace(/[:：]$/, "").trim();
      if (text.length < 2 || text.length > TERM_MAX_CHARS) continue;
      if (/[.!?;]/.test(text)) continue;
      if (text.split(/\s+/).length > TERM_MAX_WORDS) continue;
      return text;
    }
  }
  return undefined;
}

/** Does the reply put a question back to the student at the very end? */
function endsWithQuestion(text: string): boolean {
  // Only the last line, and only its final character. A question mark earlier
  // in a reply is usually the model restating what the student asked, and
  // "you asked how gravity works?" is not an invitation to answer anything.
  const last = text.trimEnd().split("\n").filter((l) => l.trim()).pop() ?? "";
  return /[?？]$/.test(last.trim());
}

/**
 * The chips a given reply has earned, in the order they should be offered.
 *
 * Ordered most-specific first: a chip naming a term the student just read beats
 * one about "that formula", which beats one about the reply as a whole. The
 * caller keeps its own chips around these, so this returns at most three.
 */
export function deriveFollowUps(content: string): FollowUp[] {
  // The memory marker is Panda talking to the app, not to the student, and it
  // is stripped before the reply is drawn — so it must be stripped before the
  // reply is read, or a bolded fact inside one becomes a chip about a marker
  // nobody can see.
  const text = stripRemembered(content);
  if (!text.trim()) return [];

  const blocks = parseMarkdown(text);
  const out: FollowUp[] = [];

  const term = firstTerm(blocks);
  if (term) {
    out.push({
      id: "term",
      key: "chat.followUpTerm",
      vars: { term },
      // The term is quoted back verbatim so the model answers about the word it
      // actually wrote, not about our paraphrase of it.
      prompt: `What does "${term}" mean? Explain just that word, not the whole thing again.`,
    });
  }

  // A numbered list is a procedure, and the first step is where a procedure
  // loses people. A two-item list is still a procedure; a one-item one is a
  // sentence with a number in front of it.
  if (blocks.some((b) => b.type === "ol" && b.items.length >= 2)) {
    out.push({
      id: "steps",
      key: "chat.followUpStep",
      prompt: "I'm stuck on the first step. Walk me through just that one, then stop.",
    });
  }

  // `open: false` means the fence actually closed, so this cannot fire on a
  // reply whose code block is still arriving.
  if (blocks.some((b) => b.type === "code" && !b.open && b.code.trim().length > 0)) {
    out.push({
      id: "code",
      key: "chat.followUpCode",
      prompt: "Walk me through what that code does, line by line, in plain words.",
    });
  }

  const hasMath =
    blocks.some((b) => b.type === "math") ||
    blocks.some((b) => inlinesOf(b).some((i) => i.kind === "math"));
  if (hasMath) {
    out.push({
      id: "formula",
      key: "chat.followUpFormula",
      // Asking where it comes from is a question the teaching ladder is happy
      // to answer in full — unlike "just give me the answer", which it would
      // decline, and which therefore has no business being offered as a chip.
      prompt: "Where does that formula come from? I want to know why it works, not just how to use it.",
    });
  }

  if (endsWithQuestion(text)) {
    out.push({
      id: "question",
      key: "chat.followUpAnswer",
      prompt: "I'm not sure how to answer your question. Can you make it smaller for me?",
    });
  }

  return out.slice(0, MAX_FOLLOW_UPS);
}
