import type { AgentResponse } from "@/types";
import { AiTimeoutError, type AgentRequest, type AiProvider, type AttemptOptions } from "./provider";
import { SseBuffer, SSE_DONE } from "./sse";
import {
  MAX_TOOL_ROUNDS,
  openAiSearchTool,
  parseToolArguments,
  type ToolSession,
} from "./tools";
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
// has not said a word inside the first-token deadline is abandoned rather than
// waited on, because the caller still has other providers to try.
//
// Once text is flowing the deadline changes rather than disappearing. It used
// to disappear entirely, and that was a hole: a provider whose socket goes
// quiet without closing left the reader awaiting a read that would never
// resolve, and the request hung until the platform killed it. So the watchdog
// is re-armed after every chunk at a much longer interval — long enough that a
// model thinking mid-sentence is never cut off, short enough that a dead
// connection is noticed. A slow finish is still better than a truncated
// answer; an infinite one is not.
//
// Tool calling rides on the same path. When a ToolSession is supplied the
// request carries one tool declaration and the stream is read for tool-call
// deltas as well as text; when it is not, the body is byte-for-byte what it
// always was. That is deliberate: the overwhelming majority of messages need no
// search, and they must not pay a millisecond for the ones that do.

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

/**
 * Fallback deadlines, used only when the caller supplies none. The chain is the
 * real owner of these numbers, because only it knows how many providers are
 * still left to try and how much of the platform's budget is already spent.
 */
export const FIRST_TOKEN_TIMEOUT_MS = 6_000;
export const IDLE_TIMEOUT_MS = 25_000;

