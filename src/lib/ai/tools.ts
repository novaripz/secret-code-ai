// The search tool, and the bookkeeping around letting a model call it.
//
// The decision this file encodes: Panda does not search every message. Most of
// what a student asks — "explain photosynthesis", "why is my loop wrong" — is
// answered better and three seconds faster from what the model already knows,
// and searching all of it would burn a month of free quota in a week. So the
// model decides, through tool calling, and the tool's description is written to
// push it toward the three cases where searching actually helps: something
// recent, a specific checkable fact, and "give me a source". The description
// also says, in as many words, not to call it for explanation — models reach
// for a tool that exists unless told when not to.
//
// The rest is a leash. A confused model can ask for search forever; MAX_TOOL_ROUNDS
// stops it. A model can ask the same question twice; the session remembers
// answers so the second ask is free. Neither is theoretical — both are what a
// shared classroom key runs out on.

import { Type } from "@google/genai";

import { searchWeb, type SearchResult } from "./search";

/**
 * How many times the model may go "search, then think again" in one reply.
 *
 * Two is the honest number. One round covers every real case (ask, read, answer);
 * a second lets it follow up when the first query was badly worded. Past that it
 * is looping, not researching, and each round is a full extra model call plus a
 * search credit, paid for out of a classroom's monthly allowance while the
 * student watches a spinner.
 */
export const MAX_TOOL_ROUNDS = 2;

export const SEARCH_TOOL_NAME = "search_web";

const SEARCH_TOOL_DESCRIPTION =
  "Search the live web and get back a short list of sources with titles, URLs and snippets. " +
  "Call this ONLY when the answer depends on information you cannot already be sure of: " +
  "current or recent events, anything after your training cutoff, prices, versions, dates, " +
  "scores, who currently holds a position, or when the user explicitly asks for a source, " +
  "a link, or a citation. Do NOT call it to explain a concept, define a word, help with " +
  "homework reasoning, review code, do maths, or chat — answer those directly and immediately, " +
  "because calling this makes the user wait. If you are confident without it, do not call it.";

const QUERY_DESCRIPTION =
  "A short web search query, the way you would type it into a search engine. " +
  "Keywords, not a sentence, and no more than about ten words.";

/** OpenAI-compatible tool declaration (Groq, Cerebras, NVIDIA all take this). */
export function openAiSearchTool() {
  return {
    type: "function" as const,
    function: {
      name: SEARCH_TOOL_NAME,
      description: SEARCH_TOOL_DESCRIPTION,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: QUERY_DESCRIPTION },
        },
        required: ["query"],
      },
    },
  };
}

/** The same tool in Gemini's function-declaration spelling. */
export function geminiSearchTool() {
  return {
    functionDeclarations: [
      {
        name: SEARCH_TOOL_NAME,
        description: SEARCH_TOOL_DESCRIPTION,
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: QUERY_DESCRIPTION },
          },
          required: ["query"],
        },
      },
    ],
  };
}

/**
 * What the server tells the client it is doing, so a tool round-trip is a
 * visible "Searching the web…" instead of several dead seconds. The route turns
 * these into stream frames; nothing here knows about HTTP.
 */
export type ProgressEvent =
  | { kind: "thinking" }
  | { kind: "searching"; query: string }
  | { kind: "reading"; query: string; count: number }
  | { kind: "search_failed"; reason: "rate-limited" | "unavailable" };

/**
 * One reply's worth of tool state. Created per request, thrown away after, so
 * nothing leaks between students.
 *
 * A session is also what makes provider fallback safe: if a provider dies after
 * searching but before writing a word, the chain moves on to the next one, and
 * that one gets the cached results instead of spending another credit on the
 * same query.
 */
export class ToolSession {
  private rounds = 0;
  private readonly cache = new Map<string, SearchResult[]>();
  /** Insertion-ordered by URL, so the same page cited twice appears once. */
  private readonly cited = new Map<string, SearchResult>();

  constructor(private readonly emit: (event: ProgressEvent) => void) {}

  /** False once the leash is out; providers stop offering the tool at that point. */
  get canCallTools(): boolean {
    return this.rounds < MAX_TOOL_ROUNDS;
  }

  /** Announce a pause that is not a search — the wait before the first word. */
  thinking(): void {
    this.emit({ kind: "thinking" });
  }

  /** Every source that fed this reply, in the order it was first seen. */
  sources(): SearchResult[] {
    return [...this.cited.values()];
  }

  /**
   * Runs one tool call and returns the text to hand back to the model.
   *
   * The return value is always usable prose: a failure is described to the
   * model rather than thrown, because the model is mid-turn and the only
   * alternative is abandoning a reply the student is already waiting on. Told
   * plainly that search is unavailable, every one of these models falls back to
   * answering from what it knows, which is the behaviour we want.
   */
  async run(name: string, args: unknown): Promise<string> {
    // The leash, enforced here rather than only at the call site: a provider
    // that cannot withdraw a tool declaration mid-conversation (Gemini pins
    // tools when the chat is created) can still be told no.
    if (!this.canCallTools) {
      return (
        "You have used up the searches allowed for this reply. Answer now with what you have, " +
        "and say what you were unable to check."
      );
    }
    this.rounds += 1;
    if (name !== SEARCH_TOOL_NAME) {
      return `There is no tool called "${name}". Answer from what you know.`;
    }

    const query = readQuery(args);
    if (!query) {
      return "That call had no query in it. Either call search_web again with a query, or answer from what you know.";
    }

    const cached = this.cache.get(query);
    if (cached) return renderResults(query, cached);

    this.emit({ kind: "searching", query });
    const outcome = await searchWeb(query);

    if (outcome.status === "ok") {
      this.cache.set(query, outcome.results);
      for (const result of outcome.results) {
        if (!this.cited.has(result.url)) this.cited.set(result.url, result);
      }
      this.emit({ kind: "reading", query, count: outcome.results.length });
      return renderResults(query, outcome.results);
    }

    if (outcome.status === "rate-limited") {
      console.warn(`[search] rate limited: ${outcome.detail}`);
      this.emit({ kind: "search_failed", reason: "rate-limited" });
      return (
        "Web search is temporarily rate limited, so there are no results. Answer from what you " +
        "know, and say plainly that you could not check the web just now."
      );
    }

    if (outcome.status === "failed") {
      console.warn(`[search] failed: ${outcome.detail}`);
    }
    this.emit({ kind: "search_failed", reason: "unavailable" });
    return (
      "Web search is unavailable right now, so there are no results. Answer from what you know, " +
      "and say plainly that you could not check the web."
    );
  }
}

function readQuery(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  const q = (args as Record<string, unknown>).query;
  return typeof q === "string" ? q.trim().slice(0, 300) : "";
}

/**
 * Results as text for the model. Numbered, with the URL on its own line, so the
 * model can refer to "[2]" and so a citation it writes matches one we carry
 * back on the stream.
 */
function renderResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No web results for "${query}". Answer from what you know and say the search found nothing.`;
  }
  const body = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet || "(no snippet)"}`)
    .join("\n\n");
  return (
    `Web results for "${query}":\n\n${body}\n\n` +
    "Use these to answer. Name the sources you actually used in your reply; the app shows the " +
    "links separately, so do not paste raw URLs."
  );
}

/** Parses a tool-call arguments string, which providers send as JSON text. */
export function parseToolArguments(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
