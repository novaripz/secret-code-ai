// One place that talks to /api/ai and streams the reply back.
//
// Both the general chat and the per-assignment chat use this, so there is a
// single implementation of the parts that are easy to get subtly wrong:
// coalescing chunks into a frame, flushing the decoder's tail, and treating a
// deliberate stop as a stop rather than a failure.

export interface StreamRequest {
  prompt: string;
  history?: { role: "user" | "assistant"; content: string }[];
  images?: { data: string; mimeType: string }[];
  studentProfile?: string;
  explainMode?: boolean;
  explainDepth?: string;
  humanize?: boolean;
  aiHomie?: boolean;
  learningMode?: string;
  simplify?: boolean;
  replyLanguage?: string;
  /** Assignment context, only sent from a class chat. */
  assignmentContext?: string;
}

export interface StreamHandlers {
  /** Fires once, when the first byte arrives. */
  onStart?: () => void;
  onChunk: (text: string) => void;
  /** `error` is undefined on success and on a deliberate stop. */
  onDone: (error?: string) => void;
}

export interface StreamHandle {
  /** Cancels in flight. The text already delivered stays. */
  stop: () => void;
}

export function streamChat(req: StreamRequest, handlers: StreamHandlers): StreamHandle {
  const controller = new AbortController();

  void (async () => {
    let pending = "";
    let frame = 0;
    let started = false;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      handlers.onChunk(pending);
      pending = "";
    };

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, chatOnly: true, stream: true, fileTree: "", contextFiles: {} }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        handlers.onDone(data.error ?? "That didn't go through.");
        return;
      }
      if (!res.body) {
        handlers.onDone("The reply came back empty.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (!text) continue;
          if (!started) {
            started = true;
            handlers.onStart?.();
          }
          // Chunks can outpace the display. Coalescing within a frame cuts
          // renders without holding anything back: a frame is the screen's
          // own tick, not an added delay.
          pending += text;
          if (!frame) frame = requestAnimationFrame(flush);
        }
      } finally {
        if (frame) cancelAnimationFrame(frame);
        flush();
        const tail = decoder.decode();
        if (tail) handlers.onChunk(tail);
      }

      handlers.onDone(started ? undefined : "The reply came back empty.");
    } catch (err) {
      // Stopping on purpose is a choice, not an error.
      if (err instanceof DOMException && err.name === "AbortError") {
        handlers.onDone();
        return;
      }
      handlers.onDone(err instanceof Error ? err.message : "Panda couldn't reach the server.");
    }
  })();

  return { stop: () => controller.abort() };
}
