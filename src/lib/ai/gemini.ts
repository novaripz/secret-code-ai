import { GoogleGenAI } from "@google/genai";
import type { AgentResponse } from "@/types";
import { AiTimeoutError, type AgentRequest, type AiProvider, type AttemptOptions } from "./provider";
import {
  BUFFERED_TIMEOUT_MS,
  FIRST_TOKEN_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
} from "./openaiCompatible";
import { geminiSearchTool, MAX_TOOL_ROUNDS, type ToolSession } from "./tools";
import {
  allImages,
  buildChatTurnText,
  buildUserTurnText,
  parseAgentResponse,
  systemInstructionFor,
  studentSafeMessage,
  temperatureFor,
} from "./turn";

// Gemini's own SDK, kept for the things only it does here: reading a photo, and
// a reasoning budget that is expressed as a config rather than a request field.
// How a turn is worded and how its answer is read live in turn.ts, shared with
// the OpenAI-compatible providers, so the reply a student gets does not change
// with whichever backend answered.
//
// Tool calling is the one place Gemini genuinely differs: tools are pinned when
// the chat is created, not per message, so a cap on round-trips cannot be
// enforced by quietly dropping the declaration the way it is for the others.
// The ToolSession refuses instead, and the loop below counts as well.
//
// Deadlines were the other thing this file was missing entirely. The SDK does
// its own retrying and has no default timeout, so a Gemini call that never came
// back held the request open until the platform killed it — and Gemini sits
// last in the chain, which made it the place the whole thing went to die. Every
// call now carries an AbortController: a short leash to the first chunk, a long
// one between chunks afterwards.

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.6-flash";

