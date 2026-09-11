import { GoogleGenAI } from "@google/genai";
import type { AgentResponse } from "@/types";
import type { AgentRequest, AiProvider } from "./provider";
import {
  allImages,
  buildChatTurnText,
  buildUserTurnText,
  parseAgentResponse,
  systemInstructionFor,
  temperatureFor,
} from "./turn";

// Gemini's own SDK, kept for the things only it does here: reading a photo, and
// a reasoning budget that is expressed as a config rather than a request field.
// How a turn is worded and how its answer is read live in turn.ts, shared with
// the OpenAI-compatible providers, so the reply a student gets does not change
// with whichever backend answered.

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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
  private startTurn(req: AgentRequest, thinking: "level" | "budget" | "none") {
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
        ...(thinkingConfig ? { thinkingConfig } : {}),
        ...(req.chatOnly ? {} : { responseMimeType: "application/json" }),
      },
    });

    type MessagePart = { text: string } | { inlineData: { data: string; mimeType: string } };
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

  async generate(req: AgentRequest): Promise<AgentResponse> {
    const modes = ["level", "budget", "none"] as const;
    let lastError: unknown;

    for (const thinking of modes) {
      try {
        const { chat, message } = this.startTurn(req, thinking);
        const result = await chat.sendMessage({ message });
        const text = result.text ?? "";
        // In plain chat the model answers in prose, so there is no JSON to parse.
        if (req.chatOnly) return { operations: [], message: text.trim() };
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
  async *generateStream(req: AgentRequest): AsyncIterable<string> {
    const modes = ["level", "budget", "none"] as const;
    let lastError: unknown;

    for (const thinking of modes) {
      let started = false;
      try {
        const { chat, message } = this.startTurn(req, thinking);
        const stream = await chat.sendMessageStream({ message });
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
            started = true;
            yield text;
          }
        }
        return;
      } catch (err) {
        lastError = err;
        if (started || !this.isBadArgument(err)) throw err;
      }
    }
    throw lastError;
  }
}
