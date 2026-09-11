import { NextRequest, NextResponse } from "next/server";

// The Watch tab's only way out to YouTube.
//
// Two jobs, split across two methods because they are genuinely different
// questions. GET runs a search for whatever the student typed. POST builds the
// recommendation feed from search terms the browser hands over — the saved
// videos themselves live in IndexedDB on the student's laptop and never reach
// a server, so the browser derives the terms and this route just runs them.
// That split is deliberate: nothing about what a student saves leaves their
// machine except a few keywords, and only while the tab is open.
//
// youtube.com refuses to be framed (X-Frame-Options), and framing it would
// hand over the whole of the internet anyway, so results come back as data and
// are drawn natively. Only a single chosen video gets an iframe, through the
// youtube-nocookie embed player.
//
// Quota is what shapes the rest. search.list costs 100 units against a default
// of 10,000 a day, so: at most three terms per feed, and a small cache in front
// of them. That cache lives in this process and dies with it — it is there to
// stop someone flipping between tabs from spending a day's quota in a minute,
// not to be a real cache.

export const runtime = "nodejs";

export interface Video {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  /** Seconds, already parsed out of ISO 8601. Null for live streams. */
  seconds: number | null;
  viewCount: number | null;
  /**
   * Why this video is in the feed, in the client's own words. The browser is
   * what knows the reason (it holds the saves), so it sends the sentence along
   * with the term and we hand it back attached to whatever that term found.
   * Null for plain search results, which need no explaining.
   */
  because: string | null;
}

export interface Seed {
  /** Handed to YouTube search verbatim. */
  term: string;
  /** Shown on every card the term produced. */
  because: string;
}

/** What went wrong, so the UI can branch without parsing English. */
export type WatchProblem = "missing-key" | "quota" | "wrong-key" | "failed";

/** Three terms at 100 units each is already 300; more would be reckless. */
const MAX_SEEDS = 3;
const PER_SEED = 8;
const FEED_LIMIT = 24;
const SEARCH_LIMIT = 24;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Only ever YOUTUBE_API_KEY. This used to fall back to GEMINI_API_KEY, which
// cannot work: an AI Studio key is scoped to the Generative Language API, and
// YouTube turns it away with a message about OAuth that sends people off
// enabling the wrong things for an hour. Saying "not set up" is kinder and
// truer than failing in a way that looks like a bug.
function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

const NOT_SET_UP =
  "Watch isn't set up on this copy of Panda yet. Someone needs to add a YOUTUBE_API_KEY: make a key in Google Cloud Console with \"YouTube Data API v3\" enabled on the project. A Gemini key won't work here — it only opens the AI, not YouTube.";

class YouTubeError extends Error {
  problem: WatchProblem;
  status: number;

  constructor(problem: WatchProblem, status: number, message: string) {
    super(message);
    this.problem = problem;
    this.status = status;
  }
}

function problemResponse(problem: WatchProblem, status: number, error: string) {
  return NextResponse.json({ error, problem }, { status });
}

function failed(err: unknown) {
  if (err instanceof YouTubeError) return problemResponse(err.problem, err.status, err.message);
  console.error("[api/watch] failed:", err);
  return problemResponse("failed", 502, "Couldn't reach YouTube just now. Try again in a moment.");
}

interface SearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  };
}

interface DetailItem {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

async function call(
  endpoint: "search" | "videos",
  params: Record<string, string>,
  key: string,
): Promise<{ items?: unknown[] }> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;

  const reason: string = data?.error?.errors?.[0]?.reason ?? "";
  const raw: string = data?.error?.message ?? "YouTube didn't answer.";

  // Quota is worth telling apart from every other 403: nothing is broken and
  // nobody needs to go and fix a key — it comes back on its own at midnight.
  if (/quota|rateLimit|dailyLimit/i.test(reason)) {
    throw new YouTubeError(
      "quota",
      429,
      "This YouTube key has used up today's quota. It resets at midnight Pacific time, and saved videos still play until then.",
    );
  }

  // Google's own wording for a key pointed at the wrong API talks about OAuth
  // and about APIs "not being used in a project before", which reads like a
  // billing problem. Say the actual next step instead.
  if (/API keys are not supported|API key not valid|has not been used|is disabled|forbidden/i.test(raw + reason)) {
    throw new YouTubeError(
      "wrong-key",
      502,
      "YouTube turned this key down. In Google Cloud Console, enable \"YouTube Data API v3\" on the project the key belongs to, then set that key as YOUTUBE_API_KEY. An AI Studio key can't be used here.",
    );
  }

  throw new YouTubeError("failed", 502, raw);
}

