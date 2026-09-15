import type { AgentResponse } from "@/types";
import { GeminiProvider } from "./gemini";
import {
  OpenAiCompatibleProvider,
  ProviderHttpError,
  type OpenAiCompatibleConfig,
} from "./openaiCompatible";
import {
  AiTimeoutError,
  clearProviderCooldown,
  clearProviderFailure,
  coolDownProvider,
  keyProblem,
  providerCooldown,
  recordProviderFailure,
  type AgentRequest,
  type AiProvider,
  type AttemptOptions,
  type KeySpec,
} from "./provider";
import type { ToolSession } from "./tools";

export { AiTimeoutError } from "./provider";
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
//
// COOLDOWNS
//
// A provider that has told us it is out of quota is skipped for a while rather
// than asked again on the next message — see the cooldown section in
// provider.ts for the lengths and the per-instance caveat. Two things about it
// belong here, because they are about ordering rather than about one provider:
//
// A cooldown may never empty the chain. If every provider is benched we try
// them anyway, soonest-to-expire first. A cooldown is a guess about someone
// else's quota clock, and a wrong guess must cost a slow message, never a dead
// app — the quota may well have reset and nothing here would be told.
//
// A cooldown never overrides the image rule either: the filtering happens after
// linksFor has picked who can see a photo, so a benched vision provider is
// still tried rather than the request failing as "nobody can see images".
//
// TIME
//
// The chain also owns the clock, because it is the only thing that knows how
// many providers are still to come. Two deadlines, and they do different jobs.
//
// CHAIN_BUDGET_MS is how long the whole chain may spend getting *anybody* to
// say a first word. It exists because the platform will kill the function at
// MAX_DURATION_S whatever we do, and being killed means the student gets zero
// bytes and no explanation — the worst possible outcome and the exact shape of
// the incident this was written for. Failing on our own terms, with a sentence
// they can read, is strictly better, so the budget is set well under the
// platform's ceiling and the remaining headroom belongs to writing the answer.
//
// FIRST_TOKEN_MS is one provider's slice of that budget. Healthy Groq and
// Cerebras answer in well under a second; NVIDIA and Gemini-with-minimal-
// thinking in two or three. Six seconds is roughly triple the slowest healthy
// case, which is the right place to draw the line: long enough that a merely
// busy provider is not thrown away, short enough that four dead ones still
// leave time to apologise. Four providers at six seconds is more than the
// budget allows on purpose — the last link gets whatever is actually left
// rather than a promise the clock cannot keep.
//
// After the first word there is no chain deadline at all, only the per-stream
// idle watchdog in the adapters. A long answer is allowed to take long; a dead
// socket is not allowed to take forever.
//
// KEYS
//
// A key is checked for shape before a socket is opened. This is not validation
// — only the provider can say whether a key is real — it is catching the paste
// accidents, which are the ones that fail identically on every single message.
// A 626-character GROQ_API_KEY (a JSON blob, as it turned out) cost every
// student a round-trip to rediscover the same failure, and a value with a
// newline in it is not even a legal HTTP header, so it fails inside fetch in a
// way that reads like a network fault. Skipping it costs nothing and says why.

/**
 * The platform's hard ceiling, mirrored from `maxDuration` in the route. If one
 * moves, move the other: everything below is sized to finish inside it.
 */
export const MAX_DURATION_S = 60;

/** How long the whole chain may spend reaching a first word. See TIME above. */
export const CHAIN_BUDGET_MS = 22_000;

/** One provider's slice of that budget. */
export const FIRST_TOKEN_MS = 6_000;

/**
 * Below this there is no point starting a provider: a connection alone can eat
 * it, and a doomed attempt is time the error message could have used.
 */
const MIN_ATTEMPT_MS = 1_500;

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
 * The shape of each provider's key.
 *
 * Bounds are wide on purpose. Providers rotate key formats without telling
 * anyone, and a chain that refuses a perfectly good new-format key is a worse
 * outage than the one this prevents. What these catch is the class of value
 * that cannot be a key at all: whitespace, a wrong prefix, or a length nowhere
 * near the right order of magnitude.
 */
