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
