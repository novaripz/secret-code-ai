import type { AgentResponse } from "@/types";

/** A single message in the conversation sent to the model. */
export interface AiMessage {
  role: "user" | "assistant";
  content: string;
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
}

/**
 * Provider-agnostic interface for the AI coding agent. Implement this for
 * any backend (Gemini, OpenAI, Anthropic, ...) and swap via lib/ai/index.ts
 * without touching API routes or the client.
 */
export interface AiProvider {
  generate(request: AgentRequest): Promise<AgentResponse>;
}
