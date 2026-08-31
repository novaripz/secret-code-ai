import { GoogleGenAI } from "@google/genai";
import type { AgentResponse, FileOperation } from "@/types";
import type { AgentRequest, AiProvider } from "./provider";
import { buildSystemPrompt, CHAT_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./systemPrompt";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.6-flash";

function buildUserTurnText(req: AgentRequest): string {
  const contextBlock = Object.entries(req.contextFiles)
    .map(([path, content]) => `--- FILE: ${path} ---\n${content}`)
    .join("\n\n");

  const parts = [
    req.studentProfile ? `WHAT WE KNOW ABOUT THE USER (remember this across every chat and project):\n${req.studentProfile}` : "",
    req.projectMemory ? `WHAT WE'VE ALREADY BUILT IN THIS PROJECT (working memory):\n${req.projectMemory}` : "",
    `PROJECT FILE TREE:\n${req.fileTree}`,
    contextBlock ? `RELEVANT FILE CONTENTS:\n${contextBlock}` : "RELEVANT FILE CONTENTS: (none selected)",
    imageNote(req),
    `STUDENT'S REQUEST:\n${req.prompt}`,
  ].filter(Boolean);

  return parts.join("\n\n");
}

/** Tells the model what it's looking at, so attached images aren't ignored. */
function imageNote(req: AgentRequest): string {
  const count = allImages(req).length;
  if (count === 0) return "";
  return count === 1
    ? "The user attached an image (a screenshot or photo) — look at it before answering."
    : `The user attached ${count} images — look at all of them before answering.`;
}

/** Text-only turn for plain conversation: no file tree, no operations. */
function buildChatTurnText(req: AgentRequest): string {
  const parts = [
    req.studentProfile ? `WHAT YOU KNOW ABOUT THE USER:\n${req.studentProfile}` : "",
    req.assignmentContext ? `THE ASSIGNMENT THEY ARE WORKING ON:\n${req.assignmentContext}` : "",
    imageNote(req),
    `USER:\n${req.prompt}`,
  ].filter(Boolean);
  return parts.join("\n\n");
}

/** Back-compat: `image` is the single-attachment form, `images` the newer list. */
function allImages(req: AgentRequest) {
  const images = req.images ?? [];
  if (req.image && !images.some((i) => i.data === req.image!.data)) return [req.image, ...images];
  return images;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function parseAgentResponse(raw: string): AgentResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { operations: [], message: raw.trim() || "The AI did not return a usable response." };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { operations: [], message: "The AI returned an unexpected response format." };
  }
  const obj = parsed as Record<string, unknown>;
  const rawOps = Array.isArray(obj.operations) ? obj.operations : [];
  const operations: FileOperation[] = rawOps
    .filter((op): op is Record<string, unknown> => typeof op === "object" && op !== null)
    .map((op) => ({
      type: op.type as FileOperation["type"],
      path: String(op.path ?? ""),
      content: typeof op.content === "string" ? op.content : undefined,
      newPath: typeof op.newPath === "string" ? op.newPath : undefined,
    }));
  return {
    operations,
    message: typeof obj.message === "string" ? obj.message : "",
    openFiles: Array.isArray(obj.openFiles) ? obj.openFiles.map(String) : undefined,
  };
}

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
    const systemInstruction = buildSystemPrompt(req.chatOnly ? CHAT_SYSTEM_PROMPT : SYSTEM_PROMPT, {
      explainMode: req.explainMode,
      explainDepth: req.explainDepth,
      learningMode: req.learningMode,
      simplify: req.simplify,
      hasAssignmentContext: Boolean(req.assignmentContext),
      replyLanguage: req.replyLanguage,
      aiHomie: req.aiHomie,
      humanize: req.humanize,
    });

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
        systemInstruction,
        temperature: req.chatOnly ? (req.aiHomie ? 1.0 : 0.8) : 0.4,
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
