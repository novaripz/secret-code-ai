// Why this file exists: the agent's code was ending up in the transcript.
//
// A project turn asks the model for one JSON envelope — {operations, message} —
// and `parseAgentResponse` in lib/ai/turn.ts has a last-resort branch: if that
// JSON will not parse, it hands the ENTIRE raw model output back as `message`.
// The chat then renders that faithfully, so a reply that was truncated at the
// token limit, or wrapped in an apology, or written as prose-with-a-code-block
// because a smaller provider in the chain ignored the format, arrives as a wall
// of code the student has to read and retype. Nothing is applied, because
// `operations` came back empty.
//
// turn.ts is shared by every surface and is not ours to change, so the repair
// happens here, on the one client that actually wants file operations. Two
// recoveries, in order of confidence:
//
//   1. A truncated or fence-wrapped envelope. The operations that DID arrive
//      complete are salvaged by scanning the array element by element and
//      dropping the half-written tail. This is the common case: the model got
//      three files out and ran out of budget on the fourth.
//   2. Genuine prose with fenced code blocks. The model answered like a chat
//      assistant instead of an agent.
//
// The deliberate decision, for case 2 especially: recovered operations are
// PROPOSED, never applied automatically. In case 1 we are guessing that a
// truncated array was still meant as written; in case 2 we are guessing the
// destination file from a fence label. Either guess, applied silently, can
// overwrite work a student did by hand. An explicit Apply costs one click and
// keeps the blast radius in their hands — and the point of the fix is met
// either way, because the code leaves the transcript and becomes a reviewable
// action with a diff behind it.

import type { FileOperation } from "@/types";
import { validateOperations } from "@/lib/ai/validateOperations";

export interface Recovery {
  /** Safe, validated operations pulled back out of the text. */
  operations: FileOperation[];
  /** How they were found — the panel explains itself differently for each. */
  source: "truncated-envelope" | "code-block";
  /** Prose worth showing, if any survived. Never the code itself. */
  note: string;
}

/** A fence has to carry real weight before we treat it as a file. */
const MIN_BLOCK_LINES = 3;

/**
 * Last-resort filenames, used only when a fence names no path and there is
 * exactly one block of that language. A web project built by this app always
 * has these three, and guessing beyond them is how you clobber the wrong file.
 */
const DEFAULT_PATH: Record<string, string> = {
  html: "index.html",
  css: "style.css",
  js: "script.js",
  javascript: "script.js",
};

export function recoverOperations(message: string): Recovery | null {
  const text = message.trim();
  if (!text) return null;

  const fromEnvelope = salvageEnvelope(text);
  if (fromEnvelope) return fromEnvelope;

  return salvageCodeBlocks(text);
}

/**
 * Pulls whole objects out of an `"operations": [ ... ]` array without needing
 * the array — or the document — to be closed. JSON.parse is all-or-nothing, so
 * a reply cut off mid-file loses every file before the cut too; this scanner
 * gives those back.
 */
function salvageEnvelope(text: string): Recovery | null {
  const key = text.indexOf('"operations"');
  if (key === -1) return null;

  const open = text.indexOf("[", key);
  if (open === -1) return null;

  const chunks = scanObjects(text, open + 1);
  if (chunks.length === 0) return null;

  const parsed: FileOperation[] = [];
  for (const chunk of chunks) {
    try {
      parsed.push(JSON.parse(chunk) as FileOperation);
    } catch {
      // A complete-looking object that still will not parse is not something
      // we can second-guess. Drop it rather than repair it.
    }
  }

  const { valid } = validateOperations(parsed);
  if (valid.length === 0) return null;

  return { operations: valid, source: "truncated-envelope", note: envelopeMessage(text) };
}

/**
 * Walks the array body collecting balanced `{...}` spans. String-aware, because
 * file content is full of braces and backslashes and a naive depth count would
 * close the object halfway through a CSS rule.
 */
function scanObjects(text: string, from: number): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = from; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        chunks.push(text.slice(start, i + 1));
        start = -1;
      }
      // A closing brace at depth 0 is the envelope's own: the array is done.
      if (depth < 0) break;
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  return chunks;
}

