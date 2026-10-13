import { NextRequest, NextResponse } from "next/server";
import { guardRequest, type Identity } from "@/lib/security/apiGuard";
import { DEVICE_HEADER } from "@/lib/security/deviceHeader";
import { checkRateLimit, clientIp, tokenKey } from "@/lib/security/rateLimit";
import { MAX_SMALL_BODY_BYTES, readJsonBody } from "@/lib/security/requestLimits";
import { bearerToken } from "@/lib/supabase/server";
import { UnitBudget } from "@/lib/watch/cache";
import { isVideoId } from "@/lib/watch/parse";
import { MAX_QUERY, STARTER_TERMS, findTopic, readFilters, relatedQuery, type SearchSpec } from "@/lib/watch/query";
import { SEARCH_CEILING, UNITS, YouTubeError, createYouTube, type YouTube } from "@/lib/watch/youtube";
import type { Seed, WatchProblem } from "@/lib/watch/types";

export type { Seed, Video, VideoDetail, WatchProblem } from "@/lib/watch/types";

// The Watch tab's only way out to YouTube.
//
// GET answers four questions, picked by which parameter is present:
//   ?q=…        a search for whatever the student typed, plus filters
//   ?topic=…    one of the home page's category chips (a fixed search)
//   ?v=…        one video's details for the watch page, with its channel
//   ?related=…  "More like this" for one video
// POST builds the home feed from search terms the browser hands over. The
// saved videos themselves live in IndexedDB on the student's laptop and never
// reach a server, so the browser derives the terms and this route just runs
// them: nothing about what a student saves leaves their machine except a few
// keywords, and only while the tab is open.
//
// youtube.com refuses to be framed, and framing it would hand over the whole of
// the internet anyway, so results come back as data and are drawn natively.
// Only a single chosen video gets an iframe, through the youtube-nocookie embed.
//
// Quota shapes the rest, and lib/watch/youtube.ts holds those rules: one shared
// cache keyed on a normalised spelling, one promise per question in flight, a
// daily budget that turns searching into cache-only before YouTube cuts it off.

export const runtime = "nodejs";

// Watch spends YouTube quota, so it is rate limited for exactly the reason
// /api/ai is: a loop here costs the owner the Watch tab for the rest of the day.
//
// Two layers. The guard counts requests, with a burst because browsing is
// bursty (four phrasings of the same topic in twenty seconds is normal). The
// second counts *searches* — only the ones that would actually reach YouTube —
// so a feed of three new terms is three, a search answered from the cache is
// none, and a script cannot buy 100 units with every request.
const WATCH_USER_RULE = { limit: 30, windowMs: 60_000, burst: 15 };
const WATCH_GUEST_RULE = { limit: 15, windowMs: 60_000, burst: 10 };
const SEARCH_USER_RULE = { limit: 20, windowMs: 60_000, burst: 10 };
const SEARCH_GUEST_RULE = { limit: 10, windowMs: 60_000, burst: 8 };
const WATCH_BUSY =
  "Panda has hit its limit on video searches for the moment. " +
  "Wait a few seconds and search again.";

/** Three terms at 100 units each is already 300; more would be reckless. */
const MAX_SEEDS = 3;

// Only ever YOUTUBE_API_KEY. This used to fall back to GEMINI_API_KEY, which
// cannot work: an AI Studio key is scoped to the Generative Language API, and
// YouTube turns it away with a message about OAuth that sends people off
// enabling the wrong things for an hour. Saying "not set up" is kinder and
// truer than failing in a way that looks like a bug.
function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

const NOT_SET_UP =
  "Watch isn't set up on this copy of Panda yet. Someone needs to add a YOUTUBE_API_KEY: make a key in Google Cloud Console with \"YouTube Data API v3\" enabled on the project (the steps are in .env.example). A Gemini key won't work here — it only opens the AI, not YouTube.";