export const KEY_SPECS: Record<string, KeySpec> = {
  // Groq issues `gsk_` + 52 characters today. 32-200 leaves room for a format
  // change and still rejects a pasted JSON blob by two orders of magnitude.
  groq: { label: "groq", variable: "GROQ_API_KEY", prefix: "gsk_", minLength: 32, maxLength: 200 },
  cerebras: {
    label: "cerebras",
    variable: "CEREBRAS_API_KEY",
    prefix: "csk-",
    minLength: 32,
    maxLength: 200,
  },
  nvidia: {
    label: "nvidia",
    variable: "NVIDIA_API_KEY",
    prefix: "nvapi-",
    minLength: 32,
    maxLength: 200,
  },
  // Google keys are `AIza...` today, but AI Studio and Vertex issue different
  // things and the prefix is the least stable of the four. Length only.
  gemini: { label: "gemini", variable: "GEMINI_API_KEY", minLength: 20, maxLength: 200 },
};

/**
 * Which malformed keys have already been complained about.
 *
 * Once per problem per instance, not once per message: a class of thirty would
 * otherwise write the same line thirty times a minute and bury everything else
 * in the log. The problem text is part of the identity, so a corrected-then-
 * broken-again key is reported afresh.
 */
const announced = new Set<string>();

/** Undefined if this provider's key is usable-looking; the reason if it is not. */
function rejectKey(name: keyof typeof KEY_SPECS, value: string): string | undefined {
  const spec = KEY_SPECS[name];
  const problem = keyProblem(spec, value);
  if (!problem) return undefined;

  const seen = `${name}:${problem}`;
  if (!announced.has(seen)) {
    announced.add(seen);
    // No part of the value is ever in `problem` — see keyProblem.
    console.error(`[ai] skipping ${name}: ${problem} Fix it and redeploy; nothing will retry it.`);
  }
  recordProviderFailure(name, { reason: problem });
  return problem;
}

/**
 * Read fresh on every request rather than cached at import, so a key added to
 * the environment takes effect without a redeploy and a revoked one stops being
 * tried.
 */
function configuredLinks(): ChainLink[] {
  const links: ChainLink[] = [];

  const groq = process.env.GROQ_API_KEY;
  if (groq && !rejectKey("groq", groq)) {
    links.push(
      openAiCompatibleLink({
        label: "groq",
        endpoint: GROQ_ENDPOINT,
        apiKey: groq,
        model: GROQ_MODEL,
      }),
    );
  }

  const cerebras = process.env.CEREBRAS_API_KEY;
  if (cerebras && !rejectKey("cerebras", cerebras)) {
    links.push(
      openAiCompatibleLink({
        label: "cerebras",
        endpoint: CEREBRAS_ENDPOINT,
        apiKey: cerebras,
        model: CEREBRAS_MODEL,
        extraBody: { reasoning_effort: "none" },
      }),
    );
  }

  const nvidia = process.env.NVIDIA_API_KEY;
  if (nvidia && !rejectKey("nvidia", nvidia)) {
    links.push(
      openAiCompatibleLink({
        label: "nvidia",
        endpoint: NVIDIA_ENDPOINT,
        apiKey: nvidia,
        model: NVIDIA_MODEL,
        acceptsImages: true,
      }),
    );
  }

  const gemini = process.env.GEMINI_API_KEY;
  if (gemini && !rejectKey("gemini", gemini)) {
    links.push({
      label: "gemini",
      acceptsImages: true,
      provider: new GeminiProvider(gemini),
    });
  }

  return links;
}

/** Time left of the chain budget, in whole milliseconds. */
function remaining(deadline: number): number {
  return deadline - Date.now();
}

/**
 * What this attempt is allowed to spend: its own slice, or whatever is left of
 * the shared budget, whichever is smaller. Undefined when there is not enough
 * left to bother.
 */
