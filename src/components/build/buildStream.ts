// The client half of the build agent's stream.
//
// The route writes newline-delimited JSON (see the STREAM FRAMING block in
// app/api/ai/route.ts). This turns those bytes into callbacks and nothing
// more: no React, no rendering decisions, no opinion about how long a status
// should linger. That split is what let the chat screen's own reader stay
// untouched — it speaks the prose dialect, this one speaks the operations
// dialect, and neither has to know about the other.
//
// Frames that do not validate are dropped rather than thrown on. A student
// should never lose four finished files because the server added a field this
// build has not heard of yet.

import { authHeader, authReady, deviceHeader } from "@/lib/security/device";
import type { FileOperation } from "@/types";

const TYPES = new Set<FileOperation["type"]>(["create", "modify", "delete", "rename", "generate"]);

/**
 * What a student reads when the clock ended the turn.
 *
 * Not a network error. The old behaviour sent them to check their wifi for a
 * problem that was never theirs, and threw away finished files while doing it.
 * These two sentences are written for the two real cases: work survived, or
 * nothing had been produced yet.
 */
const OUT_OF_TIME_WITH_WORK =
  "Panda ran out of time on this one. Here's what it finished — ask it to carry on from here.";
const OUT_OF_TIME_EMPTY =
  "Panda ran out of time before it finished anything. Try asking for a smaller piece first — one screen, or one feature — and then build on it.";

/** The file the model is writing at this moment, as it announced it. */
export interface OpStart {
  type: FileOperation["type"];
  path: string;
}

export interface BuildResult {
  operations: FileOperation[];
  message: string;
  openFiles?: string[];
  /** The model's reply was cut off; these are the files that finished. */
  truncated: boolean;
  /**
   * The turn ran out of time rather than finishing — either the server closed
   * the stream cleanly on its own deadline, or the socket died under us.
   *
   * Deliberately separate from `truncated`. That one means the JSON envelope
   * never closed: the model stopped mid-sentence. This one means the model was
   * still going fine and the clock is what ended it. The student is told two
   * different things, and only one of them is a reason to distrust the files.
   */
  interrupted?: boolean;
}

export interface BuildStreamHandlers {
  /** The model is reading the project and has produced nothing yet. */
  onThinking?: () => void;
  onOpStart: (op: OpStart) => void;
  /** More of the in-flight file's contents. The delta only — append it. */
  onOpDelta?: (path: string, delta: string) => void;
  /** One operation is complete, validated server-side, and safe to show. */
  onOp: (op: FileOperation) => void;
  /** Exactly one of these fires, last. */
  onDone: (result: BuildResult) => void;
  onError: (message: string) => void;
}

export interface BuildStreamRequest {
  prompt: string;
  fileTree: string;
  contextFiles: Record<string, string>;
  history: { role: "user" | "assistant"; content: string }[];
  explainMode?: boolean;
  /** How hard to work on this turn. See BUILD_EFFORT_ADDENDUM. */
  buildEffort?: string;
  /** One line per real asset. Never asset content — see lib/assets.ts. */
  assetManifest?: string;
  projectMemory?: string;
  studentProfile?: string;
  images?: { data: string; mimeType: string }[];
}

function asOperation(value: unknown): FileOperation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const op = value as Record<string, unknown>;
  const type = op.type as FileOperation["type"];
  if (!TYPES.has(type) || typeof op.path !== "string" || !op.path) return undefined;
  return {
    type,
    path: op.path,
    content: typeof op.content === "string" ? op.content : undefined,
    newPath: typeof op.newPath === "string" ? op.newPath : undefined,
    // A generate op carries its description instead of content. Dropping these
    // two would let the operation arrive looking complete and then fail at
    // apply time with nothing to generate from — the server has already
    // validated and flattened them, so what arrives here is a plain object of
    // scalars.
    generator: typeof op.generator === "string" ? op.generator : undefined,
    spec:
      op.spec && typeof op.spec === "object" && !Array.isArray(op.spec)
        ? (op.spec as Record<string, unknown>)
        : undefined,
  };
}

/**
 * One decoded line, dispatched. Returns the result frame when it was one.
 *
 * Exported for `npm run check`: the reader around it needs a browser fetch and a
 * relative URL, but this is where every frame's meaning is decided, and the
 * op_delta path in particular is what puts code on screen as it is written.
 */
