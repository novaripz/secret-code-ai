import type { AgentResponse } from "@/types";
import type { ExplainDepth, LearningMode } from "./systemPrompt";
import type { ToolSession } from "./tools";

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
  /**
   * The assignment being worked on, and the teacher's rules for it.
   *
   * Present only for a class chat. Personal Panda never carries this, which is
   * what keeps assignment contents out of the general planner.
   */
  assignmentContext?: string;
  /**
   * What the student has been struggling with, already rendered as prompt text
   * by `buildAdaptiveAddendum`. Empty or absent when the evidence is thin —
   * which is the normal case for a new student and must stay silent.
   */
  adaptation?: string;
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
  generate(request: AgentRequest, options?: AttemptOptions): Promise<AgentResponse>;
  /**
   * Plain-prose streaming for chat. Yields text as the model produces it, so
   * the UI can render each piece the moment it arrives instead of waiting for
   * the whole reply.
   *
   * Only meaningful for `chatOnly` requests. Project requests answer in JSON,
   * which cannot be parsed until it is complete, so those still use generate().
   *
   * `session` is present only when web search is configured and this is a chat
   * turn. Without it a provider sends exactly the request it always sent — no
   * tool declarations, no extra round-trip, no change to how soon the first
   * word arrives, which is the thing this chain exists to protect.
   */
  generateStream(
    request: AgentRequest,
    session?: ToolSession,
    options?: AttemptOptions,
  ): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// Deadlines, key shape, and the record of who failed last.
//
// All three live here rather than in chain.ts because they are facts about "a
// provider attempt" rather than about the order providers are tried in, and
// because /api/ai/status wants two of them without importing the chain (which
// would drag the Gemini SDK into a health check).
//
// The incident this exists for: GROQ_API_KEY was pasted as a 626-character
// blob. Nothing checked it, so every single message spent a real network
// round-trip discovering the same thing again, and with no deadline anywhere a
// provider that simply never answered held the whole request until the
// platform killed it — the student saw zero bytes for a minute. Shape is now
// checked before the socket is opened, and every attempt carries a clock.
// ---------------------------------------------------------------------------

/**
 * A deadline was reached: either one provider's, or the chain's own budget.
 *
 * A distinct type because it is the one failure that is nobody's fault and
 * says nothing about configuration — the student should be told to wait, not
 * that something is broken.
 */
export class AiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTimeoutError";
  }
}

/** What a single provider attempt is allowed to spend. */
export interface AttemptOptions {
  /**
   * How long the provider has to produce its first piece of output. After that
   * the attempt is abandoned and the chain moves on — it is still safe to move
   * on, because nothing has reached the student yet.
   */
  firstTokenTimeoutMs?: number;
  /**
   * How long a gap is tolerated once text is flowing. Not a total budget: a
   * long answer legitimately takes a long time, and cutting it off would lose
   * words the student was already reading. This only catches a stream that has
   * gone dead without closing.
   */
  idleTimeoutMs?: number;
}

/**
 * The shape of a provider's key, as much of it as can be checked for free.
 *
 * Deliberately loose. The point is not to validate a key — only the provider
 * can do that — but to catch the paste accidents that are certain to fail:
 * a JSON blob, two keys at once, a value with a newline in it (which is not
 * even a legal HTTP header value), or a truncated fragment.
 */
export interface KeySpec {
  label: string;
  variable: string;
  /** Every key this provider issues starts with this. Omitted where there is no stable prefix. */
  prefix?: string;
  minLength: number;
  maxLength: number;
}

/**
 * Why this key cannot possibly work, or undefined if it might.
 *
 * Never quotes, hashes, or excerpts the value: a reason that contains key
 * material would end up in a log, and a log is the least private place we
 * have. Lengths are fine — /api/ai/status already reports them.
 */
