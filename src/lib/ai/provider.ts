import type { AgentResponse } from "@/types";
import type { ExplainDepth, LearningMode } from "./systemPrompt";

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
  /** How much explaining to do when explainMode is on. */
  explainDepth?: ExplainDepth;
  /** How freely answers may be handed over. */
  learningMode?: LearningMode;
  /** The student pressed "I don't understand": re-explain, don't restate. */
  simplify?: boolean;
  /** Language Panda should answer in. */
  replyLanguage?: string;
  /** Plain, everyday writing for essays and emails. */
  humanize?: boolean;
  /** When true, answer in a casual, Gen-Z, friend-to-friend voice. */
  aiHomie?: boolean;
  /** Plain conversation with no project open: reply as text, never as file operations. */
  chatOnly?: boolean;
  /** Short plain-language summary of what's already been built in this project ("working memory"). */
  projectMemory?: string;
  /** Short plain-language facts about the student, carried across projects. */
  studentProfile?: string;
  /** Optional screenshot the student captured (e.g. of their preview or the whole tab). */
  image?: ImageAttachment;
  /** Everything the student attached to this message (screenshots, photos, pasted images). */
  images?: ImageAttachment[];
}

/**
 * Provider-agnostic interface for the AI coding agent. Implement this for
 * any backend (Gemini, OpenAI, Anthropic, ...) and swap via lib/ai/index.ts
 * without touching API routes or the client.
 */
export interface AiProvider {
  generate(request: AgentRequest): Promise<AgentResponse>;
  /**
   * Plain-prose streaming for chat. Yields text as the model produces it, so
   * the UI can render each piece the moment it arrives instead of waiting for
   * the whole reply.
   *
   * Only meaningful for `chatOnly` requests. Project requests answer in JSON,
   * which cannot be parsed until it is complete, so those still use generate().
   */
  generateStream(request: AgentRequest): AsyncIterable<string>;
}
