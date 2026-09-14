// Reading the framed reply stream from /api/ai.
//
// The route can answer in two shapes. Without `events: true` it writes raw
// prose, and there is nowhere in raw prose to say "I am searching the web"
// without that sentence landing in the transcript as if Panda had typed it.
// With `events: true` it writes newline-delimited JSON instead — one object
// per line — and progress becomes data the interface can draw.
//
// This file is the client half of that contract and nothing more. It does not
// decide what a phase looks like or how long it lingers; it turns bytes into
// the frames the route documents, and hands anything it does not recognise
// back as nothing at all.
//
// WHY A PARSER HERE RATHER THAN IN lib/ai/streamChat: streamChat is the shared
// caller for the class chat and still speaks the raw-prose dialect; changing
// its wire format would change a surface this work does not cover. The chat
// screen does its own fetch already, so the framed dialect is added where it
// is actually consumed. If the class chat later wants progress too, this
// module is the piece to lift — it has no React and no chat-screen knowledge.

/** One citation, exactly as the route's `sources` frame carries it. */
export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

/**
 * The phases the server genuinely distinguishes.
 *
 * Deliberately not a superset: every value here is emitted by a real code path
 * in the route, and there is no phase invented to fill a gap in the UI. A
 * state the server never sends is a state that would either never appear or,
 * worse, appear as a guess about what Panda is doing.
 */
export type Phase = "thinking" | "searching" | "reading" | "search_failed";

export type Frame =
  | { t: "text"; v: string }
  | { t: "status"; phase: Phase; query?: string; count?: number; reason?: string }
  | { t: "sources"; items: Source[] }
  | { t: "error"; message: string };

const PHASES = new Set<Phase>(["thinking", "searching", "reading", "search_failed"]);

function asSource(value: unknown): Source | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  // A citation with no URL is not a link, and a link is the whole point.
  if (typeof s.url !== "string" || s.url.length === 0) return undefined;
  // Only http(s). A `javascript:` or `data:` href from a compromised tool
  // result would be a script the student clicks on, and rendering it as an
  // ordinary-looking source link is exactly how that gets clicked.
  if (!/^https?:\/\//i.test(s.url)) return undefined;
  const title = typeof s.title === "string" && s.title.trim() ? s.title.trim() : s.url;
  return {
    title,
    url: s.url,
    snippet: typeof s.snippet === "string" ? s.snippet : undefined,
  };
}

/**
 * Validate one decoded line into a Frame, or `undefined` if it is not one.
 *
 * Unknown `t` values are dropped rather than thrown on, because the server is
 * free to add a frame type before this client knows about it and a student
 * should not lose a working answer over a field they cannot see.
 */
function toFrame(value: unknown): Frame | undefined {
  if (!value || typeof value !== "object") return undefined;
  const f = value as Record<string, unknown>;

  if (f.t === "text") return typeof f.v === "string" ? { t: "text", v: f.v } : undefined;

  if (f.t === "status") {
    const phase = f.phase as Phase;
    if (!PHASES.has(phase)) return undefined;
    return {
      t: "status",
      phase,
      query: typeof f.query === "string" ? f.query : undefined,
      count: typeof f.count === "number" ? f.count : undefined,
      reason: typeof f.reason === "string" ? f.reason : undefined,
    };
  }

  if (f.t === "sources") {
    const items = Array.isArray(f.items)
      ? f.items.map(asSource).filter((s): s is Source => s !== undefined)
      : [];
    return items.length > 0 ? { t: "sources", items } : undefined;
  }

  if (f.t === "error") {
    // The route's error frames are already written for a student to read, so
    // the message passes through untouched rather than being re-worded here.
    return typeof f.message === "string" ? { t: "error", message: f.message } : undefined;
  }

  return undefined;
}

/**
 * A stateful splitter for the NDJSON stream.
 *
 * Created once per request and fed every decoded chunk. It holds the tail of a
 * line that a chunk boundary cut in half — the common case, since network
 * chunks have nothing to do with frame boundaries — and only emits a frame
 * once its terminating newline has actually arrived.
 *
 * `end()` exists because a stream can close on a final line the server wrote
 * without its newline (a crash mid-write, a proxy truncating). Parsing that
 * tail recovers the last frame when it happens to be complete, and silently
 * drops it when it is not, which is better than discarding a whole reply.
 */
export function frameReader() {
  let buffer = "";

  const parse = (line: string): Frame | undefined => {
    const trimmed = line.trim();
    if (!trimmed) return undefined;
    try {
      return toFrame(JSON.parse(trimmed));
    } catch {
      // A line that is not JSON is not recoverable and not worth an error on
      // screen; the reply around it still renders.
      return undefined;
    }
  };

  return {
    /** Frames completed by this chunk, in order. */
    push(chunk: string): Frame[] {
      buffer += chunk;
      const out: Frame[] = [];
      for (;;) {
        const nl = buffer.indexOf("\n");
        if (nl < 0) break;
        const frame = parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (frame) out.push(frame);
      }
      return out;
    },
    /** Whatever a missing final newline left behind. */
    end(): Frame[] {
      const rest = buffer;
      buffer = "";
      const frame = parse(rest);
      return frame ? [frame] : [];
    },
  };
}
