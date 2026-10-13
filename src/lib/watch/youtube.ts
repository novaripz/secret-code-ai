// Everything the Watch route asks YouTube, and every rule about what comes back.
//
// Kept apart from the route so it can be driven by a fake `fetch` in
// scripts/checks/watch.test.ts: the expensive mistakes here (a second search
// for a query already in flight, a cache key that splits on capital letters, an
// age-restricted video that dead-ends in the player) are all invisible until a
// school hits them, so they are pinned by checks rather than by hope.
//
// Quota shapes all of it. search.list costs 100 units against a default 10,000
// a day; videos.list and channels.list cost 1. So: every search asks for the
// maximum fifty results (the same 100 units as eight) and the caller slices;
// the full details from the follow-up videos.list call are kept per video, so
// opening one of those fifty later costs nothing; and every answer is shared
// between students through a cache keyed on a normalised spelling.

import { InFlight, LruCache, UnitBudget } from "./cache";
import { decodeEntities, isChannelId, isVideoId, parseDuration } from "./parse";
import {
  isCuratedQuery,
  normaliseQuery,
  relatedQuery,
  relevanceLanguage,
  searchKey,
  youtubeFilterParams,
  type SearchSpec,
} from "./query";
import type {
  BlockedReason,
  ChannelInfo,
  FeedResult,
  SearchPage,
  Seed,
  Video,
  VideoDetail,
  VideoLookup,
  WatchProblem,
} from "./types";

export const UNITS = { search: 100, list: 1 } as const;

/**
 * Searches stop at this many units spent today and switch to cache-only. The
 * real limit is 10,000; the gap leaves room for the 1-unit lookups a watch page
 * still needs, and for whatever another instance spent that this one can't see.
 */
export const SEARCH_CEILING = 8_500;
/** Single-video and channel lookups may keep going a little longer. */
export const LOOKUP_CEILING = 9_800;

/** What YouTube allows per search page, and what every search asks for. */
export const MAX_RESULTS = 50;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const TTL = {
  /** A typed search. Results for a query barely move inside an hour. */
  search: HOUR,
  /** Chips, starter feeds and suggestions: identical for every student. */
  curated: 18 * HOUR,
  /** One video's details and the "More like this" search built from it. */
  video: 24 * HOUR,
  related: 24 * HOUR,
  channel: 7 * 24 * HOUR,
} as const;

const SNIPPET_CHARS = 240;
const DESCRIPTION_CHARS = 5_000;

export class YouTubeError extends Error {
  constructor(
    readonly problem: WatchProblem,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const MESSAGES = {
  quota:
    "This YouTube key has used up today's quota. It resets at midnight Pacific time, and saved videos still play until then.",
  budget:
    "Panda has used today's share of video searches. Videos you've already found, saved or watched still play, and searching comes back at midnight Pacific time.",
  wrongKey:
    'YouTube turned this key down. In Google Cloud Console, enable "YouTube Data API v3" on the project the key belongs to, then set that key as YOUTUBE_API_KEY. An AI Studio key can\'t be used here.',
  failed: "Couldn't reach YouTube just now. Try again in a moment.",
};

// --- The raw API shapes, only as far as they are read -------------------------

interface Thumbs {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
  standard?: { url?: string };
  maxres?: { url?: string };
}

export interface SearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    description?: string;
    thumbnails?: Thumbs;
    liveBroadcastContent?: string;
  };
}

export interface VideoItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: Thumbs;
    liveBroadcastContent?: string;
  };
  contentDetails?: {
    duration?: string;
    caption?: string;
    contentRating?: { ytRating?: string };
  };
  statistics?: { viewCount?: string; likeCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
}

interface ChannelItem {
  id?: string;
  snippet?: { title?: string; thumbnails?: Thumbs };
}

// --- Pure rules -------------------------------------------------------------

/**
 * Why a video should not be shown, or null when it can play inside Panda.
 *
 * Search already asks for embeddable videos with strict SafeSearch, but neither
 * filter covers everything that fails in the embed: an age-restricted video
 * refuses to play without a signed-in adult, and a live or upcoming broadcast
 * has no length and no end. Both are dropped here, using fields the follow-up
 * videos.list call already paid for.
 */
