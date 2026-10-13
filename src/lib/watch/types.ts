// The shapes the Watch tab passes between the server route, the browser and
// IndexedDB.
//
// They live here rather than in the route file because three different places
// need them: the route that builds them, the store that saves them, and the
// checks in scripts/checks/watch.test.ts that hold the rules about them. A type
// imported out of a route file drags that route's server imports along with it.

export interface Video {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  /**
   * The 320px "medium" thumbnail. Every saved row ever written has this one, so
   * it stays the required field and the larger sizes below are extras.
   */
  thumbnail: string;
  /** 480px, for a phone's 2x screen. Absent on rows saved before srcsets. */
  thumbnailHigh?: string;
  /** 1280px, only when the uploader provided one. */
  thumbnailMax?: string;
  publishedAt: string;
  /** Seconds, already parsed out of ISO 8601. Null when YouTube gives no length. */
  seconds: number | null;
  viewCount: number | null;
  /** True when the uploader added real captions, so a CC badge is honest. */
  captions?: boolean;
  /** The first few hundred characters of the description, for a results row. */
  snippet?: string;
  /**
   * Why this video is in the feed, in the client's own words. The browser is
   * what knows the reason (it holds the saves), so it sends the sentence along
   * with the term and the route hands it back attached to whatever that term
   * found. Null for plain search results, which need no explaining.
   */
  because: string | null;
}

/** One video with everything the watch page shows under the player. */
export interface VideoDetail extends Video {
  description: string;
  tags: string[];
  likeCount: number | null;
}

export interface ChannelInfo {
  id: string;
  title: string;
  avatar: string | null;
}

export interface Seed {
  /** Handed to YouTube search verbatim. */
  term: string;
  /** Shown on every card the term produced. */
  because: string;
}

/**
 * What went wrong, so the UI can branch without parsing English.
 *
 * `busy` is Panda's own rate limit (wait a few seconds), which is a different
 * thing from `quota` (YouTube's daily budget, gone until midnight Pacific) and
 * needs a different button: one of them is worth retrying and one is not.
 */
export type WatchProblem = "missing-key" | "quota" | "wrong-key" | "failed" | "busy" | "auth";

/** Why a video that exists was still kept off the page. */
export type BlockedReason = "age" | "live" | "embed" | "private" | "missing";

export interface SearchPage {
  videos: Video[];
  /** Present when YouTube has another page; only used on an explicit Load more. */
  nextPageToken: string | null;
}

export interface FeedResult {
  videos: Video[];
  /** The seeds that actually returned something, in the order they were sent. */
  seeds: Seed[];
  /** True when at least one seed failed and the feed is built from the rest. */
  partial: boolean;
}

export interface VideoLookup {
  video: VideoDetail | null;
  channel: ChannelInfo | null;
  blocked: BlockedReason | null;
}