export function keyProblem(spec: KeySpec, raw: string | undefined): string | undefined {
  if (!raw) return undefined; // Absent is "not configured", not "malformed".
  if (raw !== raw.trim()) {
    return `${spec.variable} has leading or trailing whitespace.`;
  }
  if (/\s/.test(raw)) {
    // An HTTP header value cannot contain a newline at all, so this one does
    // not even reach the provider — fetch throws before the request is sent.
    return `${spec.variable} contains whitespace or a line break, so it is not one key.`;
  }
  if (raw.length < spec.minLength || raw.length > spec.maxLength) {
    return (
      `${spec.variable} is ${raw.length} characters; a ${spec.label} key is ` +
      `${spec.minLength}-${spec.maxLength}. It looks like a truncated paste, a JSON blob, or ` +
      `several keys at once.`
    );
  }
  if (spec.prefix && !raw.startsWith(spec.prefix)) {
    return `${spec.variable} does not start with "${spec.prefix}", which every ${spec.label} key does.`;
  }
  return undefined;
}

/** The last thing that went wrong for one provider. Never holds key material. */
export interface ProviderFailure {
  /** Student-safe, operator-readable. Provider error text, never request content. */
  reason: string;
  /** HTTP status when there was one. */
  status?: number;
  /** Epoch milliseconds. */
  at: number;
}

const failures = new Map<string, ProviderFailure>();

/**
 * Remembered in module scope, which on a serverless platform means "for as long
 * as this instance lives". That is the honest limitation: it is a debugging aid
 * for an incident in progress, not a metrics store, and a cold start forgets it.
 */
export function recordProviderFailure(label: string, failure: Omit<ProviderFailure, "at">): void {
  failures.set(label, { ...failure, at: Date.now() });
}

export function clearProviderFailure(label: string): void {
  failures.delete(label);
}

/** For /api/ai/status: what each provider did last, if anything. */
export function lastProviderFailures(): Record<string, ProviderFailure> {
  return Object.fromEntries(failures);
}

// ---------------------------------------------------------------------------
// Cooldowns: remembering that a provider already said "not now".
//
// Failover alone re-discovers an exhausted provider on every single message.
// Gemini's free tier is 20 requests a DAY, and Groq's and Cerebras' are not
// much bigger against a class of thirty; once one is spent, every later message
// pays a full round-trip to be told the same thing before reaching a provider
// that works. A class hitting limits mid-period feels the app get slower and
// slower with nothing on screen to explain it. So a provider that reports being
// out is remembered and skipped for a while.
//
// Same honest caveat as the rate limiter in lib/security/rateLimit.ts: this is
// a Map in one server process. On a serverless deployment every instance keeps
// its own, so a cooldown learned by one instance does nothing for the next
// request if it lands elsewhere, and a cold start forgets everything. That
// makes it a latency optimisation that degrades to today's behaviour, not a
// quota accountant. A shared store would fix it, and is not worth its cost
// until traffic justifies one.
// ---------------------------------------------------------------------------

/**
 * The shortest cooldown worth having.
 *
 * Sixty seconds because the smallest limit any of these providers enforces is
 * per-minute: if what we hit was a burst limit, it has cleared by the time this
 * expires and the provider is tried again on the next message, costing that
 * message nothing.
 */
const BASE_COOLDOWN_MS = 60_000;

/**
 * The longest a quota cooldown may grow to.
 *
 * A daily quota and a per-minute burst limit look identical from here — both
 * are a 429, and only some providers send Retry-After. We cannot tell them
 * apart, so we do not pretend to: the cooldown starts at a minute and doubles
 * each time the provider is tried again and says no again. A burst limit stops
 * at the first step; a spent daily quota climbs out of the way within a few
 * messages. The cap exists because quotas do reset, and nothing here is told
 * when: fifteen minutes is the longest we are willing to keep a recovered
 * provider benched.
 */
const MAX_COOLDOWN_MS = 15 * 60_000;

/**
 * A rejected key. Not a quota problem and it will not fix itself — the value in
 * the environment has to change, which on every platform we deploy to means a
 * restart, which clears this Map anyway. So the number only has to be long
 * enough to stop paying for the same rejection all lesson.
 */
const BAD_KEY_COOLDOWN_MS = 60 * 60_000;

/**
 * A model id this key cannot call. Same shape of problem as a rejected key and
 * the same remedy: a value in the environment has to change. Benched for as
 * long, because retrying it costs a round trip and can never succeed until
 * somebody redeploys -- which clears this Map anyway.
 */
