import { NextRequest, NextResponse } from "next/server";
import { describeAiFailure, getProviderChain } from "@/lib/ai/chain";
import { isSearchConfigured } from "@/lib/ai/search";
import { ToolSession, type ProgressEvent } from "@/lib/ai/tools";
import { validateOperations } from "@/lib/ai/validateOperations";
import type { AiMessage, ImageAttachment } from "@/lib/ai/provider";
import type { ExplainDepth, LearningMode } from "@/lib/ai/systemPrompt";
import { guardRequest } from "@/lib/security/apiGuard";
import {
  MAX_AI_BODY_BYTES,
  MAX_AI_CONTEXT_CHARS,
  MAX_AI_CONTEXT_FILES,
  MAX_AI_HISTORY_CHARS,
  MAX_AI_HISTORY_MESSAGES,
  MAX_AI_PROMPT_CHARS,
  readJsonBody,
  tooLarge,
  totalChars,
} from "@/lib/security/requestLimits";

// This route is the expensive one: every call spends real quota on one of four
// AI providers, and until now anyone who found the URL could spend all of it.
// The limits below are per minute, and a signed-in student gets roughly three
// times what a guest gets — a guest is anonymous, so it is the abuse path, and
// the numbers are set so that ordinary use (a question, read the answer, ask
// again) never touches them while a script loop hits the wall in seconds.
const USER_RULE = { limit: 20, windowMs: 60_000 };
const GUEST_RULE = { limit: 6, windowMs: 60_000 };
const BUSY_MESSAGE =
  "You're sending messages faster than Panda can answer. Try again in a few seconds.";

const LEARNING_MODES = new Set<LearningMode>(["coaching", "study", "review", "answers"]);

const EXPLAIN_DEPTHS = new Set<ExplainDepth>(["minimal", "fair", "normal", "extra", "overload"]);

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB decoded, generous for a tab screenshot

const MAX_IMAGES = 4;

interface RequestBody {
  prompt: string;
  fileTree: string;
  contextFiles: Record<string, string>;
  history?: AiMessage[];
  explainMode?: boolean;
  explainDepth?: ExplainDepth;
  learningMode?: LearningMode;
  simplify?: boolean;
  replyLanguage?: string;
  assignmentContext?: string;
  adaptation?: string;
  humanize?: boolean;
  aiHomie?: boolean;
  chatOnly?: boolean;
  projectMemory?: string;
  studentProfile?: string;
  image?: ImageAttachment;
  images?: ImageAttachment[];
  /** Ask for the reply as a text stream instead of one buffered JSON payload. */
  stream?: boolean;
  /**
   * Opt in to the framed stream (see STREAM FRAMING below). Old clients that
   * do not send this keep getting plain text, byte for byte.
   */
  events?: boolean;
}

// STREAM FRAMING
//
// The stream used to be raw prose, which left nowhere to say "I am searching
// the web" without that sentence landing in the transcript as if Panda had
// typed it. So a client can ask for the framed form instead, with
// `events: true`, and gets newline-delimited JSON: one object per line,
// terminated by "\n".
//
//   {"t":"text","v":"..."}                        a piece of the reply
//   {"t":"status","phase":"thinking"}             a pause with nothing to show yet
//   {"t":"status","phase":"searching","query":"…"}
//   {"t":"status","phase":"reading","query":"…","count":3}
//   {"t":"status","phase":"search_failed","reason":"rate-limited"|"unavailable"}
//   {"t":"sources","items":[{"title","url","snippet"}, …]}   sent once, before done
//   {"t":"error","message":"…"}                   already student-safe prose
//
// Why newline-delimited JSON and not a marker like "<<<event>>>": any marker we
// invent is a string a model could also write, and the day it does, a student
// reads an event as Panda's words. JSON.stringify can never put a raw newline
// inside a string, so a line break is always a frame boundary and reply text is
// always inside a `v` field. There is no arrangement of model output that can
// forge a frame.
//
// Framing is opt-in for a second reason as well: a client that cannot render
// progress should not be given tool calling, because a tool round-trip with no
// indicator is exactly the dead screen this is meant to prevent.

