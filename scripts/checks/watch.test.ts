// The Watch tab's rules, held without a browser or a YouTube key.
//
// Most of what can go wrong in Watch is invisible until a school hits it: a
// cache key that splits on a capital letter, thirty students' identical
// starter searches each spending 100 units, an age-restricted video that
// dead-ends in the player, a title that reads "Newton&#39;s Laws", a feed that
// dies because one of its three terms did. Everything here drives the real
// code in src/lib/watch/ — the YouTube client gets a fake `fetch` that counts
// calls and answers from fixtures — so each of those is pinned by a check.
//
// Run with `tsx scripts/checks/watch.test.ts`.

import { InFlight, LruCache, UnitBudget, pacificDay } from "../../src/lib/watch/cache";
import {
  chapterAt,
  decodeEntities,
  formatClock,
  isVideoId,
  parseChapters,
  parseClock,
  parseDuration,
  splitTimestamps,
} from "../../src/lib/watch/parse";
import {
  STARTER_TERMS,
  TOPICS,
  isCuratedQuery,
  normaliseQuery,
  readFilters,
  relatedQuery,
  relevanceLanguage,
  searchKey,
  suggest,
  youtubeFilterParams,
} from "../../src/lib/watch/query";
import {
  LOOKUP_CEILING,
  SEARCH_CEILING,
  TTL,
  YouTubeError,
  blend,
  createYouTube,
  screen,
  toDetail,
  type FetchLike,
  type VideoItem,
} from "../../src/lib/watch/youtube";
import {
  MAX_HISTORY,
  MAX_RECENT,
  addRecent,
  addSaved,
  continueWatching,
  isResumable,
  progressOf,
  recordPlay,
  recordProgress,
  resumeAt,
  toSaved,
  type HistoryEntry,
} from "../../src/lib/watch/library";
import { DESCRIPTION_BUDGET, buildDraft } from "../../src/lib/watch/askPanda";
import { en } from "../../src/lib/i18n/strings";
import type { Video } from "../../src/lib/watch/types";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

