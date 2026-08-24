import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AgentResponse, FileOperation } from "@/types";
import type { AgentRequest, AiProvider } from "./provider";
import { EXPLAIN_MODE_ADDENDUM, SYSTEM_PROMPT } from "./systemPrompt";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";

function buildUserTurnText(req: AgentRequest): string {
  const contextBlock = Object.entries(req.contextFiles)
    .map(([path, content]) => `--- FILE: ${path} ---\n${content}`)
    .join("\n\n");

  const parts = [
    req.studentProfile ? `WHAT WE KNOW ABOUT THE STUDENT:\n${req.studentProfile}` : "",
    req.projectMemory ? `WHAT WE'VE ALREADY BUILT IN THIS PROJECT (working memory):\n${req.projectMemory}` : "",
    `PROJECT FILE TREE:\n${req.fileTree}`,
    contextBlock ? `RELEVANT FILE CONTENTS:\n${contextBlock}` : "RELEVANT FILE CONTENTS: (none selected)",
    req.image ? "The student also attached a screenshot of their screen — use it to understand what's happening." : "",
    `STUDENT'S REQUEST:\n${req.prompt}`,
  ].filter(Boolean);

  return parts.join("\n\n");
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
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(req: AgentRequest): Promise<AgentResponse> {
    const systemInstruction = req.explainMode ? SYSTEM_PROMPT + EXPLAIN_MODE_ADDENDUM : SYSTEM_PROMPT;

    const model = this.client.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    });

    const history = req.history.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    type MessagePart = { text: string } | { inlineData: { data: string; mimeType: string } };
    const messageParts: MessagePart[] = [{ text: buildUserTurnText(req) }];
    if (req.image) {
      messageParts.push({ inlineData: { data: req.image.data, mimeType: req.image.mimeType } });
    }

    const result = await chat.sendMessage(messageParts);
    const text = result.response.text();
    return parseAgentResponse(text);
  }
}
