"use client";

// One reply, from the request leaving to the stream closing.
//
// This used to live inside the chat component, which tied a reply to the
// screen it started on: the component held the abort controller, the progress
// line and the citations in its own state, so leaving the chat lost the Stop
// button and coming back showed a reply arriving with nothing to say what was
// happening. It is a plain async function now, and everything it touches is
// in the assistant store keyed by thread — so a reply keeps going while the
// student looks at their plan, and is finished and saved in the chat it
// belongs to when they come back.
//
// The thread id is captured once, at send time, and every write names it. That
// is the whole fix for a reply landing in whichever chat happened to be open.

import { authHeader, authReady, deviceHeader } from "@/lib/security/device";
import { useAssistantStore } from "@/store/useAssistantStore";
import { frameReader, type Frame } from "./frames";
import { parseRemembered } from "./remember";

export interface ReplyRequest {
  threadId: string;
  /** What the model is asked: the typed text plus any attached text. */
  prompt: string;
  images: { data: string; mimeType: string }[];
  /** Earlier turns, oldest first, NOT including this one. */
  history: { role: "user" | "assistant"; content: string }[];
  simplify?: boolean;
  explainMode: boolean;
  explainDepth: string;
  replyLanguage: string;
  studentProfile: string;
  adaptation: string;
  /** Student-facing sentences for the failures this function can name. */
  messages: { chatFailed: string; emptyReply: string; offline: string };
  /** Called with the facts a finished reply asked Panda to keep. */
  onRemember?: (facts: string[]) => void;
}

/**
 * What a thrown error should say to a thirteen-year-old.
 *
 * `err.message` was shown as-is, which put "Failed to fetch" and
 * "NetworkError when attempting to fetch resource" in front of students. A
 * thrown fetch means the request never got an answer, and the only useful
 * thing to know about that is whether the device is offline.
 */
function friendly(err: unknown, m: ReplyRequest["messages"]): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return m.offline;
  if (err instanceof TypeError) return m.offline;
  return m.chatFailed;
}

export async function runReply(req: ReplyRequest): Promise<void> {
  const store = useAssistantStore.getState;
  const { threadId } = req;
  const controller = store().beginRequest(threadId);
  // What Panda is doing, set the moment a message is sent rather than when the
  // server first speaks, because the wait starts at the button, not at the
  // first byte.
  store().setActivity(threadId, { phase: "thinking" });

  try {
    await authReady();

    const res = await fetch("/api/ai", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...deviceHeader(), ...authHeader() },
      body: JSON.stringify({
        prompt: req.prompt || "(the user sent attachments with no message)",
        chatOnly: true,
        stream: true,
        // Opt into the framed (newline-delimited JSON) stream. Without this
        // the route writes raw prose and there is no channel for progress —
        // and, on a deployment with search configured, no tool calling
        // either, precisely because a client that cannot draw progress
        // should not be made to wait through an invisible round-trip.
        events: true,
        fileTree: "",
        contextFiles: {},
        history: req.history,
        explainMode: req.explainMode,
        explainDepth: req.explainDepth,
        learningMode: "coaching",
        simplify: req.simplify === true,
        replyLanguage: req.replyLanguage,
        studentProfile: req.studentProfile,
        adaptation: req.adaptation,
        images: req.images,
      }),
    });

    if (!res.ok) {
      // A failure before the stream opens still comes back as JSON, and the
      // route writes that sentence for a student already.
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      store().addErrorMessage(data.error ?? req.messages.chatFailed, threadId);
      return;
    }

    if (!res.body) {
      store().addErrorMessage(req.messages.emptyReply, threadId);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const frames = frameReader();
    const id = store().startAssistantMessage(threadId);

    // Only text counts as a reply. A stream that carried nothing but a status
    // frame and then closed is an empty answer, however many bytes crossed
    // the wire.
    let received = false;
    let failure: string | undefined;
    // The whole reply as it arrived, kept here because by the time it ends
    // the thread may be parked behind another chat and not on screen to read.
    let full = "";

    // Chunks can arrive faster than the screen refreshes. Coalesce whatever
    // lands within a frame into one update: fewer renders, and the fade groups
    // a few words instead of flickering per token. No artificial delay is
    // added — a frame is the display's own tick.
    let pending = "";
    let raf = 0;

    const flush = () => {
      raf = 0;
      if (!pending) return;
      store().appendToAssistantMessage(id, pending);
      pending = "";
    };

    const handle = (frame: Frame) => {
      if (frame.t === "text") {
        // The first token is the end of the wait, so the indicator goes here
        // and not in a timeout: it clears on the same event that gives the
        // student something to read, and can never linger over prose.
        if (!received) {
          received = true;
          store().setActivity(threadId, null);
        }
        pending += frame.v;
        full += frame.v;
        if (!raf) raf = requestAnimationFrame(flush);
        return;
      }
      if (frame.t === "status") {
        // Late status frames are ignored once text is flowing. The server
        // drains its queue as it streams, so a search that finished before the
        // first word can otherwise arrive after it and reinstate a spinner
        // over an answer already being written.
        if (!received) {
          store().setActivity(threadId, { phase: frame.phase, query: frame.query, count: frame.count, reason: frame.reason });
        }
        return;
      }
      if (frame.t === "sources") {
        store().setSources(id, frame.items);
        return;
      }
      // An error frame is prose the route already wrote for a student, and it
      // is terminal: whatever text arrived stays, and this is what the bubble
      // reports when the stream closes.
      failure = frame.message;
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (!text) continue;
        for (const frame of frames.push(text)) handle(frame);
      }
    } finally {
      if (raf) cancelAnimationFrame(raf);
      // The decoder's tail can complete a multi-byte character that ends the
      // last line, so it is pushed through the splitter before the splitter
      // is asked for its own leftovers.
      for (const frame of frames.push(decoder.decode())) handle(frame);
      for (const frame of frames.end()) handle(frame);
      flush();
      // Whatever happened — finished, errored, or stopped mid-sentence — the
      // indicator comes down here. This is the one path every ending goes
      // through, which is what stops a spinner outliving its stream.
      store().setActivity(threadId, null);
      // Stopping on purpose is a choice, not an error — the same rule
      // `streamChat.ts` applies to the assignment chat. The check has to happen
      // in this `finally` and not in the outer `catch`, because aborting
      // rejects `reader.read()` and this block runs first: reading `received`
      // alone recorded a student pressing Stop before the first token as "The
      // reply came back empty." in a red box.
      const stopped = controller.signal.aborted;
      store().finishAssistantMessage(id, failure ?? (received || stopped ? undefined : req.messages.emptyReply));

      // A student who says "my name is Santi, not S" has corrected Panda for
      // every future conversation, not just this one. The model marks the
      // durable fact itself; we only store what it marked, and only from a
      // reply that actually finished, so an aborted stream cannot half-write a
      // fact.
      if (full && !stopped && req.onRemember) req.onRemember(parseRemembered(full));
    }
  } catch (err) {
    // Stopping on purpose is not an error; the partial reply stays as it is.
    if (!(err instanceof DOMException && err.name === "AbortError") && !controller.signal.aborted) {
      store().addErrorMessage(friendly(err, req.messages), threadId);
    }
  } finally {
    // Belt and braces for the paths that never reached the stream at all — a
    // non-OK response, a thrown fetch. A stuck "Thinking" with no stream
    // behind it is the exact failure this feature exists to remove.
    store().endRequest(threadId, controller);
  }
}
