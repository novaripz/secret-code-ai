import type { AgentResponse, FileOperation } from "@/types";
import type { AgentRequest, ImageAttachment } from "./provider";
import { PROJECT_NOTES_PATH } from "./projectNotes";
import { buildSystemPrompt, CHAT_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./systemPrompt";

// How a request becomes a turn: the system prompt, the text of the message, and
// how the answer is read back out.
//
// None of this belongs to a particular provider. A student's answer must not
// change depending on which backend happened to be fastest this minute, so
// every provider shares this file and differs only in transport.

export function systemInstructionFor(req: AgentRequest): string {
  return buildSystemPrompt(req.chatOnly ? CHAT_SYSTEM_PROMPT : SYSTEM_PROMPT, {
    explainMode: req.explainMode,
    explainDepth: req.explainDepth,
    learningMode: req.learningMode,
    simplify: req.simplify,
    hasAssignmentContext: Boolean(req.assignmentContext),
    replyLanguage: req.replyLanguage,
    aiHomie: req.aiHomie,
    humanize: req.humanize,
    adaptation: req.adaptation,
    // Project turns only. A chat turn has nothing to build, so it gets no
    // effort text at all rather than a default one.
    buildEffort: req.chatOnly ? undefined : (req.buildEffort ?? "normal"),
  });
}

/** Chat is allowed a voice; a project turn is writing code someone has to run. */
export function temperatureFor(req: AgentRequest): number {
  if (!req.chatOnly) return 0.4;
  return req.aiHomie ? 1.0 : 0.8;
}

export function buildUserTurnText(req: AgentRequest): string {
  // PANDA.md is lifted out of the file list and given its own heading, high up.
  //
  // Buried among "RELEVANT FILE CONTENTS" it reads as one more source file to
  // be edited. It is not: it is what the last model concluded about this
  // project, and this model -- which is very often a different one, since the
  // chain picks whoever answers first -- should start from it rather than
  // re-deriving it. Stated before the tree and the source so it frames them.
  const { [PROJECT_NOTES_PATH]: notes, ...otherFiles } = req.contextFiles;
  const contextBlock = Object.entries(otherFiles)
    .map(([path, content]) => `--- FILE: ${path} ---\n${content}`)
    .join("\n\n");

  const parts = [
    req.studentProfile ? `WHAT WE KNOW ABOUT THE USER (remember this across every chat and project):\n${req.studentProfile}` : "",
    notes
      ? `THIS PROJECT'S BRIEF (${PROJECT_NOTES_PATH}, written by you on an earlier turn — trust it, ` +
        `and correct it in this turn's operations if the project has moved on):\n${notes}`
      : "",
    req.projectMemory ? `WHAT WE'VE ALREADY BUILT IN THIS PROJECT (working memory):\n${req.projectMemory}` : "",
    `PROJECT FILE TREE:\n${req.fileTree}`,
    // The assets, as a list rather than as content. See assetManifest().
    req.assetManifest ? `REAL ASSETS IN THIS PROJECT:\n${req.assetManifest}` : "",
    contextBlock ? `RELEVANT FILE CONTENTS:\n${contextBlock}` : "RELEVANT FILE CONTENTS: (none selected)",
    imageNote(req),
    `STUDENT'S REQUEST:\n${req.prompt}`,
  ].filter(Boolean);

  return parts.join("\n\n");
}

/** Text-only turn for plain conversation: no file tree, no operations. */
export function buildChatTurnText(req: AgentRequest): string {
  const parts = [
    req.studentProfile ? `WHAT YOU KNOW ABOUT THE USER:\n${req.studentProfile}` : "",
    req.assignmentContext ? `THE ASSIGNMENT THEY ARE WORKING ON:\n${req.assignmentContext}` : "",
    imageNote(req),
    `USER:\n${req.prompt}`,
  ].filter(Boolean);
  return parts.join("\n\n");
}

/** Tells the model what it's looking at, so attached images aren't ignored. */
function imageNote(req: AgentRequest): string {
  const count = allImages(req).length;
  if (count === 0) return "";
  return count === 1
    ? "The user attached an image (a screenshot or photo) — look at it before answering."
    : `The user attached ${count} images — look at all of them before answering.`;
}

/** Back-compat: `image` is the single-attachment form, `images` the newer list. */
export function allImages(req: AgentRequest): ImageAttachment[] {
  const images = req.images ?? [];
  if (req.image && !images.some((i) => i.data === req.image!.data)) return [req.image, ...images];
  return images;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

/**
 * What a student is told when nothing at all could be read back.
 *
 * One honest sentence, and never the model's raw output: the whole point of
 * the floor below is that a failure to parse is our problem to describe, not a
 * blob of JSON for a thirteen-year-old to decode.
 */
const NOTHING_USABLE =
  "Panda's answer came back in a shape this app couldn't read. Ask again — it usually works the second time.";

/**
 * The shape we refuse to put on screen: a JSON object that is, or is trying to
 * be, the turn envelope.
 *
 * Quote style is left loose on purpose: an envelope the repair pass refused to
 * touch — single-quoted keys, say — is still an envelope, and the whole point
 * of this guard is that it does not care HOW the JSON was malformed.
 *
 * Anchored at the start of the text (after an optional code fence) on purpose.
 * A reply that merely CONTAINS a JSON example -- "here is what package.json
 * should look like" -- is a legitimate answer and must still render; only a
 * reply that IS the envelope is caught here.
 */
const ENVELOPE_SHAPE =
  /^\s*(?:```(?:json)?\s*)?\{[\s\S]*?["'\u201C](?:operations|message|openFiles)["'\u201D]\s*:/;

/**
 * The hard floor. Every message this module hands to a UI goes through here.
 *
 * This is the bug that reached a classroom: a student asked "where did you put
 * all my jquery" and the studio printed `{"operations": [], "message": "Your
 * jQuery is still right here..."` into the transcript, verbatim, as Panda's
 * reply. The cause was a literal newline inside the message string (JSON
 * forbids raw control characters in a string, so `JSON.parse` threw on the
 * first one), and the catch branch here handed the whole raw envelope back as
 * prose.
 *
 * The repair below fixes that particular fault and several of its neighbours,
 * but a repair is a guess and guesses run out. So the guarantee is placed here
 * instead of in any one branch: it does not matter how the parse failed or
 * which recovery gave up, nothing that looks like an envelope can get past this
 * function. Exported so the other surfaces that render model prose can share
 * the same floor rather than each re-deriving it.
 */
export function studentSafeMessage(message: string, fallback: string = NOTHING_USABLE): string {
  const text = message.trim();
  if (!text) return fallback;
  if (!ENVELOPE_SHAPE.test(text)) return text;
  // It is an envelope. One last chance: if a `"message"` value can be pulled
  // out of it heuristically, that prose is what the student was meant to read.
  const salvaged = extractMessageValue(text);
  return salvaged && !ENVELOPE_SHAPE.test(salvaged) ? salvaged : fallback;
}

/**
 * Mechanically repairs the faults models actually commit when writing JSON,
 * and nothing else.
 *
 * Written as a single string-aware pass rather than a set of regexes, for the
 * same reason `projectStream.ts` walks the envelope character by character: a
 * regex that escapes newlines, or strips a trailing comma, cannot tell the
 * difference between the envelope's own punctuation and the contents of an
 * HTML file the model is writing into `content`. `/,\s*}/` would happily
 * rewrite a student's JavaScript. Inside a string we only ever touch
 * characters that JSON forbids there outright, so legitimate content cannot
 * change meaning.
 *
 * What is repaired, each because it has been seen in the wild:
 *   - literal newlines, carriage returns, tabs and other control characters
 *     inside a string (the jQuery failure above, and by far the most common);
 *   - a backslash that opens no valid escape, which is what a Windows path or
 *     a regex in generated code turns into;
 *   - trailing commas before `}` or `]`;
 *   - smart quotes used as delimiters, which a model that was "prettifying"
 *     its own output emits;
 *   - a reply cut off mid-string or mid-object, closed here so the operations
 *     that DID arrive can still be parsed out.
 *
 * Deliberately NOT repaired: single-quoted strings, unquoted keys, and
 * comments. All three are ambiguous against file content, and all three would
 * mean rewriting text inside strings, which is the one thing this pass will
 * not do.
 */
export function repairJsonText(text: string): string {
  return repairJson(text).text;
}

/**
 * The repair, plus the one fact the caller needs about it: whether the reply
 * had to be CLOSED to become parseable.
 *
 * That distinction decides whether the operations can be believed. A reply
 * that merely mis-escaped a character is complete, and every file in it is
 * whole. A reply that stopped mid-object is not: closing its braces here would
 * turn half a file into a file, and a student clicking Apply would overwrite a
 * good one with a truncated one. So the caller keeps the message and throws
 * the operations back to the salvage paths, which know how to drop the tail.
 */
function repairJson(text: string): { text: string; closed: boolean } {
  let out = "";
  let inString = false;
  /** Which quote character opened the current string: `"` or a smart quote. */
  let openedWith = '"';
  let escaped = false;
  const closers: string[] = [];

  const dropTrailingComma = () => {
    out = out.replace(/,\s*$/, "");
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        const next = text[i + 1];
        // A trailing backslash is half of an escape the model never finished
        // writing; keeping it would break the string we are about to close.
        if (next === undefined) continue;
        if (!'"\\/bfnrtu'.includes(next)) {
          // Not a JSON escape at all, so the model meant a literal backslash.
          out += "\\\\";
          continue;
        }
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === openedWith) {
        out += '"';
        inString = false;
        continue;
      }
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch < " ") out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      else out += ch;
      continue;
    }

    if (ch === '"' || ch === "“" || ch === "”") {
      // Outside a string there is no such thing as a legitimate curly quote in
      // JSON, so one here can only be a delimiter the model typeset wrongly.
      inString = true;
      openedWith = ch === "“" ? "”" : ch;
      out += '"';
      continue;
    }
    if (ch === "{" || ch === "[") {
      closers.push(ch === "{" ? "}" : "]");
      out += ch;
      continue;
    }
    if (ch === "}" || ch === "]") {
      closers.pop();
      dropTrailingComma();
      out += ch;
      continue;
    }
    out += ch;
  }

  // Whatever the reply was cut off in the middle of, close it: an unterminated
  // string first, then every container still open, outermost last.
  if (inString) out += '"';
  dropTrailingComma();
  const closed = closers.length > 0;
  while (closers.length > 0) out += closers.pop();
  return { text: out, closed };
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The envelope's `"message"` value pulled out of text that will not parse.
 *
 * Scans to the closing quote with the same escape rules the repair pass uses,
 * tolerating the raw newlines that broke the parse in the first place, then
 * lets the repair pass hand a decodable string body to JSON.parse. Returns ""
 * when there is nothing to find, which the caller reads as "show the sentence".
 */
function extractMessageValue(text: string): string {
  const key = /"message"\s*:\s*"/.exec(text);
  if (!key) return "";
  const from = key.index + key[0].length;

  let i = from;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === '"') break;
  }

  const decoded = tryParse(repairJsonText(`"${text.slice(from, Math.min(i, text.length))}"`));
  return typeof decoded === "string" ? decoded.trim() : "";
}

