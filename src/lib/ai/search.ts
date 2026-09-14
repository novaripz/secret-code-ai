// The one place that talks to a web-search provider.
//
// Panda answers from training data, which means it is confidently wrong about
// anything that happened recently and cannot produce a source when a student
// asks for one. This file fixes only that, and only when a key is present:
// every failure — no key, no quota, no network — comes back as a value rather
// than an exception, because the caller is in the middle of a live chat stream
// and an unhandled throw there costs the student their whole reply.
//
// Provider choice: Tavily. Brave ended its free tier in February 2026 and now
// requires a card on file; DuckDuckGo has no supported JSON API and blocks
// scraping under load; SearXNG means running a server. Tavily gives 1,000
// credits a month with no card, which is a class of thirty asking a handful of
// source-worthy questions a day, and it stops rather than bills when the
// credits run out — the right failure mode for a school.
//
// Google Programmable Search stays supported as a fallback because the repo
// already carries GOOGLE_CSE_ID / GOOGLE_CSE_KEY from the removed search tab.
// It is second, not first, because it needs Custom Search API switched on in
// Cloud Console and is capped at 100 queries a day.

/** One ranked hit. Deliberately the smallest shape a citation needs. */
export interface SearchResult {
  title: string;
  url: string;
  /** The provider's own extract. Never the full page — we do not fetch pages. */
  snippet: string;
}

/**
 * Why searching did or did not produce results. These are separate cases and
 * not one generic error on purpose: "no key" is a configuration fact the model
 * should stop asking about, "rate limited" is temporary and worth saying out
 * loud, and "failed" is the network being the network.
 */
export type SearchOutcome =
  | { status: "ok"; results: SearchResult[] }
  | { status: "not-configured" }
  | { status: "rate-limited"; detail: string }
  | { status: "failed"; detail: string };

/** True when any search backend has a key. Callers use this to stay silent. */
export function isSearchConfigured(): boolean {
  return Boolean(
    process.env.TAVILY_API_KEY || (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID),
  );
}

/** Which backend answers, named for logs and for .env.example to line up with. */
export function searchProviderLabel(): string | undefined {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID) return "google-cse";
  return undefined;
}

/**
 * A search has to finish inside the time a student will sit and watch. Better
 * to answer from training data with a note than to hold the screen open.
 */
const SEARCH_TIMEOUT_MS = 6_000;

/** Enough for the model to cross-check and cite; more is mostly prompt weight. */
const MAX_RESULTS = 5;

/** Long enough to judge relevance, short enough that five of them stay cheap. */
const MAX_SNIPPET_CHARS = 400;

export async function searchWeb(query: string): Promise<SearchOutcome> {
  const trimmed = query.trim().slice(0, 300);
  if (!trimmed) return { status: "ok", results: [] };

  if (process.env.TAVILY_API_KEY) {
    return tavily(trimmed, process.env.TAVILY_API_KEY);
  }
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID) {
    return googleCse(trimmed, process.env.GOOGLE_CSE_KEY, process.env.GOOGLE_CSE_ID);
  }
  return { status: "not-configured" };
}

async function tavily(query: string, apiKey: string): Promise<SearchOutcome> {
  let res: Response;
  try {
    res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        // "basic" is one credit; "advanced" is two and mostly buys longer
        // extracts we would only truncate anyway.
        search_depth: "basic",
        max_results: MAX_RESULTS,
        // We want sources, not a second model's summary. Panda writes the
        // answer itself, from the snippets, in its own voice.
        include_answer: false,
      }),
    });
  } catch (err) {
    return { status: "failed", detail: networkDetail(err) };
  }

  // 429 is "too fast", 432/433 are "out of plan credits". All three mean the
  // same thing to a student — try later — so they collapse into one case.
  if (res.status === 429 || res.status === 432 || res.status === 433) {
    return { status: "rate-limited", detail: `Tavily returned ${res.status}.` };
  }
  if (res.status === 401 || res.status === 403) {
    // Treated as "not configured" rather than an error the model narrates: a
    // bad key is the operator's problem, and the student should just get the
    // ordinary training-data answer while it is sorted out.
    console.error("[search] Tavily rejected TAVILY_API_KEY. Check the key; the request was fine.");
    return { status: "not-configured" };
  }
  if (!res.ok) {
    return { status: "failed", detail: `Tavily returned ${res.status}.` };
  }

  let body: { results?: unknown };
  try {
    body = (await res.json()) as { results?: unknown };
  } catch {
    return { status: "failed", detail: "Tavily sent a response we could not read." };
  }

  const raw = Array.isArray(body.results) ? body.results : [];
  const results = raw
    .map((row) => {
      if (typeof row !== "object" || row === null) return undefined;
      const r = row as Record<string, unknown>;
      return toResult(r.title, r.url, r.content);
    })
    .filter((r): r is SearchResult => r !== undefined)
    .slice(0, MAX_RESULTS);

  return { status: "ok", results };
}

async function googleCse(query: string, key: string, cx: string): Promise<SearchOutcome> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(MAX_RESULTS));

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  } catch (err) {
    return { status: "failed", detail: networkDetail(err) };
  }

  if (res.status === 429) {
    return { status: "rate-limited", detail: "Google Custom Search returned 429." };
  }
  if (res.status === 403) {
    // Google answers 403 both for "daily quota spent" and for "Custom Search
    // API was never enabled on this project" — the second being exactly the
    // state these env vars were left in. The body distinguishes them.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (/quota|rateLimit/i.test(detail)) {
      return { status: "rate-limited", detail: "Google Custom Search daily quota is spent." };
    }
    console.error(
      "[search] Google Custom Search returned 403. The API is probably not enabled on the " +
        "project that owns GOOGLE_CSE_KEY — see .env.example.",
    );
    return { status: "not-configured" };
  }
  if (!res.ok) {
    return { status: "failed", detail: `Google Custom Search returned ${res.status}.` };
  }

  let body: { items?: unknown };
  try {
    body = (await res.json()) as { items?: unknown };
  } catch {
    return { status: "failed", detail: "Google Custom Search sent a response we could not read." };
  }

  const raw = Array.isArray(body.items) ? body.items : [];
  const results = raw
    .map((row) => {
      if (typeof row !== "object" || row === null) return undefined;
      const r = row as Record<string, unknown>;
      return toResult(r.title, r.link, r.snippet);
    })
    .filter((r): r is SearchResult => r !== undefined)
    .slice(0, MAX_RESULTS);

  return { status: "ok", results };
}

/** One row, or nothing. A hit without a usable URL cannot be cited, so it goes. */
function toResult(title: unknown, url: unknown, snippet: unknown): SearchResult | undefined {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return undefined;
  return {
    title: typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : url,
    url,
    snippet: typeof snippet === "string" ? collapse(snippet).slice(0, MAX_SNIPPET_CHARS) : "",
  };
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A timeout and a dead network are different sentences to read in a log. */
function networkDetail(err: unknown): string {
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return `The search provider did not answer within ${SEARCH_TIMEOUT_MS}ms.`;
  }
  return err instanceof Error ? err.message : "The search provider could not be reached.";
}