export function screen(item: VideoItem): BlockedReason | null {
  const privacy = item.status?.privacyStatus;
  if (privacy && privacy !== "public" && privacy !== "unlisted") return "private";
  if (item.status?.embeddable === false) return "embed";
  if (item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return "age";
  const live = item.snippet?.liveBroadcastContent;
  if (live && live !== "none") return "live";
  if (parseDuration(item.contentDetails?.duration) === null) return "live";
  return null;
}

function count(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * One video in Panda's shape. videos.list returns titles unescaped and
 * search.list does not ("Newton&#39;s Laws"), so the videos.list snippet wins
 * and the search snippet is only a fallback — decoded, since it is the escaped
 * one.
 */
export function toDetail(item: VideoItem, fallback?: SearchItem): VideoDetail {
  const s = item.snippet ?? {};
  const f = fallback?.snippet ?? {};
  const thumbs = s.thumbnails ?? f.thumbnails ?? {};
  const description = (s.description ?? decodeEntities(f.description ?? "")).slice(0, DESCRIPTION_CHARS);
  const medium = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? "";
  return {
    id: item.id ?? fallback?.id?.videoId ?? "",
    title: s.title ?? decodeEntities(f.title ?? ""),
    channel: s.channelTitle ?? decodeEntities(f.channelTitle ?? ""),
    channelId: s.channelId ?? f.channelId ?? "",
    thumbnail: medium,
    thumbnailHigh: thumbs.high?.url ?? thumbs.standard?.url ?? undefined,
    thumbnailMax: thumbs.maxres?.url ?? undefined,
    publishedAt: s.publishedAt ?? f.publishedAt ?? "",
    seconds: parseDuration(item.contentDetails?.duration),
    viewCount: count(item.statistics?.viewCount),
    likeCount: count(item.statistics?.likeCount),
    captions: item.contentDetails?.caption === "true",
    snippet: snippetOf(description),
    description,
    tags: (s.tags ?? []).slice(0, 30),
    because: null,
  };
}

function snippetOf(description: string): string {
  const flat = description.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1).trimEnd()}…` : flat;
}

/** A detail trimmed to what a card needs, so a list of fifty stays small. */
export function toCard(d: VideoDetail): Video {
  return {
    id: d.id,
    title: d.title,
    channel: d.channel,
    channelId: d.channelId,
    thumbnail: d.thumbnail,
    thumbnailHigh: d.thumbnailHigh,
    thumbnailMax: d.thumbnailMax,
    publishedAt: d.publishedAt,
    seconds: d.seconds,
    viewCount: d.viewCount,
    captions: d.captions,
    snippet: d.snippet,
    because: d.because,
  };
}

/**
 * Round-robin the feed's terms rather than concatenating them, so a feed built
 * from three saved channels leads with one video from each instead of eight from
 * whichever term happened to be first. A video two terms both found keeps the
 * reason from the term that reached it first.
 */
export function blend(groups: { seed: Seed; videos: Video[] }[], limit: number): Video[] {
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

// --- The client ---------------------------------------------------------------

/** Just enough of a fetch Response for this file, so a check can fake one. */
export interface FetchLike {
  (url: string, init?: { cache?: "no-store" }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

export interface YouTubeDeps {
  fetch: FetchLike;
  key: string;
  budget: UnitBudget;
  now?: () => number;
}

export interface SearchRequest extends SearchSpec {
  /** Overrides the cache life; curated queries get a long one automatically. */
  ttlMs?: number;
  /** Serve from cache (fresh or stale) and never call YouTube. */
  cacheOnly?: boolean;
}

interface StoredVideo {
  detail: VideoDetail | null;
  blocked: BlockedReason | null;
}

export function createYouTube(deps: YouTubeDeps) {
  const now = deps.now ?? Date.now;
  const searches = new LruCache<SearchPage>(600, now);
  const videos = new LruCache<StoredVideo>(2_000, now);
  const channels = new LruCache<ChannelInfo>(1_000, now);
  const inflight = new InFlight();

  async function call(endpoint: "search" | "videos" | "channels", params: Record<string, string>, units: number) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.searchParams.set("key", deps.key);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

    // Counted before the call: YouTube charges for a request whether or not it
    // succeeds, so a failure still spent the units.
    deps.budget.spend(units);

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await deps.fetch(url.toString(), { cache: "no-store" });
    } catch {
      throw new YouTubeError("failed", 502, MESSAGES.failed);
    }
    const data = (await res.json().catch(() => ({}))) as {
      items?: unknown[];
      nextPageToken?: string;
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    if (res.ok) return data;

    const reason = data?.error?.errors?.[0]?.reason ?? "";
    const raw = data?.error?.message ?? "YouTube didn't answer.";

    // Quota is worth telling apart from every other 403: nothing is broken and
    // nobody needs to fix a key — it comes back on its own at midnight Pacific.
    // Trying again before then only spends more of nothing, so the budget is
    // marked spent and later requests are answered from the cache.
    if (/quota|rateLimit|dailyLimit/i.test(reason)) {
      deps.budget.exhaust();
      throw new YouTubeError("quota", 429, MESSAGES.quota);
    }

    // Google's own wording for a key pointed at the wrong API talks about OAuth
    // and about APIs "not being used in a project before", which reads like a
    // billing problem. Say the actual next step instead.
    if (/API keys are not supported|API key not valid|has not been used|is disabled|forbidden|keyInvalid/i.test(raw + reason)) {
      throw new YouTubeError("wrong-key", 502, MESSAGES.wrongKey);
    }

    throw new YouTubeError("failed", 502, MESSAGES.failed);
  }

  function ttlFor(req: SearchRequest): number {
    if (req.ttlMs) return req.ttlMs;
    if (!req.pageToken && (req.categoryId || isCuratedQuery(req.q))) return TTL.curated;
    return TTL.search;
  }

  /** Details for many ids in one 1-unit call, each one remembered on its own. */
  async function details(ids: string[], fallbacks = new Map<string, SearchItem>()): Promise<Map<string, StoredVideo>> {
    const out = new Map<string, StoredVideo>();
    const missing: string[] = [];
    for (const id of ids) {
      const hit = videos.get(id);
      if (hit) out.set(id, hit);
      else missing.push(id);
    }
    if (missing.length === 0) return out;

    const found = await call(
      "videos",
      { part: "snippet,contentDetails,statistics,status", id: missing.slice(0, MAX_RESULTS).join(","), maxResults: String(MAX_RESULTS) },
      UNITS.list,
    );
    const items = new Map(((found.items ?? []) as VideoItem[]).map((item) => [item.id ?? "", item]));
    for (const id of missing) {
      const item = items.get(id);
      const stored: StoredVideo = item
        ? { detail: toDetail(item, fallbacks.get(id)), blocked: screen(item) }
        : { detail: null, blocked: "missing" };
      videos.set(id, stored, TTL.video);
      out.set(id, stored);
    }
    return out;
  }

  /** True when this search would be answered without spending anything. */
  function isFresh(req: SearchSpec): boolean {
    const key = searchKey(req);
    return searches.has(key) || inflight.has(key);
  }

  async function search(req: SearchRequest): Promise<SearchPage> {
    const q = normaliseQuery(req.q);
    if (!q && !req.categoryId) return { videos: [], nextPageToken: null };
    const key = searchKey({ ...req, q });

    const hit = searches.get(key);
    if (hit) return hit;

    // Joining a search already on its way costs nothing, so only a new one has
    // to ask the budget.
    if (!inflight.has(key) && (req.cacheOnly || !deps.budget.canSpend(UNITS.search + UNITS.list, SEARCH_CEILING))) {
      const stale = searches.stale(key);
      if (stale) return stale;
      throw new YouTubeError("quota", 429, deps.budget.isExhausted ? MESSAGES.quota : MESSAGES.budget);
    }

    return inflight.run(key, async () => {
      const params: Record<string, string> = {
        part: "snippet",
        type: "video",
        maxResults: String(MAX_RESULTS),
        // Embeddable and syndicated only, so nothing on the page dead-ends on a
        // player that refuses to load inside Panda. Strict SafeSearch always.
        videoEmbeddable: "true",
        videoSyndicated: "true",
        safeSearch: "strict",
        ...youtubeFilterParams(req.filters ?? {}, now()),
      };
      if (q) params.q = q;
      const lang = relevanceLanguage(req.lang);
      if (lang) params.relevanceLanguage = lang;
      if (req.categoryId) params.videoCategoryId = req.categoryId;
      if (req.pageToken) params.pageToken = req.pageToken;

      const found = await call("search", params, UNITS.search);
      const items = ((found.items ?? []) as SearchItem[]).filter((i) => isVideoId(i.id?.videoId));
      const ids = [...new Set(items.map((i) => i.id!.videoId!))];

      let list: Video[] = [];
      if (ids.length > 0) {
        const fallbacks = new Map(items.map((i) => [i.id!.videoId!, i]));
        const stored = await details(ids, fallbacks);
        list = ids
          .map((id) => stored.get(id))
          .filter((s): s is StoredVideo => Boolean(s?.detail) && !s?.blocked)
          .map((s) => toCard(s.detail!));
      }

      const page: SearchPage = { videos: list, nextPageToken: found.nextPageToken ?? null };
      searches.set(key, page, ttlFor(req));
      return page;
    });
  }

  async function channel(id: string): Promise<ChannelInfo | null> {
    if (!isChannelId(id)) return null;
    const hit = channels.get(id);
    if (hit) return hit;
    if (!deps.budget.canSpend(UNITS.list, LOOKUP_CEILING)) return channels.stale(id) ?? null;

    return inflight.run(`c:${id}`, async () => {
      const found = await call("channels", { part: "snippet", id }, UNITS.list);
      const item = ((found.items ?? []) as ChannelItem[])[0];
      if (!item) return null;
      const thumbs = item.snippet?.thumbnails ?? {};
      const info: ChannelInfo = {
        id,
        title: item.snippet?.title ?? "",
        avatar: thumbs.default?.url ?? thumbs.medium?.url ?? null,
      };
      channels.set(id, info, TTL.channel);
      return info;
    });
  }

  /**
   * One video for the watch page. Usually free: anything that appeared in a
   * search in the last day is already stored with its full description.
   */
  async function video(id: string, withChannel = true): Promise<VideoLookup> {
    if (!isVideoId(id)) return { video: null, channel: null, blocked: "missing" };

    let stored = videos.get(id);
    if (!stored) {
      if (!deps.budget.canSpend(UNITS.list, LOOKUP_CEILING)) {
        stored = videos.stale(id);
        if (!stored) throw new YouTubeError("quota", 429, deps.budget.isExhausted ? MESSAGES.quota : MESSAGES.budget);
      } else {
        stored = (await inflight.run(`v:${id}`, () => details([id]))).get(id);
      }
    }
    if (!stored?.detail || stored.blocked) {
      return { video: null, channel: null, blocked: stored?.blocked ?? "missing" };
    }

    // The avatar is decoration: if it can't be had, the page still works.
    let info: ChannelInfo | null = null;
    if (withChannel && stored.detail.channelId) {
      info = await channel(stored.detail.channelId).catch(() => null);
    }
    return { video: stored.detail, channel: info, blocked: null };
  }

  /** "More like this" for one video: a single search built from its own words. */
  async function related(id: string, lang: string | null): Promise<Video[]> {
    const lookup = await video(id, false);
    if (!lookup.video) return [];
    const q = relatedQuery(lookup.video);
    if (!q) return [];
    const page = await search({ q, lang, ttlMs: TTL.related });
    return page.videos.filter((v) => v.id !== id).slice(0, 24);
  }

  /**
   * The home feed: up to three searches, blended. Settled rather than all-or-
   * nothing, so one failing term costs its own row of cards and not the feed.
   */
  async function feed(
    seeds: Seed[],
    lang: string | null,
    opts: { perSeed?: number; limit?: number; cacheOnlyFor?: (seed: Seed) => boolean } = {},
  ): Promise<FeedResult> {
    const perSeed = opts.perSeed ?? 8;
    const settled = await Promise.allSettled(
      seeds.map((seed) => search({ q: seed.term, lang, cacheOnly: opts.cacheOnlyFor?.(seed) ?? false })),
    );

    const groups: { seed: Seed; videos: Video[] }[] = [];
    let firstError: unknown = null;
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") groups.push({ seed: seeds[i], videos: result.value.videos.slice(0, perSeed) });
      else firstError ??= result.reason;
    });

    if (groups.length === 0 && firstError) throw firstError;
    return {
      videos: blend(groups, opts.limit ?? 24),
      seeds: groups.map((g) => g.seed),
      partial: groups.length < seeds.length,
    };
  }

  return { search, video, channel, related, feed, isFresh, stats: () => ({ spent: deps.budget.spent, searches: searches.size, videos: videos.size }) };
}

export type YouTube = ReturnType<typeof createYouTube>;