async function main() {
  // --- Parsing ---------------------------------------------------------------

  console.log("\ndurations");
  ok("hours, minutes and seconds", parseDuration("PT1H2M3S") === 3723);
  ok("seconds only", parseDuration("PT45S") === 45);
  ok("days count too", parseDuration("P1DT2H") === 93600);
  ok("a live stream's P0D is no length, not zero", parseDuration("P0D") === null);
  ok("PT0S is no length either", parseDuration("PT0S") === null);
  ok("garbage is null", parseDuration("1:00") === null && parseDuration(undefined) === null);

  console.log("\ntitles");
  ok("an apostrophe comes back", decodeEntities("Newton&#39;s Laws") === "Newton's Laws");
  ok("hex entities too", decodeEntities("Rock &#x27;n&#x27; Roll") === "Rock 'n' Roll");
  ok("named ones", decodeEntities("Q&amp;A &quot;live&quot; &lt;3") === 'Q&A "live" <3');
  ok("unknown entities are left as typed", decodeEntities("&copy; 2024") === "&copy; 2024");
  ok("control characters are refused", decodeEntities("a&#0;b") === "a&#0;b");
  ok("plain text is untouched", decodeEntities("2 + 2 = 4") === "2 + 2 = 4");

  console.log("\ntimestamps");
  ok("3:12 reads as 192", parseClock("3:12") === 192);
  ok("1:02:03 reads as 3723", parseClock("1:02:03") === 3723);
  ok("3:75 is a ratio, not a time", parseClock("3:75") === null);
  ok("formatting round-trips", formatClock(3723) === "1:02:03" && formatClock(192) === "3:12" && formatClock(5) === "0:05");

  const parts = splitTimestamps("Intro at 0:00, the proof at 3:12 and v1:20:30a, see 12:30 later", 600);
  const times = parts.filter((p) => p.kind === "time").map((p) => (p.kind === "time" ? p.seconds : -1));
  ok("finds the real timestamps", times.join(",") === "0,192", times.join(","));
  ok("leaves glued and out-of-range ones as text", parts.map((p) => p.text).join("") ===
    "Intro at 0:00, the proof at 3:12 and v1:20:30a, see 12:30 later");

  const description = [
    "In this video we cover the basics.",
    "",
    "0:00 Intro",
    "1:15 - What is a derivative?",
    "(4:30) Worked example",
    "Practice problems 9:05",
    "",
    "Thanks for watching!",
  ].join("\n");
  const chapters = parseChapters(description, 900);
  ok("chapters parse in order", chapters.map((c) => c.seconds).join(",") === "0,75,270,545",
    chapters.map((c) => `${c.seconds}:${c.title}`).join(" | "));
  ok("with their titles cleaned", chapters[1]?.title === "What is a derivative?" && chapters[3]?.title === "Practice problems");
  ok("not without a 0:00 start", parseChapters("1:00 a\n2:00 b\n3:00 c").length === 0);
  ok("not with fewer than three", parseChapters("0:00 a\n2:00 b").length === 0);
  ok("not out of order", parseChapters("0:00 a\n5:00 b\n3:00 c").length === 0);
  ok("the current chapter is found", chapterAt(chapters, 300) === 2 && chapterAt(chapters, 0) === 0);

  ok("video ids are validated", isVideoId("dQw4w9WgXcQ") && !isVideoId("../etc/passwd") && !isVideoId("short"));

  // --- Queries ----------------------------------------------------------------

  console.log("\nqueries and cache keys");
  ok("case and spacing fold together", normaliseQuery("  Newton's   LAWS ") === "newton's laws");
  ok("so they share a key", searchKey({ q: "Newton's LAWS" }) === searchKey({ q: " newton's  laws" }));
  ok("filters change the key", searchKey({ q: "a", filters: { dur: "short" } }) !== searchKey({ q: "a" }));
  ok("explicit relevance sort does not split the cache",
    searchKey({ q: "a", filters: { sort: "relevance" } }) === searchKey({ q: "a" }));
  ok("language changes the key", searchKey({ q: "a", lang: "es" }) !== searchKey({ q: "a", lang: "en" }));

  const filters = readFilters(new URLSearchParams("dur=short&date=week&sort=viewCount&cc=1&evil=1"));
  ok("known filters are read", filters.dur === "short" && filters.date === "week" && filters.sort === "viewCount" && filters.cc === true);
  const junk = readFilters(new URLSearchParams("dur=forever&date=yesterday&sort=random&cc=yes"));
  ok("unknown values are dropped", Object.keys(junk).length === 0, JSON.stringify(junk));

  const now = Date.parse("2026-10-13T15:42:10Z");
  const yt = youtubeFilterParams({ dur: "long", date: "week", sort: "date", cc: true }, now);
  ok("filters map to YouTube's names",
    yt.videoDuration === "long" && yt.order === "date" && yt.videoCaption === "closedCaption");
  ok("publishedAfter is a whole UTC day", yt.publishedAfter === "2026-10-06T00:00:00Z", yt.publishedAfter);

  ok("relevanceLanguage follows the locale", relevanceLanguage("es") === "es" && relevanceLanguage("pt-BR") === "pt");
  ok("Chinese asks for the script", relevanceLanguage("zh") === "zh-Hans");
  ok("nonsense is no language", relevanceLanguage("123") === null && relevanceLanguage(null) === null);

  ok("chips and starters are curated", TOPICS.every((t) => isCuratedQuery(t.query)) && STARTER_TERMS.every(isCuratedQuery));
  ok("typed searches are not", !isCuratedQuery("my homework question"));

  const rq = relatedQuery({ title: "Photosynthesis: Crash Course Biology #8", channel: "CrashCourse", tags: [] });
  ok("More like this searches the video's own words", rq.includes("photosynthesis") && rq.includes("biology"), rq);
  const rqTags = relatedQuery({ title: "Lesson 4", channel: "Mr Smith", tags: ["mr smith", "fractions", "#math", "adding fractions"] });
  ok("and falls back to tags for a bare title", rqTags.includes("fractions") && !rqTags.includes("#"), rqTags);

  const s1 = suggest("", ["Photosynthesis", "fractions"]);
  ok("an empty box suggests recents only", s1.length === 2 && s1.every((s) => s.recent));
  const s2 = suggest("pho", ["photosynthesis"]);
  ok("a recent match comes first and is not repeated", s2[0]?.text === "photosynthesis" && s2[0].recent &&
    s2.filter((s) => s.text === "photosynthesis").length === 1);
  ok("curated topics match by word", suggest("theorem", []).some((s) => s.text === "pythagorean theorem"));

  // --- Screening ----------------------------------------------------------------

  console.log("\nwhat is allowed through");
  const base: VideoItem = {
    id: "aaaaaaaaaaa",
    snippet: { title: "Fine", liveBroadcastContent: "none" },
    contentDetails: { duration: "PT5M" },
    status: { embeddable: true, privacyStatus: "public" },
  };
  ok("an ordinary video plays", screen(base) === null);
  ok("age-restricted is dropped",
    screen({ ...base, contentDetails: { duration: "PT5M", contentRating: { ytRating: "ytAgeRestricted" } } }) === "age");
  ok("live is dropped", screen({ ...base, snippet: { liveBroadcastContent: "live" } }) === "live");
  ok("upcoming is dropped", screen({ ...base, snippet: { liveBroadcastContent: "upcoming" } }) === "live");
  ok("a P0D length is treated as live", screen({ ...base, contentDetails: { duration: "P0D" } }) === "live");
  ok("non-embeddable is dropped", screen({ ...base, status: { embeddable: false, privacyStatus: "public" } }) === "embed");
  ok("private is dropped", screen({ ...base, status: { embeddable: true, privacyStatus: "private" } }) === "private");

  const detail = toDetail(
    { ...base, snippet: undefined, statistics: { viewCount: "1200" } },
    { id: { videoId: "aaaaaaaaaaa" }, snippet: { title: "Newton&#39;s Laws", channelTitle: "Q&amp;A Club" } },
  );
  ok("a search-only title is decoded", detail.title === "Newton's Laws" && detail.channel === "Q&A Club");
  ok("view counts are numbers", detail.viewCount === 1200);

  // --- The cache and the budget ---------------------------------------------------

  console.log("\nthe cache");
  let clock = 0;
  const lru = new LruCache<number>(2, () => clock);
  lru.set("a", 1, 100);
  lru.set("b", 2, 100);
  lru.get("a");
  lru.set("c", 3, 100);
  ok("evicts the least recently used", lru.get("b") === undefined && lru.get("a") === 1 && lru.get("c") === 3);
  clock = 150;
  ok("expires on time", lru.get("a") === undefined);
  ok("but keeps a stale copy for cache-only mode", lru.stale("a") === 1);

  const inflight = new InFlight();
  let runs = 0;
  const task = () => new Promise<number>((resolve) => { runs++; setTimeout(() => resolve(7), 5); });
  const [x, y] = await Promise.all([inflight.run("k", task), inflight.run("k", task)]);
  ok("concurrent askers share one promise", runs === 1 && x === 7 && y === 7);

  console.log("\nthe daily budget");
  let t = Date.parse("2026-10-13T20:00:00Z"); // 1pm in California
  const budget = new UnitBudget(SEARCH_CEILING, () => t);
  budget.spend(8_450);
  ok("a search past the ceiling is refused", !budget.canSpend(101, SEARCH_CEILING));
  ok("a 1-unit lookup still fits under its own ceiling", budget.canSpend(1, LOOKUP_CEILING));
  t = Date.parse("2026-10-14T06:30:00Z"); // 11:30pm the same Pacific day
  ok("the day has not rolled over at UTC midnight", !budget.canSpend(101, SEARCH_CEILING) && pacificDay(t) === "2026-10-13");
  t = Date.parse("2026-10-14T07:30:00Z"); // 00:30 in California
  ok("it rolls over at Pacific midnight", budget.canSpend(101, SEARCH_CEILING) && budget.spent === 0);
  budget.exhaust();
  ok("YouTube saying no closes the day", !budget.canSpend(1, LOOKUP_CEILING));

  // --- The client, against a fake YouTube ---------------------------------------------

  console.log("\nthe YouTube client");
  const calls: { endpoint: string; params: URLSearchParams }[] = [];
  let failTerm: string | null = null;
  let quotaGone = false;

  function item(id: string, extra: Partial<VideoItem> = {}): VideoItem {
    return {
      id,
      snippet: {
        title: `Real title for ${id}`,
        description: `0:00 Intro\n1:00 Middle\n2:00 End\nAbout ${id}`,
        channelTitle: "Channel",
        channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
        publishedAt: "2024-01-01T00:00:00Z",
        tags: ["science"],
        liveBroadcastContent: "none",
        thumbnails: { medium: { url: `m/${id}` }, high: { url: `h/${id}` } },
      },
      contentDetails: { duration: "PT4M", caption: "true" },
      statistics: { viewCount: "10" },
      status: { embeddable: true, privacyStatus: "public" },
      ...extra,
    };
  }
  const catalogue: Record<string, VideoItem> = {
    good0000001: item("good0000001"),
    good0000002: item("good0000002"),
    live0000001: item("live0000001", { snippet: { ...item("x").snippet, liveBroadcastContent: "live" }, contentDetails: { duration: "P0D" } }),
    ageR0000001: item("ageR0000001", { contentDetails: { duration: "PT9M", contentRating: { ytRating: "ytAgeRestricted" } } }),
    noEm0000001: item("noEm0000001", { status: { embeddable: false, privacyStatus: "public" } }),
  };

  const fakeFetch: FetchLike = async (url) => {
    const u = new URL(url);
    const endpoint = u.pathname.split("/").pop() ?? "";
    calls.push({ endpoint, params: u.searchParams });
    await new Promise((r) => setTimeout(r, 2));
    const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (quotaGone) return json(403, { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } });
    if (endpoint === "search") {
      if (failTerm && u.searchParams.get("q") === failTerm) return json(500, { error: { message: "backend error" } });
      return json(200, {
        nextPageToken: "NEXT",
        items: Object.keys(catalogue).map((id) => ({
          id: { videoId: id },
          snippet: { title: `Escaped &#39;${id}&#39;`, channelTitle: "Channel" },
        })),
      });
    }
    if (endpoint === "videos") {
      const ids = (u.searchParams.get("id") ?? "").split(",");
      return json(200, { items: ids.map((id) => catalogue[id]).filter(Boolean) });
    }
    if (endpoint === "channels") {
      return json(200, { items: [{ id: u.searchParams.get("id"), snippet: { title: "Channel", thumbnails: { default: { url: "avatar" } } } }] });
    }
    return json(404, {});
  };

  let fakeNow = Date.parse("2026-10-13T16:00:00Z");
  const ytBudget = new UnitBudget(SEARCH_CEILING, () => fakeNow);
  const client = createYouTube({ fetch: fakeFetch, key: "test", budget: ytBudget, now: () => fakeNow });
  const searchesSent = () => calls.filter((c) => c.endpoint === "search").length;

  const [first, second] = await Promise.all([
    client.search({ q: "Membrane  TRANSPORT", lang: "es" }),
    client.search({ q: "  membrane transport ", lang: "es" }),
  ]);
  ok("two students' identical searches cost one search", searchesSent() === 1, `${searchesSent()} sent`);
  ok("and both get the answer", first.videos.length === second.videos.length && first.videos.length > 0);

  const sent = calls.find((c) => c.endpoint === "search")!.params;
  ok("it always asks for fifty", sent.get("maxResults") === "50");
  ok("with strict SafeSearch", sent.get("safeSearch") === "strict");
  ok("embeddable, syndicated videos only", sent.get("videoEmbeddable") === "true" && sent.get("videoSyndicated") === "true");
  ok("in the student's language", sent.get("relevanceLanguage") === "es");
  ok("with the normalised query", sent.get("q") === "membrane transport");
  const parts2 = calls.find((c) => c.endpoint === "videos")!.params.get("part") ?? "";
  ok("details include snippet, status and ratings", ["snippet", "contentDetails", "statistics", "status"].every((p) => parts2.includes(p)));

  const ids = first.videos.map((v) => v.id).sort().join(",");
  ok("live, age-restricted and non-embeddable videos are dropped", ids === "good0000001,good0000002", ids);
  ok("titles come from videos.list, unescaped", first.videos[0].title.startsWith("Real title"));
  ok("cards carry srcset sizes and the CC flag", first.videos[0].thumbnailHigh === "h/good0000001" && first.videos[0].captions === true);
  ok("cards carry a snippet but not the whole description",
    typeof first.videos[0].snippet === "string" && !("description" in first.videos[0]));
  ok("the next page is offered", first.nextPageToken === "NEXT");
  ok("a search spends 101 units", ytBudget.spent === 101, String(ytBudget.spent));

  const before = calls.length;
  const lookup = await client.video("good0000001");
  ok("opening a video from the results costs no video lookup", calls.filter((c) => c.endpoint === "videos").length === 1);
  ok("the watch page gets the full description", lookup.video?.description.includes("1:00 Middle") === true);
  ok("and the channel avatar (1 unit)", lookup.channel?.avatar === "avatar" && calls.length === before + 1);
  const blocked = await client.video("ageR0000001");
  ok("a deep link to an age-restricted video says why it won't play", blocked.video === null && blocked.blocked === "age");

  await client.search({ q: "membrane transport", lang: "es" });
  ok("a repeat inside the hour is free", searchesSent() === 1);
  fakeNow += 2 * 60 * 60 * 1000;
  await client.search({ q: "membrane transport", lang: "es" });
  ok("after the hour it asks again", searchesSent() === 2);

  await client.search({ q: TOPICS[0].query, categoryId: TOPICS[0].categoryId });
  const chipSearch = calls.filter((c) => c.endpoint === "search").pop()!.params;
  ok("chips search inside their category", chipSearch.get("videoCategoryId") === TOPICS[0].categoryId);
  fakeNow += 6 * 60 * 60 * 1000;
  const sentBefore = searchesSent();
  await client.search({ q: TOPICS[0].query, categoryId: TOPICS[0].categoryId });
  ok("and are kept most of a day", searchesSent() === sentBefore && TTL.curated >= 12 * 60 * 60 * 1000);

  console.log("\nthe feed");
  failTerm = "broken term";
  const feed = await client.feed(
    [
      { term: "broken term", because: "b" },
      { term: "membrane transport", because: "p" },
    ],
    "es",
  );
  ok("one failing term does not take the feed down", feed.videos.length > 0 && feed.partial);
  ok("each card keeps its reason", feed.videos.every((v) => v.because === "p"));
  ok("and the failed seed is left out of the explanation", feed.seeds.length === 1 && feed.seeds[0].term === "membrane transport");
  let allFailed: unknown = null;
  await client.feed([{ term: "broken term", because: "b" }], "es").catch((e) => { allFailed = e; });
  ok("a feed with nothing left reports the problem", allFailed instanceof YouTubeError);
  failTerm = null;

  const blended = blend(
    [
      { seed: { term: "a", because: "A" }, videos: [{ id: "1" }, { id: "2" }] as Video[] },
      { seed: { term: "b", because: "B" }, videos: [{ id: "1" }, { id: "3" }] as Video[] },
    ],
    10,
  );
  ok("blending alternates and de-duplicates", blended.map((v) => v.id).join("") === "123" && blended[0].because === "A");

  console.log("\nquota");
  quotaGone = true;
  let quotaError: unknown = null;
  await client.search({ q: "something new" }).catch((e) => { quotaError = e; });
  ok("quota comes back as quota, not a failure",
    quotaError instanceof YouTubeError && quotaError.problem === "quota" && quotaError.status === 429);
  ok("and closes the day", ytBudget.isExhausted);
  quotaGone = false;
  const callsNow = calls.length;
  const stale = await client.search({ q: "membrane transport", lang: "es" });
  ok("searches already made are served from cache with no call", stale.videos.length > 0 && calls.length === callsNow);
  let refused: unknown = null;
  await client.search({ q: "another new thing" }).catch((e) => { refused = e; });
  ok("new ones are refused without spending", refused instanceof YouTubeError && calls.length === callsNow);

  const lowBudget = new UnitBudget(SEARCH_CEILING, () => fakeNow);
  lowBudget.spend(SEARCH_CEILING - 50);
  const thrifty = createYouTube({ fetch: fakeFetch, key: "test", budget: lowBudget, now: () => fakeNow });
  const beforeLow = calls.length;
  await thrifty.search({ q: "x" }).catch(() => undefined);
  ok("near the ceiling searches switch to cache-only", calls.length === beforeLow);

  // --- The library ----------------------------------------------------------------

  console.log("\nthe library");
  const v = (id: string, seconds: number | null = 600): Video => ({
    id, title: id, channel: "c", channelId: "", thumbnail: "", publishedAt: "", seconds, viewCount: null, because: null,
  });
  ok("29 seconds in is not worth resuming", !isResumable({ position: 29, seconds: 600 }));
  ok("30 seconds in is", isResumable({ position: 30, seconds: 600 }));
  ok("past 90% counts as watched", !isResumable({ position: 545, seconds: 600 }));
  ok("resume backs up a few seconds", resumeAt({ position: 100, seconds: 600 }) === 97);
  ok("a finished video starts over", resumeAt({ position: 590, seconds: 600 }) === 0);
  ok("progress is a fraction", progressOf({ position: 150, seconds: 600 }) === 0.25 && progressOf({ position: 0, seconds: 600 }) === null);

  let history: HistoryEntry[] = [];
  history = recordPlay(history, v("a"), 1);
  history = recordProgress(history, "a", 120, 600);
  history = recordPlay(history, v("b"), 2);
  history = recordPlay(history, v("a"), 3);
  ok("replaying moves it to the top without a duplicate", history.map((h) => h.id).join("") === "ab");
  ok("and keeps how far they got", history[0].position === 120);
  ok("continue watching lists the started ones", continueWatching(history).map((h) => h.id).join("") === "a");
  for (let i = 0; i < MAX_HISTORY + 20; i++) history = recordPlay(history, v(`id${i}`), 10 + i);
  ok("history is capped", history.length === MAX_HISTORY);
  ok("the player's length wins over the API's", recordProgress([{ ...history[0], seconds: null }], history[0].id, 10, 321)[0].seconds === 321);

  const saved = addSaved([], v("a"), 5);
  ok("Watch later keeps the old storage shape",
    ["id", "title", "channel", "channelId", "thumbnail", "publishedAt", "seconds", "viewCount", "savedAt"].every((k) => k in saved[0]));
  ok("and never saves twice", addSaved(saved, v("a"), 6) === saved);
  ok("toSaved carries srcset sizes when present", toSaved({ ...v("z"), thumbnailHigh: "h" }, 1).thumbnailHigh === "h");

  let recent: string[] = [];
  for (const q of ["One", "two", "ONE", "three", "4", "5", "6", "7", "8", "9"]) recent = addRecent(recent, q);
  ok("recent searches dedupe ignoring case", recent.filter((r) => r.toLowerCase() === "one").length === 1);
  ok("and stay short", recent.length === MAX_RECENT && recent[0] === "9");

  // --- Ask Panda --------------------------------------------------------------------

  console.log("\nask panda");
  const t2 = (key: keyof typeof en, vars?: Record<string, string | number>) => {
    let text: string = en[key];
    for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  const draft = buildDraft(
    { id: "good0000001", title: "Derivatives", channel: "Math Club", description: "word ".repeat(400), at: 192 },
    t2,
  );
  ok("the draft names the video and links it", draft.includes("Derivatives") && draft.includes("Math Club") &&
    draft.includes("https://www.youtube.com/watch?v=good0000001"));
  ok("says where they were", draft.includes("3:12"));
  ok("is honest that Panda can't watch it", /can't watch/i.test(draft));
  const quoted = draft.length - buildDraft({ id: "good0000001", title: "Derivatives", channel: "Math Club", at: 192 }, t2).length;
  ok("and carries at most ~800 characters of description", quoted <= DESCRIPTION_BUDGET + 120, String(quoted));
  ok("without a timestamp when they haven't started", !buildDraft({ id: "x", title: "T", channel: "C", at: 2 }, t2).includes("0:02"));

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
