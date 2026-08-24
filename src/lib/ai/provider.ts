import type { AgentResponse } from "@/types";

/** A single message in the conversation sent to the model. */
export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ImageAttachment {
  /** Base64-encoded image data, no "data:" prefix. */
  data: string;
  mimeType: string;
}

export interface AgentRequest {
  /** The user's latest natural-language instruction. */
  prompt: string;
  /** Text rendering of the project's file tree. */
  fileTree: string;
  /** Selected file contents relevant to this request, keyed by path. */
  contextFiles: Record<string, string>;
  /** Prior turns, most recent last. */
  history: AiMessage[];
  /** When true, the model should explain things in very simple, beginner-friendly terms. */
  explainMode?: boolean;
  /** Short plain-language summary of what's already been built in this project ("working memory"). */
  projectMemory?: string;
  /** Short plain-language facts about the student, carried across projects. */
  studentProfile?: string;
  /** Optional screenshot the student captured (e.g. of their preview or the whole tab). */
  image?: ImageAttachment;
}

/**
 * Provider-agnostic interface for the AI coding agent. Implement this for
 * any backend (Gemini, OpenAI, Anthropic, ...) and swap via lib/ai/index.ts
 * without touching API routes or the client.
 */
export interface AiProvider {
  generate(request: AgentRequest): Promise<AgentResponse>;
}