/** One frame, already newline-terminated. */
function frame(value: Record<string, unknown>): string {
  return `${JSON.stringify(value)}\n`;
}

function progressFrame(event: ProgressEvent): string {
  if (event.kind === "searching") return frame({ t: "status", phase: "searching", query: event.query });
  if (event.kind === "reading") {
    return frame({ t: "status", phase: "reading", query: event.query, count: event.count });
  }
  if (event.kind === "search_failed") {
    return frame({ t: "status", phase: "search_failed", reason: event.reason });
  }
  return frame({ t: "status", phase: "thinking" });
}

function isRequestBody(x: unknown): x is RequestBody {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  // fileTree is only meaningful when a project is open; plain chat omits it.
  return typeof b.prompt === "string" && (typeof b.fileTree === "string" || b.chatOnly === true);
}

function sanitizeImages(images: unknown): ImageAttachment[] {
  if (!Array.isArray(images)) return [];
  return images
    .map(sanitizeImage)
    .filter((i): i is ImageAttachment => i !== undefined)
    .slice(0, MAX_IMAGES);
}

function sanitizeImage(image: unknown): ImageAttachment | undefined {
  if (!image || typeof image !== "object") return undefined;
  const img = image as Record<string, unknown>;
  if (typeof img.data !== "string" || typeof img.mimeType !== "string") return undefined;
  if (!ALLOWED_IMAGE_TYPES.has(img.mimeType)) return undefined;
  if (img.data.length === 0 || img.data.length > MAX_IMAGE_BASE64_CHARS) return undefined;
  // Reject anything that isn't plain base64 (defense in depth — no data: URI, no path-like content).
  if (!/^[A-Za-z0-9+/=]+$/.test(img.data)) return undefined;
  return { data: img.data, mimeType: img.mimeType };
}

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, {
    route: "ai",
    user: USER_RULE,
    guest: GUEST_RULE,
    busyMessage: BUSY_MESSAGE,
  });
  if (!guard.ok) return guard.response;

  const read = await readJsonBody(req, MAX_AI_BODY_BYTES);
  if (!read.ok) return read.response;
  const body: unknown = read.body;

  if (!isRequestBody(body)) {
    return NextResponse.json({ error: "Missing required fields: prompt, fileTree." }, { status: 400 });
  }

  if (body.prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt must not be empty." }, { status: 400 });
  }
  // Generous, because attached text/code files are folded into the prompt.
  if (body.prompt.length > MAX_AI_PROMPT_CHARS) {
    return tooLarge("That's too much text to send at once. Try asking about one part of it.");
  }

  // History and context files are the other two ways a body gets huge, and
  // both are entirely client-supplied. The history slice below already trims
  // to the last 20 turns, but a caller can make those twenty turns enormous,
  // so the character total is checked as well.
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_AI_HISTORY_MESSAGES) : [];
  if (
    totalChars(
      history.map((m) => (m && typeof m.content === "string" ? m.content : "")),
    ) > MAX_AI_HISTORY_CHARS
  ) {
    return tooLarge("This conversation has got too long for Panda to carry. Start a new chat.");
  }

  const contextFiles =
    body.contextFiles && typeof body.contextFiles === "object" ? body.contextFiles : {};
  const contextEntries = Object.entries(contextFiles);
  if (contextEntries.length > MAX_AI_CONTEXT_FILES) {
    return tooLarge("That's too many files to send at once. Pick the ones that matter.");
  }
  if (totalChars(contextEntries.map(([, v]) => (typeof v === "string" ? v : ""))) > MAX_AI_CONTEXT_CHARS) {
    return tooLarge("Those files add up to more than Panda can read at once. Send fewer.");
  }

  const request = {
    prompt: body.prompt,
    fileTree: body.fileTree ?? "",
    contextFiles,
    history,
    explainMode: body.explainMode === true,
    explainDepth:
      body.explainDepth && EXPLAIN_DEPTHS.has(body.explainDepth) ? body.explainDepth : "normal",
    humanize: body.humanize === true,
    // Coaching is the floor. An unrecognised mode from the client can only
    // ever fall back to the most restrictive one, never to "answers".
    learningMode:
      body.learningMode && LEARNING_MODES.has(body.learningMode) ? body.learningMode : "coaching",
    simplify: body.simplify === true,
    replyLanguage:
      typeof body.replyLanguage === "string" ? body.replyLanguage.slice(0, 40) : undefined,
    // Only a class chat sends this. Personal Panda has no assignment context
    // to send, which is the boundary the product depends on.
    assignmentContext:
      typeof body.assignmentContext === "string" ? body.assignmentContext.slice(0, 8000) : undefined,
    // What the insights engine noticed about this student, already turned into
    // prompt text on the client. Same discipline as the other client-supplied
    // strings: it is bounded, never trusted for length, and an absent or
    // non-string value simply means "no adaptation" rather than an error. The
    // cap is generous next to the addendum's real size (a few hundred
    // characters for three findings) and small enough that nobody can use this
    // field to smuggle a second system prompt in.
    adaptation:
      typeof body.adaptation === "string" && body.adaptation.trim().length > 0
        ? body.adaptation.slice(0, 2000)
        : undefined,
    aiHomie: body.aiHomie === true,
    chatOnly: body.chatOnly === true,
    projectMemory: typeof body.projectMemory === "string" ? body.projectMemory.slice(0, 4000) : undefined,
    studentProfile: typeof body.studentProfile === "string" ? body.studentProfile.slice(0, 2000) : undefined,
    image: sanitizeImage(body.image),
    images: sanitizeImages(body.images),
  };

  // Streaming only applies to plain chat. A project turn answers in JSON, which
  // is unparseable until the last brace arrives, so there is nothing to show
  // early and it stays on the buffered path.
  if (body.stream === true && request.chatOnly) {
    const framed = body.events === true;
    try {
      const provider = getProviderChain();
      const encoder = new TextEncoder();

      // Web search only happens on a framed stream, and only when a key is
      // configured. With neither, `session` stays undefined and every provider
      // sends exactly the request it sent before — no tool declarations, no
      // extra tokens, nothing added to the wait for the first word.
      let pending: string[] = [];
      const session =
        framed && isSearchConfigured()
          ? new ToolSession((event) => pending.push(progressFrame(event)))
          : undefined;

      const chunks = provider.generateStream(request, session);

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (text: string) => controller.enqueue(encoder.encode(text));
          const drain = () => {
            for (const framed of pending) send(framed);
            pending = [];
          };

          try {
            // Said before anything else so a tool round-trip shows as work
            // rather than as a frozen screen. On the ordinary path the first
            // text frame follows immediately behind it.
            if (session) send(frame({ t: "status", phase: "thinking" }));

            for await (const chunk of chunks) {
              drain();
              send(framed ? frame({ t: "text", v: chunk }) : chunk);
            }
            drain();

            // Citations travel as data, never glued into the prose, so the UI
            // can render them as links and the transcript stays clean.
            const sources = session?.sources() ?? [];
            if (framed && sources.length > 0) send(frame({ t: "sources", items: sources }));
          } catch (err) {
            // The response has already begun, so the status line is spent.
            // The failure goes inline instead — as a sentence written for a
            // student. The provider's own words stay in the log.
            console.error("[api/ai] stream failed mid-flight:", err);
            const message = describeAiFailure(err);
            send(framed ? frame({ t: "error", message }) : `\n\n[stream error] ${message}`);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": framed ? "application/x-ndjson; charset=utf-8" : "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      console.error("[api/ai] stream failed to start:", err);
      return NextResponse.json({ error: describeAiFailure(err) }, { status: 500 });
    }
  }

  try {
    const provider = getProviderChain();
    const response = await provider.generate(request);

    // Validate/sanitize operations server-side too, so a malformed model
    // response can never smuggle an unsafe path past the client.
    const { valid, errors } = validateOperations(response.operations);

    return NextResponse.json({
      operations: valid,
      message: response.message,
      openFiles: response.openFiles,
      operationErrors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[api/ai] generation failed:", err);
    return NextResponse.json({ error: describeAiFailure(err) }, { status: 500 });
  }
}
