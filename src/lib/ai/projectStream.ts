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

const TYPES = new Set<FileOperation["type"]>(["create", "modify", "delete", "rename"]);

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
        }
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.objectStart !== -1) {
          const chunkText = this.raw.slice(this.objectStart, this.cursor + 1);
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

    // Still inside an object: say which file is being written, once we know.
    if (this.depth > 0 && this.objectStart !== -1 && !this.announced) {
      const header = readHeader(this.raw.slice(this.objectStart, this.objectStart + HEADER_WINDOW));
      if (header) {
        this.announced = true;
        out.push({ kind: "op_start", ...header });
      }
    }

    return out;
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
