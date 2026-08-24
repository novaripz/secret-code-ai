import { GeminiProvider } from "./gemini";
import type { AiProvider } from "./provider";

export type { AiProvider, AgentRequest, AiMessage } from "./provider";

/**
 * Single place that decides which AI provider backs the coding agent.
 * To swap providers later (OpenAI, Anthropic, ...), implement AiProvider
 * in a new file and change this factory — nothing else in the app needs to change.
 */
export function getAiProvider(): AiProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your .env.local file (see .env.example)."
    );
  }
  return new GeminiProvider(apiKey);
}
