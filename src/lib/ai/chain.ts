import type { AgentResponse } from "@/types";
import { GeminiProvider } from "./gemini";
import {
  OpenAiCompatibleProvider,
  ProviderHttpError,
  type OpenAiCompatibleConfig,
} from "./openaiCompatible";
import type { AgentRequest, AiProvider } from "./provider";
import { allImages } from "./turn";

// Which model answers, decided per request.
//
// Gemini on its own was two problems. Its free tier is spent by one class
// sharing it, and it sits thinking for seconds before the first word, so the
// screen stays empty and then the whole answer lands at once. Groq, Cerebras
// and NVIDIA NIM are all free, all speak the same dialect, and all start
// writing sooner, so they go in front and Gemini becomes the safety net rather
// than the only net.
//
// Order is by how quickly each one starts talking, which is not the same as how
// fast it finishes: a model that runs a hidden reasoning pass loses this race
// before it generates a token. Groq is first on raw speed. Cerebras is next,
// with Qwen's reasoning switched off. NVIDIA is third — it is the only one here
// that can look at a photo, so an image request skips straight to it — and
// Gemini is last, holding its quota for the days the others are down.
//
// The one rule that is not about speed: a provider is only ever abandoned
// before it has produced text. Starting over after that would replay words the
// student has already read.

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_ENDPOINT = "https://api.cerebras.ai/v1/chat/completions";
const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

// Groq's fastest production model that does no reasoning pass at all, so the
// first word arrives immediately — the thing this whole chain exists for. Groq
// also serves gpt-oss faster on paper, but gpt-oss cannot turn reasoning off,
// which brings back the silence we are removing. Drop to "llama-3.1-8b-instant"
// if the free quota, rather than latency, becomes what hurts.
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Qwen reasons by default. `reasoning_effort: "none"` is what keeps Cerebras
// answering as promptly as Groq, and it is the only one of these models where
// reasoning can be switched off outright rather than merely turned down.
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "qwen-3.8-27b";

// The vision seat. Students photograph their homework, and this is the only
// OpenAI-compatible model here that can read the photo, so the model choice is
// decided by that rather than by speed. Not a reasoning model, so no
// reasoning_effort is sent — asking for more thinking is the opposite of what
// this chain is for. "meta/llama-3.2-11b-vision-instruct" is the faster, weaker
// swap.
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.2-90b-vision-instruct";

// Two texts for the same fact. The first is for the server log, where whoever
// runs Panda needs the variable names; the second is what a student sees, and
// it never names a vendor, a status code or a key.
const NOT_CONFIGURED_DETAIL =
  "No AI provider is configured. Set GROQ_API_KEY, CEREBRAS_API_KEY, NVIDIA_API_KEY or " +
  "GEMINI_API_KEY in your .env.local file (see .env.example).";

const NO_VISION_DETAIL =
  "Looking at an attached image needs NVIDIA_API_KEY or GEMINI_API_KEY — the other providers " +
  "are text-only.";

/**
 * A failure that is about how this deployment is set up, not about a provider
 * misbehaving. Kept apart so the student-facing sentence can say "not set up"
 * rather than "try again in a minute", which would be a lie.
 */
export class AiSetupError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "AiSetupError";
  }
}

interface ChainLink {
  label: string;
  /** A photo is only ever sent somewhere that can see it. */
  acceptsImages: boolean;
  provider: AiProvider;
}

function openAiCompatibleLink(config: OpenAiCompatibleConfig): ChainLink {
  return {
    label: config.label,
    acceptsImages: config.acceptsImages === true,
    provider: new OpenAiCompatibleProvider(config),
  };
}

/**
 * Read fresh on every request rather than cached at import, so a key added to
 * the environment takes effect without a redeploy and a revoked one stops being
 * tried.
 */
function configuredLinks(): ChainLink[] {
  const links: ChainLink[] = [];

  if (process.env.GROQ_API_KEY) {
    links.push(
      openAiCompatibleLink({
        label: "groq",
        endpoint: GROQ_ENDPOINT,
        apiKey: process.env.GROQ_API_KEY,
        model: GROQ_MODEL,
      }),
    );
  }

  if (process.env.CEREBRAS_API_KEY) {
    links.push(
      openAiCompatibleLink({
        label: "cerebras",
        endpoint: CEREBRAS_ENDPOINT,
        apiKey: process.env.CEREBRAS_API_KEY,
        model: CEREBRAS_MODEL,
        extraBody: { reasoning_effort: "none" },
      }),
    );
  }

  if (process.env.NVIDIA_API_KEY) {
    links.push(
      openAiCompatibleLink({
        label: "nvidia",
        endpoint: NVIDIA_ENDPOINT,
        apiKey: process.env.NVIDIA_API_KEY,
        model: NVIDIA_MODEL,
        acceptsImages: true,
      }),
    );
  }

  if (process.env.GEMINI_API_KEY) {
    links.push({
      label: "gemini",
      acceptsImages: true,
      provider: new GeminiProvider(process.env.GEMINI_API_KEY),
    });
  }

  return links;
}

