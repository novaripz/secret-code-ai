import type { AgentResponse } from "@/types";
import type { AgentRequest, AiProvider } from "./provider";
import { SseBuffer, SSE_DONE } from "./sse";
import {
  allImages,
  buildChatTurnText,
  buildUserTurnText,
  parseAgentResponse,
  systemInstructionFor,
  temperatureFor,
} from "./turn";

// Groq, Cerebras and NVIDIA NIM all serve OpenAI's chat-completions dialect, so
// one adapter covers all three. They differ in base URL, key, model id, whether
// their model can look at an image, and the handful of body fields each one
// understands — nothing else, which is why this is a config object rather than
// three near-identical classes.
//
// The streaming path exists to fix one specific complaint: the reply sitting
// dead for seconds and then arriving all at once. So deltas are yielded the
// moment their frame is complete and nothing is accumulated. A provider that
// has not said a word inside FIRST_TOKEN_TIMEOUT_MS is abandoned rather than
// waited on, because the caller still has other providers to try. Once text is
// flowing there is no deadline at all: a slow finish is better than a truncated
// answer, and by then nobody can start over anyway.

export interface OpenAiCompatibleConfig {
  /** Used in logs, so a failed hop in the chain is identifiable. */
  label: string;
  endpoint: string;
  apiKey: string;
  model: string;
  /**
   * Whether `model` can actually look at a photo. Only a vision model gets the
   * array-of-parts message shape; a text-only one is given a plain string,
   * which is all it will accept.
   */
  acceptsImages?: boolean;
  /** Fields only this provider accepts. Sent to another one they are a 400. */
  extraBody?: Record<string, unknown>;
}

const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/** Project turns answer in JSON and plan file changes, so they earn more time. */
const BUFFERED_TIMEOUT_MS = 60_000;

/** Carries the status so callers can decide by number instead of regexing a message. */
export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {
    if (!config.apiKey) {
      throw new Error(`${config.label} was constructed without an API key.`);
    }
  }

  async generate(req: AgentRequest): Promise<AgentResponse> {
    const res = await this.post(req, false, AbortSignal.timeout(BUFFERED_TIMEOUT_MS));
    const body = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";

    // In plain chat the model answers in prose, so there is no JSON to parse.
    if (req.chatOnly) return { operations: [], message: text.trim() };
    return parseAgentResponse(text);
  }

  async *generateStream(req: AgentRequest): AsyncIterable<string> {
    const abort = new AbortController();
    let silence: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      abort.abort(new Error(`${this.config.label} sent nothing within ${FIRST_TOKEN_TIMEOUT_MS}ms.`));
    }, FIRST_TOKEN_TIMEOUT_MS);

    try {
      const res = await this.post(req, true, abort.signal);
      if (!res.body) throw new Error(`${this.config.label} answered with an empty body.`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const frames = new SseBuffer();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          // The decoder holds its own tail for a multi-byte character split
          // across reads, exactly as the frame buffer holds a split line.
          const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
          const payloads = done ? [...frames.push(text), ...frames.flush()] : frames.push(text);

          for (const payload of payloads) {
            if (payload === SSE_DONE) return;
            const delta = textFrom(this.config.label, payload);
            if (!delta) continue;
            if (silence) {
              clearTimeout(silence);
              silence = undefined;
            }
            yield delta;
          }

          if (done) return;
        }
      } finally {
        // Releases the socket when the reader walks away mid-reply.
        await reader.cancel().catch(() => {});
      }
    } finally {
      if (silence) clearTimeout(silence);
    }
  }

  private async post(req: AgentRequest, stream: boolean, signal: AbortSignal): Promise<Response> {
    const res = await fetch(this.config.endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        // NVIDIA wants this spelled out before it will stream; the others infer
        // it from `stream: true` but are happy to be told.
        Accept: stream ? "text/event-stream" : "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(this.body(req, stream)),
    });
    if (!res.ok) throw await httpError(this.config.label, res);
    return res;
  }

  private body(req: AgentRequest, stream: boolean): Record<string, unknown> {
    const messages = [
      { role: "system", content: systemInstructionFor(req) },
      ...req.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: this.userContent(req) },
    ];

    return {
      model: this.config.model,
      messages,
      stream,
      temperature: temperatureFor(req),
      // Project turns must come back as JSON; chat answers in prose.
      ...(req.chatOnly ? {} : { response_format: { type: "json_object" } }),
      ...this.config.extraBody,
    };
  }

  /**
   * A plain string for a text-only model, the array-of-parts shape when there
   * are photos to look at. Attachments are stored without the `data:` prefix,
   * so it is put back here — it is what an `image_url` part is made of.
   */
  private userContent(req: AgentRequest): string | ContentPart[] {
    const text = req.chatOnly ? buildChatTurnText(req) : buildUserTurnText(req);
    const images = this.config.acceptsImages ? allImages(req) : [];
    if (images.length === 0) return text;

    return [
      { type: "text", text },
      ...images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: `data:${image.mimeType};base64,${image.data}` },
      })),
    ];
  }
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Reads one frame. Reasoning fields are deliberately left on the floor: the
 * student asked a question, not to watch the model think.
 */
function textFrom(label: string, payload: string): string {
  let frame: {
    choices?: { delta?: { content?: unknown } }[];
    error?: { message?: string };
  };
  try {
    frame = JSON.parse(payload);
  } catch {
    // A frame we cannot read is not worth killing a live reply over.
    return "";
  }
  if (frame.error) {
    throw new Error(`${label} failed mid-stream: ${frame.error.message ?? "no reason given"}`);
  }
  const content = frame.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

/** The provider's own words about the failure. The key is never part of them. */
async function httpError(label: string, res: Response): Promise<ProviderHttpError> {
  const detail = (await res.text().catch(() => "")).trim().slice(0, 400);
  return new ProviderHttpError(
    res.status,
    res.headers.get("retry-after"),
    `${label} returned ${res.status}${detail ? `: ${detail}` : ""}`,
  );
}