const MISCONFIGURED_COOLDOWN_MS = BAD_KEY_COOLDOWN_MS;

/**
 * A provider that accepted the request and then said nothing at all until we
 * gave up waiting.
 *
 * This used to be deliberately un-benched, on the reasoning that a timeout says
 * nothing about availability. That reasoning was right about mid-stream
 * timeouts and wrong about this one, and production showed the difference:
 * NVIDIA answered no project request, ever, and because silence left no record,
 * every single request paid its full first-token allowance to rediscover that.
 *
 * Shorter than a bad key, because silence really can be one bad minute, and it
 * doubles like a quota refusal so a provider that is simply gone stops being
 * asked. Any answer at all clears it.
 */
const SILENCE_COOLDOWN_MS = 2 * 60_000;

/** Retry-After is a provider's own number, but it is still bounded by ours. */
const MIN_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 60 * 60_000;

export interface ProviderCooldown {
  /** Epoch milliseconds. Before this, skip the provider if there is an alternative. */
  until: number;
  /** Why, in words an operator can act on. Never contains key material. */
  reason: string;
  /** HTTP status that caused it, when there was one. */
  status?: number;
  /** Where the length came from: the provider said so, or we guessed. */
  source: "retry-after" | "backoff" | "bad-key" | "misconfigured" | "silent";
}

interface CooldownEntry extends ProviderCooldown {
  /** How many quota refusals in a row, which is what doubles the next wait. */
  strikes: number;
}

/**
 * How long an expired cooldown is still remembered.
 *
 * It has to outlive the cooldown itself, or the doubling could never happen:
 * the provider is only retried after its wait expires, so if expiry forgot
 * everything, every refusal would look like the first one and a spent daily
 * quota would be re-checked once a minute all day. Keeping the record for one
 * more full cap past expiry means a provider that goes quiet for a quarter of
 * an hour is genuinely treated as recovered, and one that is still refusing
 * carries its count forward.
 */
const STRIKE_MEMORY_MS = MAX_COOLDOWN_MS;

const cooldowns = new Map<string, CooldownEntry>();

/**
 * Text that means "you are over a limit" rather than "your key is wrong".
 *
 * This is the only way to tell a quota 403 from a bad-key 403. Google returns
 * 403 with RESOURCE_EXHAUSTED or a billing message for a spent free tier and
 * 403 with PERMISSION_DENIED for a key that is not allowed to be there, and the
 * status alone does not separate them. Matching the message is guessing, and it
 * guesses in the safe direction: an unmatched 403 is treated as a bad key, so
 * it stays skipped rather than being retried every minute forever.
 */
const QUOTA_TEXT =
  /quota|rate.?limit|resource.?exhausted|too many requests|exceed|insufficient|billing|credit|out of capacity|429/i;

/**
 * Text that means "that model is not a thing you can call", as opposed to any
 * other 404. Providers word it differently and all of them say the model is
 * either absent or closed to this account; either way the id in the environment
 * is wrong and no amount of retrying fixes it.
 */
const MISSING_MODEL_TEXT =
  /does not exist|do not have access|unknown model|model.?not.?found|no such model|invalid.?model/i;

/** The watchdog's own wording when a provider never sent a first token. */
const SILENCE_TEXT = /sent nothing for \d+ms/i;

/** Retry-After in milliseconds: delta-seconds or an HTTP date. Undefined if neither. */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.min(Math.max(ms, MIN_RETRY_AFTER_MS), MAX_RETRY_AFTER_MS);
}

export interface CooldownSignal {
  /** HTTP status, when the failure carried one. */
  status?: number;
  /** The provider's Retry-After header, verbatim, when it sent one. */
  retryAfter?: string | null;
  /** The provider's error text. Used only to tell a quota 403 from a bad-key 403. */
  message?: string;
}

/**
 * Decide whether this failure means "not now" or "not with this key", and bench
 * the provider accordingly. Returns the cooldown, or undefined for a failure
 * that says nothing about availability — a timeout, a 500, a dropped socket.
 * Those are already handled by falling through to the next provider, and
 * benching on them would take a provider out over one bad minute.
 */