// One budget for the life of the process, however many times the client below
// is rebuilt: the quota belongs to the key's project, not to an object.
const budget = new UnitBudget(SEARCH_CEILING);
let client: { key: string; yt: YouTube } | null = null;

function youtube(key: string): YouTube {
  if (client?.key !== key) client = { key, yt: createYouTube({ fetch, key, budget }) };
  return client.yt;
}

function problemResponse(problem: WatchProblem, status: number, error: string, retryAfter?: number) {
  return NextResponse.json(
    retryAfter ? { error, problem, retryAfter } : { error, problem },
    { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
  );
}

function failed(err: unknown) {
  if (err instanceof YouTubeError) return problemResponse(err.problem, err.status, err.message);
  console.error("[api/watch] failed:", err);
  return problemResponse("failed", 502, "Couldn't reach YouTube just now. Try again in a moment.");
}

/**
 * The guard's refusal, labelled. Its 429 carries a message and a wait but no
 * `problem`, and without one the page used to call a five-second pause
 * "Couldn't reach YouTube" — the wrong diagnosis, with the wrong button.
 */
async function labelled(response: NextResponse): Promise<NextResponse> {
  if (response.status !== 429) return response;
  const body = (await response.clone().json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json({ ...body, problem: "busy" }, { status: 429, headers: response.headers });
}

async function guard(req: NextRequest) {
  return guardRequest(req, {
    route: "watch",
    user: WATCH_USER_RULE,
    guest: WATCH_GUEST_RULE,
    busyMessage: WATCH_BUSY,
  });
}

/**
 * Spends `n` searches from this caller's allowance. The bucket is keyed the way
 * the guard keys people — a verified token for a signed-in student, the device
 * id inside the address for a guest — so one student's searches never spend
 * another's.
 */
function spendSearches(req: NextRequest, identity: Identity, n: number): { ok: true } | { ok: false; retryAfter: number } {
  if (n <= 0) return { ok: true };
  const token = bearerToken(req);
  const who =
    identity.kind === "user" && token
      ? `u:${tokenKey(token)}`
      : `d:${clientIp(req)}:${req.headers.get(DEVICE_HEADER)?.slice(0, 64) ?? "-"}`;
  const rule = identity.kind === "user" ? SEARCH_USER_RULE : SEARCH_GUEST_RULE;
  for (let i = 0; i < n; i++) {
    const result = checkRateLimit(`watch-search:${who}`, rule);
    if (!result.ok) return { ok: false, retryAfter: result.retryAfterSeconds };
  }
  return { ok: true };
}

function busy(retryAfter: number) {
  return problemResponse("busy", 429, WATCH_BUSY, retryAfter);
}

function langOf(req: NextRequest): string | null {
  const lang = req.nextUrl.searchParams.get("lang");
  return lang && /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(lang) ? lang : null;
}

export async function GET(req: NextRequest) {
  const checked = await guard(req);
  if (!checked.ok) return labelled(checked.response);

  const params = req.nextUrl.searchParams;
  const lang = langOf(req);
  const key = apiKey();

  // A watch page: one video, usually already known from a search, so free.
  const v = params.get("v");
  if (v !== null) {
    if (!isVideoId(v)) return NextResponse.json({ video: null, channel: null, blocked: "missing" });
    if (!key) return problemResponse("missing-key", 503, NOT_SET_UP);
    try {
      return NextResponse.json(await youtube(key).video(v));
    } catch (err) {
      return failed(err);
    }
  }

  // "More like this": one search built from the video's own words.
  const related = params.get("related");
  if (related !== null) {
    if (!isVideoId(related)) return NextResponse.json({ videos: [] });
    if (!key) return problemResponse("missing-key", 503, NOT_SET_UP);
    try {
      const yt = youtube(key);
      // Only charge the caller a search when one will really happen.
      const lookup = await yt.video(related, false);
      if (!lookup.video) return NextResponse.json({ videos: [] });
      const spec: SearchSpec = { q: relatedQuery(lookup.video), lang };
      if (!yt.isFresh(spec)) {
        const spent = spendSearches(req, checked.identity, 1);
        if (!spent.ok) return busy(spent.retryAfter);
      }
      return NextResponse.json({ videos: await yt.related(related, lang) });
    } catch (err) {
      return failed(err);
    }
  }

  // A search: a chip's fixed query, or exactly what was typed. A query longer
  // than MAX_QUERY is not a search, it is someone probing; trimming rather than
  // rejecting keeps a long paste working.
  const topic = findTopic(params.get("topic"));
  const q = topic ? topic.query : params.get("q")?.trim().slice(0, MAX_QUERY);
  if (!q) return NextResponse.json({ videos: [], nextPageToken: null });

  if (!key) return problemResponse("missing-key", 503, NOT_SET_UP);

  const page = params.get("page");
  const spec: SearchSpec = {
    q,
    lang,
    filters: topic ? {} : readFilters(params),
    categoryId: topic?.categoryId ?? null,
    pageToken: page && /^[A-Za-z0-9_-]{1,64}$/.test(page) ? page : null,
  };

  try {
    const yt = youtube(key);
    if (!yt.isFresh(spec)) {
      const spent = spendSearches(req, checked.identity, 1);
      if (!spent.ok) return busy(spent.retryAfter);
    }
    return NextResponse.json(await yt.search(spec));
  } catch (err) {
    return failed(err);
  }
}

/** The feed: run the terms the browser derived from what the student saved. */
export async function POST(req: NextRequest) {
  const checked = await guard(req);
  if (!checked.ok) return labelled(checked.response);

  const key = apiKey();
  if (!key) return problemResponse("missing-key", 503, NOT_SET_UP);

  // A net for a POST with no usable body. The real starting feed — the one a
  // student sees before saving anything — is built in the browser, where its
  // reason can be written in their language.
  let seeds: Seed[] = [{ term: STARTER_TERMS[0], because: "" }];
  {
    // A feed body is a handful of short strings; anything larger is refused
    // outright rather than silently truncated, so the caller learns why.
    const read = await readJsonBody(req, MAX_SMALL_BODY_BYTES, true);
    if (!read.ok) return read.response;
    const body = read.body as { seeds?: unknown } | null | undefined;
    const sent: unknown[] = Array.isArray(body?.seeds) ? body.seeds : [];
    const clean = sent
      .filter((s): s is Seed => typeof (s as Seed)?.term === "string" && Boolean((s as Seed).term.trim()))
      .slice(0, MAX_SEEDS)
      .map((s) => ({
        term: s.term.trim().slice(0, 80),
        because: String(s.because ?? "").slice(0, 160),
      }));
    if (clean.length) seeds = clean;
  }

  const lang = langOf(req);
  const yt = youtube(key);

  // A POST is counted by the searches it would really run. Terms the cache
  // already holds are free; when the allowance runs short, the remaining terms
  // are answered from the cache only, and the feed is built from what is left.
  const fresh = new Set(seeds.filter((s) => yt.isFresh({ q: s.term, lang })).map((s) => s.term));
  const allowed = new Set<string>(fresh);
  let refusal = 0;
  for (const seed of seeds) {
    if (allowed.has(seed.term)) continue;
    const spent = spendSearches(req, checked.identity, 1);
    if (spent.ok) allowed.add(seed.term);
    else refusal = Math.max(refusal, spent.retryAfter);
  }

  try {
    const result = await yt.feed(seeds, lang, { cacheOnlyFor: (seed) => !allowed.has(seed.term) });
    return NextResponse.json(result);
  } catch (err) {
    // Every term came up empty because this caller ran out of searches, not
    // because the day's budget did: that is a short wait, not a closed door.
    const ourLimit = budget.canSpend(UNITS.search + UNITS.list, SEARCH_CEILING);
    if (refusal && ourLimit && err instanceof YouTubeError && err.problem === "quota") return busy(refusal);
    return failed(err);
  }
}
