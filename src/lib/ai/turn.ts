import type { AgentResponse, FileOperation } from "@/types";
import type { AgentRequest, ImageAttachment } from "./provider";
import { buildSystemPrompt, CHAT_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./systemPrompt";

// How a request becomes a turn: the system prompt, the text of the message, and
// how the answer is read back out.
//
// None of this belongs to a particular provider. A student's answer must not
// change depending on which backend happened to be fastest this minute, so
// every provider shares this file and differs only in transport.

export function systemInstructionFor(req: AgentRequest): string {
  return buildSystemPrompt(req.chatOnly ? CHAT_SYSTEM_PROMPT : SYSTEM_PROMPT, {
    explainMode: req.explainMode,
    explainDepth: req.explainDepth,
    learningMode: req.learningMode,
    simplify: req.simplify,
    hasAssignmentContext: Boolean(req.assignmentContext),
    replyLanguage: req.replyLanguage,
    aiHomie: req.aiHomie,
    humanize: req.humanize,
    adaptation: req.adaptation,
  });
}

/** Chat is allowed a voice; a project turn is writing code someone has to run. */
export function temperatureFor(req: AgentRequest): number {
  if (!req.chatOnly) return 0.4;
  return req.aiHomie ? 1.0 : 0.8;
}

export function buildUserTurnText(req: AgentRequest): string {
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

/** Text-only turn for plain conversation: no file tree, no operations. */
export function buildChatTurnText(req: AgentRequest): string {
  const parts = [
    req.studentProfile ? `WHAT YOU KNOW ABOUT THE USER:\n${req.studentProfile}` : "",
    req.assignmentContext ? `THE ASSIGNMENT THEY ARE WORKING ON:\n${req.assignmentContext}` : "",
    imageNote(req),
    `USER:\n${req.prompt}`,
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

/** Back-compat: `image` is the single-attachment form, `images` the newer list. */
export function allImages(req: AgentRequest): ImageAttachment[] {
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

export function parseAgentResponse(raw: string): AgentResponse {
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
