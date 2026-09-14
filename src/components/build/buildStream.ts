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

const TYPES = new Set<FileOperation["type"]>(["create", "modify", "delete", "rename"]);

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
}

export interface BuildStreamHandlers {
  /** The model is reading the project and has produced nothing yet. */
  onThinking?: () => void;
  onOpStart: (op: OpStart) => void;
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
  };
}

/** One decoded line, dispatched. Returns the result frame when it was one. */
function handle(value: unknown, handlers: BuildStreamHandlers): BuildResult | undefined {
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

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return;
    }
    const done = handle(value, {
      ...handlers,
      onError: (message) => {
        failed = true;
        handlers.onError(message);
      },
    });
    if (done) result = done;
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
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (result) {
    handlers.onDone(result);
    return;
  }
  // No `done` frame and no error frame: the stream simply stopped. Saying so
  // is better than leaving the panel waiting on something that will not come.
  if (!failed) handlers.onError(fallbackError);
}