class ProviderChain implements AiProvider {
  async generate(req: AgentRequest): Promise<AgentResponse> {
    const links = linksFor(req);
    let lastError: unknown;

    for (const [index, link] of links.entries()) {
      try {
        return await link.provider.generate(req);
      } catch (err) {
        lastError = err;
        // Logged even when it is the last link. A chain that falls all the way
        // through used to do it silently, which left nothing to debug from.
        logSkip(link.label, err, index === links.length - 1);
        if (index === links.length - 1) throw err;
      }
    }

    throw lastError;
  }

  /**
   * Falls forward through the chain until one provider starts talking, then
   * commits to it. `started` is the whole discipline: after the first chunk has
   * been handed to the caller it has already reached the screen, so a failure
   * from here is propagated rather than retried.
   */
  async *generateStream(req: AgentRequest): AsyncIterable<string> {
    const links = linksFor(req);
    let lastError: unknown;

    for (const [index, link] of links.entries()) {
      let started = false;
      try {
        for await (const chunk of link.provider.generateStream(req)) {
          if (!chunk) continue;
          started = true;
          yield chunk;
        }
        return;
      } catch (err) {
        lastError = err;
        const last = started || index === links.length - 1;
        logSkip(link.label, err, last);
        if (last) throw err;
      }
    }

    throw lastError;
  }
}

function linksFor(req: AgentRequest): ChainLink[] {
  const links = configuredLinks();
  if (allImages(req).length === 0) {
    if (links.length === 0) throw new AiSetupError(NOT_CONFIGURED_DETAIL);
    return links;
  }

  const canSee = links.filter((link) => link.acceptsImages);
  if (canSee.length === 0) {
    throw new AiSetupError(NO_VISION_DETAIL);
  }
  return canSee;
}

/**
 * Why we moved on. The key is never part of this: a provider's own error text
 * is quoted, and nothing that was sent is.
 */
function logSkip(label: string, err: unknown, final = false): void {
  const next = final ? "and it was the last one left" : "trying the next provider";
  if (err instanceof ProviderHttpError) {
    if (err.status === 401 || err.status === 403) {
      console.error(
        `[ai] ${label} rejected the API key (${err.status}). Check that key — the request itself was fine.`,
      );
      return;
    }
    const retry = err.retryAfter ? `, retry-after=${err.retryAfter}` : "";
    if (err.status === 429 || err.status === 503) {
      console.warn(`[ai] ${label} is out of capacity (${err.status}${retry}), ${next}.`);
      return;
    }
    console.warn(`[ai] ${label} failed (${err.status}${retry}), ${next}: ${err.message}`);
    return;
  }
  console.warn(
    `[ai] ${label} failed before saying anything, ${next}:`,
    err instanceof Error ? err.message : err,
  );
}

/**
 * The one sentence a student is allowed to see when generation fails.
 *
 * A provider's own error text is a wall of JSON — quota metrics, retry delays,
 * documentation links — and a student once got forty lines of it rendered as
 * Panda's reply. Nothing from a provider passes through here: the raw text is
 * logged by the caller and this returns plain English that does not say which
 * company failed, what the status code was, or that there are several providers
 * at all.
 */
export function describeAiFailure(err: unknown): string {
  if (err instanceof AiSetupError) {
    return "Panda isn't finished being set up on this server yet. Whoever runs it needs to add an AI key.";
  }

  if (err instanceof ProviderHttpError) {
    if (err.status === 429 || err.status === 503 || err.status === 402) {
      return "Panda is over its limit for now. Try again in a minute.";
    }
    if (err.status === 401 || err.status === 403) {
      // A rejected key is a setup problem, and telling a student to try again
      // would waste their time on something only an adult can fix.
      return "Panda isn't set up correctly on this server. Let whoever runs it know.";
    }
    return "Panda couldn't finish that one. Try asking again.";
  }

  const text = err instanceof Error ? err.message : String(err ?? "");
  if (/quota|rate limit|too many requests|exhausted|429|insufficient/i.test(text)) {
    return "Panda is over its limit for now. Try again in a minute.";
  }
  if (/fetch failed|ENOTFOUND|ECONNRE|EAI_AGAIN|network|timeout|timed out|abort/i.test(text)) {
    return "Panda couldn't reach the AI. Check the connection and try again.";
  }
  return "Panda couldn't finish that one. Try asking again.";
}

/**
 * The one place that decides who answers. Throws when nothing is configured, so
 * a missing key is a clear server error rather than a silent empty reply.
 */
export function getProviderChain(): AiProvider {
  if (configuredLinks().length === 0) throw new AiSetupError(NOT_CONFIGURED_DETAIL);
  return new ProviderChain();
}