function sliceFor(deadline: number): AttemptOptions | undefined {
  const left = remaining(deadline);
  if (left < MIN_ATTEMPT_MS) return undefined;
  return {
    firstTokenTimeoutMs: Math.min(FIRST_TOKEN_MS, left),
    // Deliberately not clamped to the budget: the budget is about reaching the
    // first word. Once text is flowing the student is being served, and the
    // only thing left to guard against is a socket that has died quietly.
    idleTimeoutMs: undefined,
  };
}

class ProviderChain implements AiProvider {
  async generate(req: AgentRequest): Promise<AgentResponse> {
    const links = linksFor(req);
    const deadline = Date.now() + CHAIN_BUDGET_MS;
    let lastError: unknown;

    for (const [index, link] of links.entries()) {
      const left = remaining(deadline);
      if (left < MIN_ATTEMPT_MS) {
        lastError = outOfTime(links, index);
        break;
      }
      try {
        // A buffered turn produces nothing until it produces everything, so its
        // whole attempt has to fit inside what is left.
        const response = await link.provider.generate(req, { idleTimeoutMs: left });
        clearProviderFailure(link.label);
        clearProviderCooldown(link.label);
        return response;
      } catch (err) {
        lastError = err;
        // Logged even when it is the last link. A chain that falls all the way
        // through used to do it silently, which left nothing to debug from.
        logSkip(link.label, err, index === links.length - 1);
      }
    }

    throw lastError ?? new AiSetupError(NOT_CONFIGURED_DETAIL);
  }

  /**
   * Falls forward through the chain until one provider starts talking, then
   * commits to it. `started` is the whole discipline: after the first chunk has
   * been handed to the caller it has already reached the screen, so a failure
   * from here is propagated rather than retried.
   *
   * The budget never overrides that rule. It can stop the chain from *starting*
   * another provider, never from finishing one that is already talking.
   */
  async *generateStream(
    req: AgentRequest,
    session?: ToolSession,
  ): AsyncIterable<string> {
    const links = linksFor(req);
    const deadline = Date.now() + CHAIN_BUDGET_MS;
    let lastError: unknown;

    for (const [index, link] of links.entries()) {
      const slice = sliceFor(deadline);
      if (!slice) {
        lastError = outOfTime(links, index);
        break;
      }

      let started = false;
      try {
        for await (const chunk of link.provider.generateStream(req, session, slice)) {
          if (!chunk) continue;
          started = true;
          yield chunk;
        }
        if (started) {
          clearProviderFailure(link.label);
          clearProviderCooldown(link.label);
        }
        return;
      } catch (err) {
        lastError = err;
        const last = started || index === links.length - 1;
        logSkip(link.label, err, last, started);
        if (last) throw err;
      }
    }

    throw lastError ?? new AiSetupError(NOT_CONFIGURED_DETAIL);
  }
}

/**
 * The budget ran out with providers still untried. Said out loud, because from
 * the outside it is indistinguishable from "they all failed" and the fix is
 * completely different.
 */
function outOfTime(links: ChainLink[], index: number): AiTimeoutError {
  const untried = links.slice(index).map((l) => l.label).join(", ");
  const message =
    `the chain spent its ${CHAIN_BUDGET_MS}ms budget without a first word` +
    (untried ? `; never tried ${untried}` : "");
  console.error(`[ai] ${message}. Answering with an error rather than being killed at ${MAX_DURATION_S}s.`);
  return new AiTimeoutError(message);
}

function linksFor(req: AgentRequest): ChainLink[] {
  const links = configuredLinks();
  if (allImages(req).length === 0) {
    if (links.length === 0) throw new AiSetupError(NOT_CONFIGURED_DETAIL);
    return afterCooldowns(links);
  }

  const canSee = links.filter((link) => link.acceptsImages);
  if (canSee.length === 0) {
    throw new AiSetupError(NO_VISION_DETAIL);
  }
  return afterCooldowns(canSee);
}

/**
 * Drops the providers that said they were out of quota recently, keeping the
 * rest in their usual order.
 *
 * The important half is the fallback. If that would leave nothing, every link
 * is handed back instead, ordered by which cooldown expires first — the one
 * closest to its own stated reset is the likeliest to answer. Refusing outright
 * would mean a stale guess about someone else's quota clock could take the app
 * down for a class while the quota was in fact fine, which is a far worse
 * failure than one slow message.
 */
