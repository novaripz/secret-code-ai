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

  /** Everything both the buffered and streaming paths need to start a turn. */
  private startTurn(req: AgentRequest) {
    const systemInstruction = buildSystemPrompt(req.chatOnly ? CHAT_SYSTEM_PROMPT : SYSTEM_PROMPT, {
      explainMode: req.explainMode,
      explainDepth: req.explainDepth,
      aiHomie: req.aiHomie,
      humanize: req.humanize,
    });

    // Chat turns disable thinking outright. These models reason before they
    // answer by default, which on a short message like "hi" meant waiting
    // many seconds for the first word — far longer than writing the answer
    // took. Project turns keep a small budget, since planning file changes
    // genuinely benefits from it.
    const chat = this.client.chats.create({
      model: MODEL_NAME,
      history: req.history.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction,
        temperature: req.chatOnly ? (req.aiHomie ? 1.0 : 0.8) : 0.4,
        thinkingConfig: { thinkingBudget: req.chatOnly ? 0 : 512 },
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

  async generate(req: AgentRequest): Promise<AgentResponse> {
    const { chat, message } = this.startTurn(req);
    const result = await chat.sendMessage({ message });
    const text = result.text ?? "";

    // In plain-chat mode the model answers in prose, so there's no JSON to parse.
    if (req.chatOnly) return { operations: [], message: text.trim() };
    return parseAgentResponse(text);
  }

  /**
   * Yields text as Gemini produces it. Chunks come out at whatever size the
   * model emits — no buffering here, so nothing is held back from the UI.
   */
  async *generateStream(req: AgentRequest): AsyncIterable<string> {
    const { chat, message } = this.startTurn(req);
    const stream = await chat.sendMessageStream({ message });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}