type MessagePart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Everything both the buffered and streaming paths need to start a turn.
   *
   * `thinking` controls how the reasoning budget is expressed. Models disagree
   * about this: Gemini 3 takes `thinkingLevel`, earlier ones took a numeric
   * `thinkingBudget`, and sending the wrong one is a 400, not a warning. So
   * callers try the modern spelling first and fall back, rather than this
   * being pinned to whatever model happens to be configured today.
   */
  private startTurn(
    req: AgentRequest,
    thinking: "level" | "budget" | "none",
    withTools = false,
    abortSignal?: AbortSignal,
  ) {
    // Chat keeps reasoning to a minimum. These models otherwise think for
    // several seconds before saying a word, which on a message like "hi" is
    // far longer than writing the answer takes. Project turns plan file
    // changes, where the reasoning genuinely earns its keep.
    let thinkingConfig: Record<string, unknown> | undefined;
    if (thinking === "level") {
      thinkingConfig = { thinkingLevel: req.chatOnly ? "MINIMAL" : "LOW" };
    } else if (thinking === "budget") {
      thinkingConfig = { thinkingBudget: req.chatOnly ? 0 : 512 };
    }

    const chat = this.client.chats.create({
      model: MODEL_NAME,
      history: req.history.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: systemInstructionFor(req),
        temperature: temperatureFor(req),
        // The same explicit ceiling the OpenAI-compatible adapter sets, and for
        // the same reason: an unset limit takes the provider's default, and on a
        // project turn that default is what cut a build off mid-file.
        maxOutputTokens: req.chatOnly ? 2_048 : 16_384,
        ...(thinkingConfig ? { thinkingConfig } : {}),
        // Only present when web search is configured and this is a chat turn.
        // A non-searching request is exactly the request it was before.
        ...(withTools ? { tools: [geminiSearchTool()] } : {}),
        ...(req.chatOnly ? {} : { responseMimeType: "application/json" }),
        // Pinned on the chat, so every message this chat sends inherits it —
        // including the follow-up turns a tool round-trip makes.
        ...(abortSignal ? { abortSignal } : {}),
      },
    });

    const message: MessagePart[] = [
      { text: req.chatOnly ? buildChatTurnText(req) : buildUserTurnText(req) },
    ];
    for (const image of allImages(req)) {
      message.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
    }

    return { chat, message };
  }

  /** A rejected thinking parameter comes back as a 400, so it is worth retrying. */
  private isBadArgument(err: unknown): boolean {
    const text = err instanceof Error ? err.message : String(err);
    return /INVALID_ARGUMENT|invalid argument|400/i.test(text);
  }

  async generate(req: AgentRequest, options?: AttemptOptions): Promise<AgentResponse> {
    const modes = ["level", "budget", "none"] as const;
    let lastError: unknown;
    // One budget for the whole buffered answer: there is no first token to wait
    // for when the reply arrives in one piece.
    const budget = options?.idleTimeoutMs ?? BUFFERED_TIMEOUT_MS;

    for (const thinking of modes) {
      const deadline = AbortSignal.timeout(budget);
      try {
        const { chat, message } = this.startTurn(req, thinking, false, deadline);
        const result = await chat.sendMessage({ message });
        const text = result.text ?? "";
        // In plain chat the model answers in prose, so there is no JSON to parse.
        // The same floor the project path has: a model that answers a chat turn
        // with a JSON envelope must not have it rendered as prose. Rare here
        // (nothing asks chat for JSON) but the cost of being wrong is the student
        // reading our internals, and the call is one function.
        if (req.chatOnly) return { operations: [], message: studentSafeMessage(text, "") };
        return parseAgentResponse(text);
      } catch (err) {
        lastError = err;
        if (!this.isBadArgument(err)) throw err;
      }
    }
    throw lastError;
  }

  /**
   * Yields text as Gemini produces it. Chunks come out at whatever size the
   * model emits — no buffering here, so nothing is held back from the UI.
   *
   * Retrying only happens before the first chunk. Once text has reached the
   * reader, starting over would repeat what they already saw.
   */
  async *generateStream(
    req: AgentRequest,
    session?: ToolSession,
    options?: AttemptOptions,
  ): AsyncIterable<string> {
    const modes = ["level", "budget", "none"] as const;
    const firstToken = options?.firstTokenTimeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
    const idle = options?.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    let lastError: unknown;

    for (const thinking of modes) {
      let started = false;
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Same shape as the OpenAI-compatible watchdog: short to the first
      // chunk, long between chunks, aborted for good when the turn ends.
      const arm = (ms: number) => {
        if (timer) clearTimeout(timer);
        // Not unref'd, for the same reason as the adapter's watchdog: a
        // deadline that the event loop is allowed to skip is not a deadline.
        timer = setTimeout(
          () => abort.abort(new AiTimeoutError(`gemini sent nothing for ${ms}ms.`)),
          ms,
        );
      };
      arm(firstToken);

      try {
        const { chat, message } = this.startTurn(
          req,
          thinking,
          session !== undefined,
          abort.signal,
        );
        let outgoing: MessagePart[] = message;

        // One pass per tool round-trip. The +1 is the reply itself, after the
        // last search; without it the loop would end holding results nobody
        // ever turned into an answer.
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
          const stream = await chat.sendMessageStream({ message: outgoing });
          const calls: { name?: string; args?: unknown }[] = [];

          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              arm(idle);
              started = true;
              yield text;
            }
            for (const call of chunk.functionCalls ?? []) {
              arm(idle);
              calls.push(call);
            }
          }

          if (!session || calls.length === 0) return;

          const replies: MessagePart[] = [];
          for (const call of calls) {
            const name = call.name ?? "";
            const result = await session.run(name, call.args ?? {});
            replies.push({ functionResponse: { name, response: { result } } });
          }
          outgoing = replies;
        }
        return;
      } catch (err) {
        // Our own deadline is reported as a deadline, not as the student's
        // connection — same reasoning as the OpenAI-compatible adapter: the SDK
        // substitutes its own abort error and that text reads like a network
        // fault to describeAiFailure.
        const reason = abort.signal.reason;
        lastError = reason instanceof AiTimeoutError ? reason : err;
        if (started || !this.isBadArgument(err)) throw lastError;
      } finally {
        if (timer) clearTimeout(timer);
        // Returns the connection when the consumer walks away mid-reply, and
        // stops the SDK's own retrying on an attempt we have given up on.
        if (!abort.signal.aborted) abort.abort(new Error("stream finished"));
      }
    }
    throw lastError;
  }
}