/** Project turns answer in JSON and plan file changes, so they earn more time. */
export const BUFFERED_TIMEOUT_MS = 40_000;

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

  async generate(req: AgentRequest, options?: AttemptOptions): Promise<AgentResponse> {
    // A buffered turn has no first token to wait for — the whole answer arrives
    // at once — so the two deadlines collapse into one budget for the request.
    const budget = options?.idleTimeoutMs ?? BUFFERED_TIMEOUT_MS;
    const res = await this.post(req, false, AbortSignal.timeout(budget));
    const body = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";

    // In plain chat the model answers in prose, so there is no JSON to parse.
    if (req.chatOnly) return { operations: [], message: text.trim() };
    return parseAgentResponse(text);
  }

  async *generateStream(
    req: AgentRequest,
    session?: ToolSession,
    options?: AttemptOptions,
  ): AsyncIterable<string> {
    // Extra turns accumulated by tool round-trips: the assistant's tool call,
    // then our results. Empty on the common path, so the body is unchanged.
    const extra: ChatMessage[] = [];

    // Bounded explicitly rather than only through the session's own counter.
    // The old `for (;;)` trusted the session to run out, but ToolSession
    // refuses a call *before* incrementing its counter, so a model that kept
    // asking after the allowance was spent was answered "you have no searches
    // left" forever — a full network round-trip each time, with the student
    // watching. The loop now cannot outlive its own budget whatever the model
    // does.
    for (let round = 0; ; round += 1) {
      // Tools are offered only while the session still has round-trips left.
      // Withdrawing the declaration is what actually ends a loop: a model with
      // no tool to call has nothing left to do but answer.
      const withTools = session !== undefined && session.canCallTools;
      const roundState: RoundState = { calls: new Map() };

      for await (const text of this.streamRound(req, extra, withTools, roundState, options)) {
        yield text;
      }

      const calls = [...roundState.calls.values()].filter((c) => c.name);
      if (!session || calls.length === 0) return;

      if (!withTools || round >= MAX_TOOL_ROUNDS) {
        // It asked for a tool it was not offered, or asked once too often.
        // Stopping here yields no text, so the chain treats this provider as
        // never having started and moves to the next one — which is the right
        // outcome: a model stuck calling tools is not writing an answer.
        console.warn(
          `[ai] ${this.config.label} kept requesting tools after its allowance ran out; ` +
            "abandoning this provider rather than looping.",
        );
        return;
      }

      extra.push({
        role: "assistant",
        content: "",
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.args },
        })),
      });

      for (const call of calls) {
        const result = await session.run(call.name, parseToolArguments(call.args));
        extra.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
  }

  /**
   * One request/response round. Yields text as it lands and records any
   * tool-call deltas into `round`, which the caller inspects afterwards —
   * a generator cannot hand back both a stream and a summary, so the summary
   * goes in a box the caller already holds.
   */
  private async *streamRound(
    req: AgentRequest,
    extra: ChatMessage[],
    withTools: boolean,
    round: RoundState,
    options?: AttemptOptions,
  ): AsyncIterable<string> {
    const firstToken = options?.firstTokenTimeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
    const idle = options?.idleTimeoutMs ?? IDLE_TIMEOUT_MS;

    const abort = new AbortController();
    const watchdog = new Watchdog(abort, this.config.label, firstToken);

    try {
      const res = await this.post(req, true, abort.signal, extra, withTools);
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
            const delta = frameFrom(this.config.label, payload);
            if (!delta) continue;
            // A tool-call delta proves the provider is alive just as text does,
            // even though the student has not seen anything yet.
            if (delta.toolCalls.length > 0) {
              watchdog.poke(idle);
              collectToolCalls(round, delta.toolCalls);
            }
            if (!delta.text) continue;
            watchdog.poke(idle);
            yield delta.text;
          }

          if (done) return;
        }
      } finally {
        // Releases the socket when the reader walks away mid-reply.
        await reader.cancel().catch(() => {});
      }
    } catch (err) {
      // OUR DEADLINE IS NOT THEIR NETWORK.
      //
      // When the watchdog fires it aborts with an AiTimeoutError, but what the
      // caller actually catches depends on where the abort landed: before the
      // response headers, fetch rejects with our reason; once the body is being
      // read, the runtime raises its own "terminated"/AbortError instead. That
      // second shape matches the network branch of describeAiFailure, so a
      // deadline WE chose was being reported to the student as "Panda couldn't
      // reach the AI. Check the connection" — sending them to look at their
      // wifi for a limit we set.
      //
      // So the abort reason wins over whatever the runtime substituted. Only
      // our own watchdog can set that reason, so a genuine network fault is
      // still reported as one.
      const reason = abort.signal.reason;
      if (reason instanceof AiTimeoutError) throw reason;
      throw err;
    } finally {
      watchdog.clear();
      // The stream may be abandoned by the consumer (the chain giving up, the
      // student closing the tab) rather than ending on its own. Aborting here
      // is what actually returns the socket; without it a half-read reply kept
      // the upstream connection alive for nothing.
      if (!abort.signal.aborted) abort.abort(new Error("stream finished"));
    }
  }

  private async post(
    req: AgentRequest,
    stream: boolean,
    signal: AbortSignal,
    extra: ChatMessage[] = [],
    withTools = false,
  ): Promise<Response> {
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
      body: JSON.stringify(this.body(req, stream, extra, withTools)),
    });
    if (!res.ok) throw await httpError(this.config.label, res);
    return res;
  }

  private body(
    req: AgentRequest,
    stream: boolean,
    extra: ChatMessage[] = [],
    withTools = false,
  ): Record<string, unknown> {
    const messages: ChatMessage[] = [
      { role: "system", content: systemInstructionFor(req) },
      ...req.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: this.userContent(req) },
      ...extra,
    ];

    return {
      model: this.config.model,
      messages,
      stream,
      temperature: temperatureFor(req),
      // Project turns must come back as JSON; chat answers in prose.
      // KEPT DELIBERATELY, having been suspected of the timeout incident.
      //
      // A provider may buffer a JSON-mode reply until the object is complete,
      // which defeats the incremental scanner in projectStream.ts — the events
      // then all arrive at once instead of file by file. That is a cost, and it
      // is the reason project turns now get a first-token allowance long enough
      // to survive it (PROJECT_FIRST_TOKEN_MS in chain.ts).
      //
      // It is not a reason to drop the flag. Without it the model is free to
      // wrap the envelope in prose or a markdown fence, and every project turn
      // falls back on the recovery paths that exist for when it does — which is
      // trading a reliable slow path for an unreliable fast one. Which
      // providers actually buffer under JSON mode could not be measured here
      // (no keys in this environment), so the change that helps whether or not
      // they do is the one that was made. Revisit with real measurements.
      ...(req.chatOnly ? {} : { response_format: { type: "json_object" } }),
      // Absent entirely unless search is live, so nothing changes for the
      // requests that are not searching — which is nearly all of them.
      ...(withTools ? { tools: [openAiSearchTool()], tool_choice: "auto" } : {}),
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

/**
 * One deadline that can be pushed back.
 *
 * Starts at the first-token interval; every piece of output moves it to the
 * (much longer) idle interval. Firing aborts the request, which is what turns
 * "waiting forever" into an ordinary error the chain can fall through.
 */
class Watchdog {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly abort: AbortController,
    private readonly label: string,
    private ms: number,
  ) {
    this.arm();
  }

  private arm(): void {
    const ms = this.ms;
    this.timer = setTimeout(() => {
      this.abort.abort(new AiTimeoutError(`${this.label} sent nothing for ${ms}ms.`));
    }, ms);
    // Deliberately not unref'd. A deadline whose only job is to fire must be
    // able to keep the event loop alive long enough to fire: if the only thing
    // outstanding is a request that will never answer, this timer is the one
    // thing that can end it. It is cleared in a finally, so it cannot leak.
  }

  /** Output arrived. Re-arm, from here on at the interval given. */
  poke(ms: number): void {
    this.clear();
    this.ms = ms;
    this.arm();
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** The subset of the chat-completions message shape this adapter ever sends. */
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

/** A tool call being assembled across deltas. Providers send it a piece at a time. */
interface PartialToolCall {
  id: string;
  name: string;
  args: string;
}

interface RoundState {
  /** Keyed by the provider's `index`, which is the only stable handle in deltas. */
  calls: Map<number, PartialToolCall>;
}

interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  args?: string;
}

/**
 * Tool calls arrive the same way text does: in fragments. The id and name turn
 * up in the first delta for an index and the arguments accrete as a JSON string
 * over the rest, so everything is appended rather than assigned.
 */
function collectToolCalls(round: RoundState, deltas: ToolCallDelta[]): void {
  for (const delta of deltas) {
    const existing = round.calls.get(delta.index) ?? { id: "", name: "", args: "" };
    round.calls.set(delta.index, {
      id: delta.id || existing.id,
      name: delta.name || existing.name,
      args: existing.args + (delta.args ?? ""),
    });
  }
}

/**
 * Reads one frame into the two things we care about: text for the student, and
 * tool-call fragments for us. Reasoning fields are deliberately left on the
 * floor — the student asked a question, not to watch the model think.
 */
function frameFrom(
  label: string,
  payload: string,
): { text: string; toolCalls: ToolCallDelta[] } | undefined {
  let frame: {
    choices?: {
      delta?: {
        content?: unknown;
        tool_calls?: unknown;
      };
    }[];
    error?: { message?: string };
  };
  try {
    frame = JSON.parse(payload);
  } catch {
    // A frame we cannot read is not worth killing a live reply over.
    return undefined;
  }
  if (frame.error) {
    throw new Error(`${label} failed mid-stream: ${frame.error.message ?? "no reason given"}`);
  }
  const delta = frame.choices?.[0]?.delta;
  const content = delta?.content;
  return {
    text: typeof content === "string" ? content : "",
    toolCalls: readToolCallDeltas(delta?.tool_calls),
  };
}

function readToolCallDeltas(raw: unknown): ToolCallDelta[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolCallDelta[] = [];
  for (const [position, entry] of raw.entries()) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const fn = (typeof row.function === "object" && row.function !== null
      ? row.function
      : {}) as Record<string, unknown>;
    out.push({
      // Some providers omit `index` when only one call is in flight.
      index: typeof row.index === "number" ? row.index : position,
      id: typeof row.id === "string" ? row.id : undefined,
      name: typeof fn.name === "string" ? fn.name : undefined,
      args: typeof fn.arguments === "string" ? fn.arguments : undefined,
    });
  }
  return out;
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