function afterCooldowns(links: ChainLink[]): ChainLink[] {
  const now = Date.now();
  const ready = links.filter((link) => providerCooldown(link.label, now) === undefined);
  if (ready.length > 0) {
    if (ready.length < links.length) {
      const benched = links
        .filter((link) => !ready.includes(link))
        .map((link) => {
          const cooling = providerCooldown(link.label, now);
          return `${link.label} (${Math.round(((cooling?.until ?? now) - now) / 1000)}s left)`;
        })
        .join(", ");
      console.info(`[ai] skipping ${benched}: cooling down. See /api/ai/status.`);
    }
    return ready;
  }

  console.warn(
    "[ai] every provider is cooling down; trying them anyway, soonest reset first. " +
      "A cooldown is a guess and must not be the reason nobody answers.",
  );
  return [...links].sort(
    (a, b) =>
      (providerCooldown(a.label, now)?.until ?? 0) - (providerCooldown(b.label, now)?.until ?? 0),
  );
}

/**
 * Why we moved on. The key is never part of this: a provider's own error text
 * is quoted, and nothing that was sent is.
 */
function logSkip(label: string, err: unknown, final = false, started = false): void {
  // Three facts an incident needs and the old line only had one of: who, what,
  // and whether the student had already seen words when it happened. The last
  // one decides whether falling through was even allowed.
  const when = started ? "mid-reply" : "before saying anything";
  const next = started
    ? "the reply is cut short; a retry would repeat what was already read"
    : final
      ? "and it was the last one left"
      : "trying the next provider";
  if (err instanceof ProviderHttpError) {
    // coolDownProvider decides for itself whether this status means "not now"
    // or "not with this key"; a 403 can be either and only its text says which.
    const benched = coolDownProvider(label, {
      status: err.status,
      retryAfter: err.retryAfter,
      message: err.message,
    });
    const rest = benched ? ` ${describeCooldown(benched.until)}` : "";
    if (err.status === 401 || (err.status === 403 && benched?.source === "bad-key")) {
      recordProviderFailure(label, { status: err.status, reason: "the provider rejected the key" });
      // The key itself is never in this line — only that one was rejected.
      console.error(
        `[ai] ${label} rejected the API key (${err.status}) ${when}. Check that key — the ` +
          `request itself was fine.${rest} A new key needs a redeploy, which clears this anyway.`,
      );
      return;
    }
    const retry = err.retryAfter ? `, retry-after=${err.retryAfter}` : "";
    if (err.status === 429 || err.status === 503 || err.status === 402 || err.status === 403) {
      recordProviderFailure(label, { status: err.status, reason: "out of capacity" });
      console.warn(
        `[ai] ${label} is out of capacity (${err.status}${retry}) ${when}, ${next}.${rest}`,
      );
      return;
    }
    recordProviderFailure(label, { status: err.status, reason: err.message });
    console.warn(`[ai] ${label} failed (${err.status}${retry}) ${when}, ${next}: ${err.message}`);
    return;
  }
  const reason = err instanceof Error ? err.message : String(err ?? "unknown");
  // Gemini answers through an SDK, so its quota refusals arrive as an ordinary
  // Error with the status buried in the text. Nothing here is benched unless
  // that text actually reads like a quota — a timeout or a dropped socket says
  // nothing about availability, and benching on one would take a healthy
  // provider out over a single bad minute.
  const benched = coolDownProvider(label, { message: reason });
  recordProviderFailure(label, { reason });
  console.warn(
    `[ai] ${label} failed ${when}, ${next}: ${reason}` +
      (benched ? ` ${describeCooldown(benched.until)}` : ""),
  );
}

/** "Not trying it again for 60s." — the same sentence wherever a bench is logged. */
function describeCooldown(until: number): string {
  return `Not trying it again for ${Math.max(1, Math.round((until - Date.now()) / 1000))}s.`;
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

  if (err instanceof AiTimeoutError) {
    return "Panda is taking too long to answer right now. Try again in a moment.";
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
