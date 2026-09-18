// Reading a project turn while it is still being written.
//
// A project turn answers in one JSON envelope — {operations, message,
// openFiles} — and JSON.parse is all-or-nothing, so the old buffered path had
// to wait for the last brace before it could say anything at all. For "explain
// this error" that is a second of silence. For "make a better version of
// cookie clicker" it is four files of generated code inside one request, which
// is exactly the job this tool exists for and exactly the job that did not fit
// inside the chain's budget: the student got "Panda is taking too long to
// answer right now" and no way to ask for less.
//
// So the envelope is read as it arrives instead. The model's own output is the
// only source of events here — an operation is announced when the model has
// actually written its path, and reported as finished when its closing brace
// has actually landed. Nothing is predicted, nothing is smoothed, and there is
// no invented step: a narration that runs ahead of the model would be a
// progress bar that lies, which is worse than the spinner it replaces.
//
// Two deliberate limits. The scanner is string-aware but not a JSON validator:
// it finds balanced {...} spans inside the operations array and hands each to
// JSON.parse, dropping anything that will not parse rather than trying to
// repair it. And a truncated reply keeps the operations that completed before
// the cut — the same salvage the client has always done for the buffered path
// (see components/build/recoverOperations.ts), done here as the stream ends so
// the student keeps the three files that did arrive.

import type { AgentResponse, FileOperation } from "@/types";
import { parseAgentResponse } from "./turn";
import { validateOperations } from "./validateOperations";

export type ProjectStreamEvent =
  /** The model has named a file and is writing its contents right now. */
  | { kind: "op_start"; type: FileOperation["type"]; path: string }
  /**
   * More of that file's contents just arrived.
   *
   * Only the NEW text, never the whole file so far. Re-sending the whole thing
   * on every chunk would make a 10KB file cost megabytes over the wire — the
   * stream turns quadratic on exactly the big generations this path exists to
   * make possible. The client appends.
   */
  | { kind: "op_delta"; path: string; delta: string }
  /** That operation is complete and safe to show. */
  | { kind: "op"; op: FileOperation }
  /** The envelope is finished (or the stream ended). Authoritative. */
  | {
      kind: "done";
      response: AgentResponse;
      /** The envelope never closed; `response` is what was salvaged. */
      truncated: boolean;
      /** Operations the validator refused, as student-safe sentences. */
      errors: string[];
    };

/** How much of the current object to look at when guessing its header. */
const HEADER_WINDOW = 4_000;

const TYPES = new Set<FileOperation["type"]>(["create", "modify", "delete", "rename", "generate"]);

/**
 * Walks the `"operations": [ ... ]` array across chunk boundaries.
 *
 * Resumable rather than rescanning the buffer each time: a model writing a
 * whole app emits hundreds of chunks, and re-reading everything on each one
 * turns a linear parse into a quadratic one on the exact request this work
 * exists to make possible.
 */
class OperationScanner {
  private raw = "";
  private cursor = 0;
  private arrayOpen = false;
  private depth = 0;
  private objectStart = -1;
  private inString = false;
  private escaped = false;
  private announced = false;
  /** Path of the object being written, once announced — deltas are keyed on it. */
  private announcedPath = "";
  /** How much of the current object's `content` string has already been sent. */
  private emitted = 0;
  /** Set once a closing brace arrives at depth 0 — the array is finished. */
  private finished = false;

  get text(): string {
    return this.raw;
  }

  push(chunk: string): ProjectStreamEvent[] {
    this.raw += chunk;
    const out: ProjectStreamEvent[] = [];
    if (this.finished) return out;

    if (!this.arrayOpen && !this.openArray()) return out;

    for (; this.cursor < this.raw.length; this.cursor++) {
      const ch = this.raw[this.cursor];

      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }

      if (ch === '"') {
        this.inString = true;
      } else if (ch === "{") {
        if (this.depth === 0) {
          this.objectStart = this.cursor;
          this.announced = false;
          this.announcedPath = "";
          this.emitted = 0;
        }
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.objectStart !== -1) {
          const chunkText = this.raw.slice(this.objectStart, this.cursor + 1);
          // Narrate before finishing. An object that opened and closed inside a
          // single chunk never reaches the tail of push(), so without this it
          // was announced and streamed by nobody: the student saw the file
          // appear whole at the end, which is the behaviour this path exists to
          // replace. It showed up only at large chunk sizes, which is why it
          // survived a test that fed the scanner one character at a time.
          this.narrate(chunkText, out);
          this.objectStart = -1;
          const op = parseOperation(chunkText);
          if (op) out.push({ kind: "op", op });
        } else if (this.depth < 0) {
          // The envelope's own closing brace: the array cannot grow again.
          this.finished = true;
          this.cursor++;
          return out;
        }
      } else if (ch === "]" && this.depth === 0) {
        this.finished = true;
        this.cursor++;
        return out;
      }
    }

    // Still inside an object: narrate as much of it as has arrived.
    if (this.depth > 0 && this.objectStart !== -1) {
      this.narrate(this.raw.slice(this.objectStart), out);
    }

    return out;
  }

  /**
   * Says which file is being written, and hands over whatever of its contents
   * has landed since the last time this ran.
   *
   * Called from two places and idempotent between them: mid-chunk, while the
   * object is still open, and again the instant its closing brace arrives. Both
   * are necessary. The first is what makes code appear as it is typed; the
   * second is what makes a small file -- one that opened and closed inside a
   * single chunk -- appear at all.
   *
   * Nothing here is predicted. It reads the same partial JSON the scanner is
   * already walking, so what the student sees is exactly what the model emitted,
   * decoded and nothing more.
   */
  private narrate(objectText: string, out: ProjectStreamEvent[]): void {
    if (!this.announced) {
      const header = readHeader(objectText.slice(0, HEADER_WINDOW));
      if (!header) return;
      this.announced = true;
      this.announcedPath = header.path;
      out.push({ kind: "op_start", ...header });
    }

    const decoded = readPartialContent(objectText);
    if (decoded !== undefined && decoded.length > this.emitted) {
      out.push({ kind: "op_delta", path: this.announcedPath, delta: decoded.slice(this.emitted) });
      this.emitted = decoded.length;
    }
  }

  /** Finds `"operations": [` and parks the cursor just after the bracket. */
  private openArray(): boolean {
    const match = /"operations"\s*:\s*\[/.exec(this.raw);
    if (!match) return false;
    this.arrayOpen = true;
    this.cursor = match.index + match[0].length;
    return true;
  }
}

