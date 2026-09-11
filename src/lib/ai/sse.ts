// Server-sent events arrive as network chunks, not as lines. One read can end
// halfway through a `data:` field and the next read carries the rest, and a
// single read can just as easily hold three whole events. Framing is kept here,
// away from the chat adapter, because getting it wrong does not look like an
// error: it looks like a reply that is quietly missing a word.

/** The frame every OpenAI-compatible stream ends with. */
export const SSE_DONE = "[DONE]";

/**
 * Feeds decoded text in, gets the payload of each complete `data:` field back,
 * and holds an unterminated tail until the rest of it arrives.
 */
export class SseBuffer {
  private tail = "";

  push(chunk: string): string[] {
    this.tail += chunk;
    const payloads: string[] = [];
    for (;;) {
      const end = lineBreakAt(this.tail);
      if (end === -1) break;
      const line = this.tail.slice(0, end);
      // CRLF is one break, not two.
      this.tail = this.tail.slice(end + (this.tail.startsWith("\r\n", end) ? 2 : 1));
      const payload = dataPayload(line);
      if (payload) payloads.push(payload);
    }
    return payloads;
  }

  /**
   * Whatever is left when the stream ends. A well-behaved server terminates its
   * last event, but a missing final newline should not cost the reader a word.
   */
  flush(): string[] {
    const line = this.tail;
    this.tail = "";
    const payload = dataPayload(line);
    return payload ? [payload] : [];
  }
}

function lineBreakAt(text: string): number {
  const lf = text.indexOf("\n");
  const cr = text.indexOf("\r");
  if (lf === -1) return cr;
  if (cr === -1) return lf;
  return Math.min(lf, cr);
}

/** Everything that is not a `data:` field — comments, `event:`, `id:` — is not ours. */
function dataPayload(line: string): string {
  if (!line.startsWith("data:")) return "";
  return line.slice(5).trim();
}