/** "PT1H2M3S" -> 3723. Null when YouTube gives no real length (live streams). */
function seconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const parts = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!parts) return null;
  const [, d, h, m, s] = parts;
  const total = Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : null;
}

const cache = new Map<string, { at: number; videos: Video[] }>();

/**
 * One term in, a page of playable videos out.
 *
 * Two calls, not one: search.list has no duration or view count in it, so the
 * ids come back first and videos.list fills in the numbers. The second call
 * costs 1 unit against search.list's 100, which is why it is worth making
 * rather than drawing cards with holes in them.
 */
async function forTerm(term: string, key: string, count: number): Promise<Video[]> {
  const cacheKey = `${term}::${count}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.videos;

  const found = await call(
    "search",
    {
      part: "snippet",
      q: term,
      type: "video",
      maxResults: String(count),
      // Embeddable and syndicated only, so nothing in the grid dead-ends on a
      // player that refuses to load inside Panda.
      videoEmbeddable: "true",
      videoSyndicated: "true",
      safeSearch: "strict",
    },
    key,
  );

  const items = (found.items ?? []) as SearchItem[];
  const ids = items.map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const detailed = await call("videos", { part: "contentDetails,statistics", id: ids.join(",") }, key);
  const extra = new Map<string, DetailItem>(
    ((detailed.items ?? []) as DetailItem[]).map((d) => [d.id ?? "", d]),
  );

  const videos: Video[] = items
    .filter((i) => i.id?.videoId)
    .map((i) => {
      const id = i.id!.videoId!;
      const d = extra.get(id);
      const views = Number(d?.statistics?.viewCount);
      return {
        id,
        title: i.snippet?.title ?? "Untitled",
        channel: i.snippet?.channelTitle ?? "",
        channelId: i.snippet?.channelId ?? "",
        thumbnail: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.high?.url ?? "",
        publishedAt: i.snippet?.publishedAt ?? "",
        seconds: seconds(d?.contentDetails?.duration),
        viewCount: Number.isFinite(views) ? views : null,
        because: null,
      };
    });

  cache.set(cacheKey, { at: Date.now(), videos });
  return videos;
}

/**
 * Round-robin the terms rather than concatenating them, so a feed built from
 * three saved channels leads with one video from each instead of eight from
 * whichever term happened to be first. A video that two terms both found keeps
 * the reason from the term that reached it first.
 */
function blend(groups: { seed: Seed; videos: Video[] }[], limit: number): Video[] {
  const out: Video[] = [];
  const seen = new Set<string>();
  const deepest = groups.reduce((n, g) => Math.max(n, g.videos.length), 0);

  for (let rank = 0; rank < deepest && out.length < limit; rank++) {
    for (const group of groups) {
      if (out.length >= limit) break;
      const video = group.videos[rank];
      if (!video || seen.has(video.id)) continue;
      seen.add(video.id);
      out.push({ ...video, because: group.seed.because });
    }
  }
  return out;
}

/**
 * A net for a POST with no usable body. The real default — the one a student
 * sees before they have saved anything — is written in the store alongside the
 * rest of the feed's reasoning, because that is where it can be explained.
 */
const FALLBACK_SEEDS: Seed[] = [
  { term: "study skills for high school", because: "A starting point until you save something." },
];

/** Search: exactly what was typed, no reasoning attached. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ videos: [] });

  const key = apiKey();
  if (!key) return problemResponse("missing-key", 503, NOT_SET_UP);

  try {
    return NextResponse.json({ videos: await forTerm(q, key, SEARCH_LIMIT) });
  } catch (err) {
    return failed(err);
  }
}

/** The feed: run the terms the browser derived from what the student saved. */
export async function POST(req: NextRequest) {
  const key = apiKey();
  if (!key) return problemResponse("missing-key", 503, NOT_SET_UP);

  let seeds = FALLBACK_SEEDS;
  try {
    const body = await req.json();
    const sent: unknown[] = Array.isArray(body?.seeds) ? body.seeds : [];
    const clean = sent
      .filter((s): s is Seed => typeof (s as Seed)?.term === "string" && Boolean((s as Seed).term.trim()))
      .slice(0, MAX_SEEDS)
      .map((s) => ({
        term: s.term.trim().slice(0, 80),
        because: String(s.because ?? "").slice(0, 160),
      }));
    if (clean.length) seeds = clean;
  } catch {
    // No body, or not JSON. The fallback seed still gives them a feed.
  }

  try {
    const groups = await Promise.all(
      seeds.map(async (seed) => ({ seed, videos: await forTerm(seed.term, key, PER_SEED) })),
    );
    return NextResponse.json({ videos: blend(groups, FEED_LIMIT), seeds });
  } catch (err) {
    return failed(err);
  }
}