/** One balanced object, validated. Undefined when it is not a usable operation. */
function parseOperation(text: string): FileOperation | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A complete-looking object that will not parse is not something we can
    // second-guess. Dropping it costs one file; repairing it risks writing
    // half a file over a good one.
    return undefined;
  }
  const { valid } = validateOperations([parsed as FileOperation]);
  return valid[0];
}

/**
 * As much of the current object's `content` string as can be decoded so far.
 *
 * The text arrives as a JSON string body that is, by definition, unfinished:
 * the closing quote has not been written and the last character may be half of
 * an escape sequence. So the body is walked with the same escape rules the
 * scanner uses, the cut is pulled back to the last position that is definitely
 * not mid-escape, and THAT is what JSON.parse is asked to decode. Parsing the
 * raw tail instead would throw on roughly every other chunk — a `\` or a
 * partial `\u00` at the boundary is the normal case, not the edge one.
 *
 * Undefined when the object has not reached its `content` key yet, which is
 * every delete and rename and the first moments of every create.
 */
function readPartialContent(text: string): string | undefined {
  const key = /"content"\s*:\s*"/.exec(text);
  if (!key) return undefined;
  const from = key.index + key[0].length;

  let i = from;
  // The last index that is safe to cut at: never inside an escape sequence.
  let safe = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      // \uXXXX needs six characters; everything else needs two. If the whole
      // sequence has not arrived, stop before it rather than inside it.
      const need = text[i + 1] === "u" ? 6 : 2;
      if (i + need > text.length) break;
      i += need;
      safe = i;
      continue;
    }
    if (ch === '"') break; // The string closed; the object will be parsed whole.
    i++;
    safe = i;
  }

  try {
    return JSON.parse(`"${text.slice(from, safe)}"`) as string;
  } catch {
    // A body we cannot decode is one we do not show. The complete object is
    // still parsed normally when its closing brace lands.
    return undefined;
  }
}

/**
 * The type and path of the object currently being written.
 *
 * Both have to be present before anything is said. A path on its own would put
 * a file on screen with no verb, and a verb on its own names nothing — and the
 * model writes them in that order, so waiting for the pair costs nothing.
 */
function readHeader(text: string): { type: FileOperation["type"]; path: string } | undefined {
  const type = /"type"\s*:\s*"([a-z]+)"/.exec(text)?.[1] as FileOperation["type"] | undefined;
  const path = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1];
  if (!type || !TYPES.has(type) || !path) return undefined;
  try {
    return { type, path: JSON.parse(`"${path}"`) as string };
  } catch {
    return undefined;
  }
}

/**
 * Turns a provider's raw token stream into events a panel can draw.
 *
 * The `done` event is the authority on what actually happened: when the
 * envelope parses, its operations replace everything streamed above, so a
 * malformed object that was announced mid-flight cannot survive into the
 * result. Only when the envelope never closes do the salvaged operations
 * stand on their own, and then `truncated` says so out loud.
 */
export async function* readProjectStream(
  chunks: AsyncIterable<string>,
): AsyncIterable<ProjectStreamEvent> {
  const scanner = new OperationScanner();
  const streamed: FileOperation[] = [];

  for await (const chunk of chunks) {
    if (!chunk) continue;
    for (const event of scanner.push(chunk)) {
      if (event.kind === "op") streamed.push(event.op);
      yield event;
    }
  }

  const raw = scanner.text;
  const parsed = parseAgentResponse(raw);
  const { valid, errors } = validateOperations(parsed.operations);

  // parseAgentResponse hands the whole raw reply back as `message` when the
  // JSON will not parse, which is how the wall of code used to reach the
  // transcript. If anything was salvaged, that is the better answer.
  const envelopeFailed = valid.length === 0 && streamed.length > 0;

  if (envelopeFailed) {
    yield {
      kind: "done",
      response: { operations: streamed, message: envelopeMessage(raw), openFiles: undefined },
      truncated: true,
      errors,
    };
    return;
  }

  yield {
    kind: "done",
    response: { operations: valid, message: parsed.message, openFiles: parsed.openFiles },
    truncated: false,
    errors,
  };
}

/** The envelope's own `"message"`, if it landed before the truncation did. */
function envelopeMessage(text: string): string {
  const match = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return "";
  }
}