export function handleFrame(value: unknown, handlers: BuildStreamHandlers): BuildResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const f = value as Record<string, unknown>;

  if (f.t === "status" && f.phase === "thinking") {
    handlers.onThinking?.();
    return undefined;
  }

  if (f.t === "op_start") {
    const type = f.opType as FileOperation["type"];
    if (TYPES.has(type) && typeof f.path === "string" && f.path) {
      handlers.onOpStart({ type, path: f.path });
    }
    return undefined;
  }

  if (f.t === "op_delta") {
    if (typeof f.path === "string" && f.path && typeof f.delta === "string") {
      handlers.onOpDelta?.(f.path, f.delta);
    }
    return undefined;
  }

  if (f.t === "op") {
    const op = asOperation(f.op);
    if (op) handlers.onOp(op);
    return undefined;
  }

  if (f.t === "done") {
    const operations = Array.isArray(f.operations)
      ? f.operations.map(asOperation).filter((o): o is FileOperation => o !== undefined)
      : [];
    return {
      operations,
      message: typeof f.message === "string" ? f.message : "",
      openFiles: Array.isArray(f.openFiles) ? f.openFiles.map(String) : undefined,
      truncated: f.truncated === true,
      interrupted: f.interrupted === true,
    };
  }

  if (f.t === "error" && typeof f.message === "string") {
    handlers.onError(f.message);
  }

  return undefined;
}

/**
 * Runs one build turn. Resolves when the stream is finished — the caller awaits
 * it so its "loading" state and the stream's life are the same thing.
 *
 * `fallbackError` is the caller's already-translated sentence, used when the
 * stream dies without ever saying why; every other failure arrives as an error
 * frame the server wrote for a student to read.
 */
export async function runBuildStream(
  req: BuildStreamRequest,
  handlers: BuildStreamHandlers,
  fallbackError: string,
  signal?: AbortSignal,
): Promise<void> {
  await authReady();

  const res = await fetch("/api/ai", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...deviceHeader(), ...authHeader() },
    body: JSON.stringify({ ...req, stream: true, events: true }),
  });

  if (!res.ok) {
    // A failure before the stream opens still comes back as ordinary JSON.
    const data = await res.json().catch(() => ({}));
    handlers.onError(typeof data.error === "string" ? data.error : fallbackError);
    return;
  }
  if (!res.body) {
    handlers.onError(fallbackError);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BuildResult | undefined;
  let failed = false;

  // Every operation the server already sent us, validated on its way out. If
  // the connection dies after this point these are real, finished files — the
  // whole reason the turn is streamed is so that they do not die with it.
  const received: FileOperation[] = [];

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return;
    }
    const done = handleFrame(value, {
      ...handlers,
      onOp: (op) => {
        received.push(op);
        handlers.onOp(op);
      },
      onError: (message) => {
        failed = true;
        handlers.onError(message);
      },
    });
    if (done) result = done;
  };

  /** The socket died, or the stream stopped without saying goodbye. */
  const endedEarly = () => {
    if (failed) return;
    if (received.length > 0) {
      handlers.onDone({
        operations: received,
        message: OUT_OF_TIME_WITH_WORK,
        truncated: false,
        interrupted: true,
      });
      return;
    }
    handlers.onError(OUT_OF_TIME_EMPTY);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buffer.indexOf("\n");
        if (nl < 0) break;
        consume(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
      if (done) break;
    }
    // A last line the server wrote without its newline (a torn connection,
    // a proxy cutting the tail) is still worth parsing.
    consume(buffer);
  } catch (err) {
    // The platform severed the connection mid-stream: `fetch`'s reader throws
    // and there will be no `done` frame, ever. That is the normal shape of a
    // build that outgrew its deadline, and it is NOT a reason to discard the
    // files that already arrived.
    //
    // A deliberate cancellation is different — the student asked for it, and
    // it is theirs to handle — so it goes back up untouched.
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
    console.warn("[build] the stream was cut mid-flight:", err);
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (result) {
    handlers.onDone(result);
    return;
  }
  // No `done` frame. Whether the socket was severed or the stream just stopped,
  // the absence of `done` is the normal shape of a build that ran out of time,
  // so it must not invalidate what preceded it.
  endedEarly();
}
