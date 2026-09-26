// Which model answers. Claude is used whenever ANTHROPIC_API_KEY is set;
// otherwise the first configured OpenAI-compatible provider. AI_PROVIDER
// forces a choice. Nothing is faked when none is configured: the agent
// reports that it is not set up, and every non-AI feature keeps working.

import { AnthropicProvider } from "./anthropic";
import { OpenAiCompatibleProvider } from "./openaiCompatible";
import { ProviderError, type Provider } from "./types";

export interface ProviderStatus {
  configured: boolean;
  active?: { id: string; label: string; model: string };
  available: { id: string; label: string; model: string }[];
  hint?: string;
}

function candidates(): Provider[] {
  const out: Provider[] = [];
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) out.push(new AnthropicProvider());
  if (process.env.OPENAI_API_KEY) {
    out.push(
      new OpenAiCompatibleProvider({
        id: "openai",
        label: "OpenAI",
        endpoint: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1") + "/chat/completions",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-5",
      }),
    );
  }
  if (process.env.GEMINI_API_KEY) {
    out.push(
      new OpenAiCompatibleProvider({
        id: "gemini",
        label: "Gemini",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
      }),
    );
  }
  if (process.env.OPENROUTER_API_KEY) {
    out.push(
      new OpenAiCompatibleProvider({
        id: "openrouter",
        label: "OpenRouter",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || "anthropic/claude-opus-5",
      }),
    );
  }
  if (process.env.GROQ_API_KEY) {
    out.push(
      new OpenAiCompatibleProvider({
        id: "groq",
        label: "Groq",
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      }),
    );
  }
  return out;
}

export function providerStatus(): ProviderStatus {
  const list = candidates();
  const forced = process.env.AI_PROVIDER;
  const active = (forced && list.find((p) => p.id === forced)) || list[0];
  return {
    configured: !!active,
    active: active && { id: active.id, label: active.label, model: active.model },
    available: list.map((p) => ({ id: p.id, label: p.label, model: p.model })),
    hint: active
      ? undefined
      : "No AI provider is configured. Set ANTHROPIC_API_KEY (recommended) or OPENAI_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY in .env.local and restart.",
  };
}

export function getProvider(preferred?: string): Provider {
  const list = candidates();
  const want = preferred || process.env.AI_PROVIDER;
  const p = (want && list.find((x) => x.id === want)) || list[0];
  if (!p) throw new ProviderError(providerStatus().hint!, "setup");
  return p;
}