/** The envelope's own `"message"`, if it landed before the truncation did. */
function envelopeMessage(text: string): string {
  const match = text.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return "";
  }
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;

/**
 * Prose with code in it. The path comes from the fence's info string first
 * ("```js script.js"), then from the line just above the fence, and only then
 * from the one-of-its-kind default.
 */
function salvageCodeBlocks(text: string): Recovery | null {
  const blocks: { lang: string; path: string | null; content: string }[] = [];

  FENCE.lastIndex = 0;
  for (let m = FENCE.exec(text); m; m = FENCE.exec(text)) {
    const info = m[1].trim();
    const content = m[2];
    if (content.split("\n").length < MIN_BLOCK_LINES) continue;
    // Only the run of prose since the previous fence counts as this block's
    // lead-in. Without that boundary the CSS block in "here is index.html …
    // and here is the CSS" inherits index.html from the paragraph above it,
    // and two blocks race to overwrite one file.
    const priorFence = text.lastIndexOf("```", Math.max(0, m.index - 1));
    const leadInStart = Math.max(priorFence === -1 ? 0 : priorFence + 3, m.index - 160);
    const before = text.slice(leadInStart, m.index);
    const [lang = "", ...rest] = info.split(/\s+/);
    blocks.push({
      lang: lang.toLowerCase(),
      path: pathLike(rest.join(" ")) ?? pathFromLeadIn(before, lang.toLowerCase()),
      content: content.replace(/\s+$/, ""),
    });
  }

  if (blocks.length === 0) return null;

  const langCount = new Map<string, number>();
  for (const b of blocks) langCount.set(b.lang, (langCount.get(b.lang) ?? 0) + 1);

  const proposed: FileOperation[] = [];
  const claimed = new Set<string>();
  for (const b of blocks) {
    const path = b.path ?? (langCount.get(b.lang) === 1 ? DEFAULT_PATH[b.lang] : undefined);
    // Two blocks pointing at one file means we guessed at least one of them
    // wrong, and applying the second over the first would quietly lose the
    // student a file. Take the first and leave the rest in the raw reply.
    if (!path || claimed.has(path)) continue;
    claimed.add(path);
    // "modify" rather than "create": applyOperations creates a missing file
    // anyway, and "modify" is the honest label for the common case of the model
    // rewriting index.html.
    proposed.push({ type: "modify", path, content: b.content });
  }

  const { valid } = validateOperations(proposed);
  if (valid.length === 0) return null;

  return { operations: valid, source: "code-block", note: proseAround(text) };
}

/** Anything that reads like a filename with a sensible extension. */
function pathLike(candidate: string): string | null {
  const cleaned = candidate.trim().replace(/^[("'`]+|[)"'`:,]+$/g, "");
  if (!cleaned) return null;
  return /^[\w./-]+\.[a-z0-9]{1,6}$/i.test(cleaned) && !cleaned.includes("..") ? cleaned : null;
}

/**
 * Extensions each fence language is allowed to claim. A name found in the prose
 * only counts if it matches the language of the block it introduces — otherwise
 * "here is index.html" two paragraphs up would name a stylesheet.
 */
const LANG_EXTENSIONS: Record<string, string[]> = {
  html: ["html", "htm"],
  css: ["css"],
  js: ["js", "mjs"],
  javascript: ["js", "mjs"],
  json: ["json"],
  ts: ["ts"],
  typescript: ["ts"],
  md: ["md"],
  markdown: ["md"],
};

/** A filename mentioned in the sentence introducing the block. */
function pathFromLeadIn(before: string, lang: string): string | null {
  const allowed = LANG_EXTENSIONS[lang];
  const words = before.replace(/[*`#]/g, " ").split(/\s+/).reverse();
  for (const word of words) {
    const path = pathLike(word);
    if (!path) continue;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    // An unlabelled fence has no language to check against, so it is trusted;
    // a labelled one has to agree with the name it picked up.
    if (!allowed || allowed.includes(ext)) return path;
  }
  return null;
}

/** The sentences between the fences, with every fenced block removed. */
function proseAround(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