export function coolDownProvider(
  label: string,
  signal: CooldownSignal,
): ProviderCooldown | undefined {
  const { status, message = "" } = signal;
  const quotaShaped = status === 429 || status === 402 || QUOTA_TEXT.test(message);
  const keyShaped = status === 401 || (status === 403 && !QUOTA_TEXT.test(message));
  const modelShaped = (status === 404 || status === 400) && MISSING_MODEL_TEXT.test(message);

  if (modelShaped) {
    const entry: CooldownEntry = {
      until: Date.now() + MISCONFIGURED_COOLDOWN_MS,
      // Named so /api/ai/status points at the fix rather than at the symptom.
      reason: "the configured model id is not one this key can call",
      status,
      source: "misconfigured",
      strikes: 0,
    };
    cooldowns.set(label, entry);
    return entry;
  }

  if (keyShaped) {
    const entry: CooldownEntry = {
      until: Date.now() + BAD_KEY_COOLDOWN_MS,
      reason: "the provider rejected the key",
      status,
      source: "bad-key",
      strikes: 0,
    };
    cooldowns.set(label, entry);
    return entry;
  }

  if (!quotaShaped) {
    if (status !== undefined || !SILENCE_TEXT.test(message)) return undefined;
    // Silence doubles the same way a refusal does, and for the same reason: one
    // quiet minute is forgivable, a provider that is never there should stop
    // being paid for.
    const before = cooldowns.get(label);
    const carried =
      before !== undefined &&
      before.source === "silent" &&
      Date.now() - before.until <= STRIKE_MEMORY_MS
        ? before.strikes
        : 0;
    const count = carried + 1;
    const entry: CooldownEntry = {
      until: Date.now() + Math.min(SILENCE_COOLDOWN_MS * 2 ** (count - 1), MAX_COOLDOWN_MS),
      reason: "accepted the request and then sent nothing",
      source: "silent",
      strikes: count,
    };
    cooldowns.set(label, entry);
    return entry;
  }

  const previous = cooldowns.get(label);
  // Strikes accumulate across refusals, including ones separated by an expired
  // cooldown — that sequence IS the signal that this is a daily quota rather
  // than a burst limit. Any success clears the entry outright, and so does a
  // long enough silence, so a provider that recovers starts from a minute again.
  const fresh =
    previous === undefined ||
    previous.source !== "backoff" ||
    Date.now() - previous.until > STRIKE_MEMORY_MS;
  const strikes = (fresh ? 0 : previous.strikes) + 1;
  const stated = parseRetryAfter(signal.retryAfter);
  const backoff = Math.min(BASE_COOLDOWN_MS * 2 ** (strikes - 1), MAX_COOLDOWN_MS);
  const entry: CooldownEntry = {
    until: Date.now() + (stated ?? backoff),
    reason: stated
      ? "over its limit; the provider asked us to wait this long"
      : "over its limit; waiting a guessed interval because it sent no Retry-After",
    status,
    source: stated ? "retry-after" : "backoff",
    strikes,
  };
  cooldowns.set(label, entry);
  return entry;
}

/**
 * The live cooldown for this provider, or undefined if it is free to try.
 *
 * An expired entry is kept, not deleted: its strike count is what tells a
 * daily quota from a one-off burst. It stops being a reason to skip the moment
 * it expires, and is thrown away entirely once it is STRIKE_MEMORY_MS stale.
 */
export function providerCooldown(label: string, now = Date.now()): ProviderCooldown | undefined {
  const entry = cooldowns.get(label);
  if (!entry) return undefined;
  if (entry.until <= now) {
    if (now - entry.until > STRIKE_MEMORY_MS) cooldowns.delete(label);
    return undefined;
  }
  return entry;
}

/** A provider answered, so whatever we remembered about it is stale. */
export function clearProviderCooldown(label: string): void {
  cooldowns.delete(label);
}

/** For /api/ai/status: who is benched and until when. */
export function providerCooldowns(): Record<string, ProviderCooldown> {
  const now = Date.now();
  const live: Record<string, ProviderCooldown> = {};
  for (const label of cooldowns.keys()) {
    const entry = providerCooldown(label, now);
    if (entry) live[label] = entry;
  }
  return live;
}