export function parseAgentResponse(raw: string): AgentResponse {
  const candidate = extractJson(raw);
  // Three readings, in descending order of confidence: as written, repaired,
  // and -- in `studentSafeMessage` below -- as prose scraped out of the wreck.
  // Repairing matters as much for `operations` as for the message: a turn that
  // wrote four files and then put a literal newline in its last string used to
  // lose all four, silently, because JSON.parse is all-or-nothing.
  let parsed = tryParse(candidate);
  // True when the envelope only parsed because the repair pass closed it —
  // see repairJson. Its operations are not to be trusted.
  let wasCutShort = false;
  if (parsed === undefined) {
    const repaired = repairJson(candidate);
    parsed = tryParse(repaired.text);
    wasCutShort = parsed !== undefined && repaired.closed;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    // Not an object at all. If the model answered in plain prose that is a
    // perfectly good reply and is shown as-is; if it answered with an envelope
    // we could not read, the floor turns it into words.
    return { operations: [], message: studentSafeMessage(raw) };
  }
  const obj = parsed as Record<string, unknown>;
  // An object with neither key is not this turn's envelope: it is a JSON
  // snippet the model quoted inside an otherwise prose answer, which
  // `extractJson` happily scooped out from between the first `{` and the last
  // `}`. Answering with its (absent) `message` would blank a perfectly good
  // reply, so the prose itself is what the student reads.
  if (!Array.isArray(obj.operations) && typeof obj.message !== "string") {
    return { operations: [], message: studentSafeMessage(raw) };
  }
  // A cut-off envelope keeps its message and loses its operations, on purpose.
  // The streamed path (lib/ai/projectStream.ts) and the panel's second reading
  // (components/build/recoverOperations.ts) both salvage a truncated array by
  // scanning it object by object and dropping the half-written tail, and both
  // read an empty `operations` here as their cue to do so. Handing them a
  // brace-closed guess instead would hide the truncation and propose a file
  // that stops mid-line as if it were finished.
  const rawOps = !wasCutShort && Array.isArray(obj.operations) ? obj.operations : [];
  const operations: FileOperation[] = rawOps
    .filter((op): op is Record<string, unknown> => typeof op === "object" && op !== null)
    .map((op) => ({
      type: op.type as FileOperation["type"],
      path: String(op.path ?? ""),
      content: typeof op.content === "string" ? op.content : undefined,
      newPath: typeof op.newPath === "string" ? op.newPath : undefined,
      // A generate operation carries its description instead of content.
      // Dropping these was silent and total: the streamed op frames showed the
      // right generator, and then this -- the AUTHORITATIVE envelope, the one
      // whose operations replace everything streamed -- handed the validator an
      // operation with no generator at all, which it correctly refused as
      // "unknown generator". Every generated asset was thrown away at the last
      // step, with an error message that pointed at the model rather than here.
      generator: typeof op.generator === "string" ? op.generator : undefined,
      spec:
        op.spec && typeof op.spec === "object" && !Array.isArray(op.spec)
          ? (op.spec as Record<string, unknown>)
          : undefined,
    }));
  const message = typeof obj.message === "string" ? obj.message : "";
  return {
    operations,
    // An envelope that parsed but carries no message is not a failure when it
    // carries operations -- the panel narrates those itself -- so the empty
    // string is preserved rather than replaced with an apology.
    message: operations.length > 0 ? studentSafeMessage(message, "") : studentSafeMessage(message),
    openFiles: Array.isArray(obj.openFiles) ? obj.openFiles.map(String) : undefined,
  };
}
