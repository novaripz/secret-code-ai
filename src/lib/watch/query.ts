// What a search is, written down once for both ends of the wire.
//
// The browser builds URLs out of these and the route builds YouTube requests
// out of the same values, so a filter means the same thing in the address bar,
// in the cache key and in the call that spends quota. The curated lists at the
// bottom live here for the same reason: the server gives them a long cache life
// precisely because every student's browser asks for the identical string.

export type DurationFilter = "short" | "medium" | "long";
export type DateFilter = "week" | "month" | "year";
export type SortFilter = "relevance" | "date" | "viewCount" | "rating";

export interface SearchFilters {
  dur?: DurationFilter;
  date?: DateFilter;
  sort?: SortFilter;
  /** Only videos with real closed captions. */
  cc?: boolean;
}

export const DURATIONS: DurationFilter[] = ["short", "medium", "long"];
export const DATES: DateFilter[] = ["week", "month", "year"];
export const SORTS: SortFilter[] = ["relevance", "date", "viewCount", "rating"];

/** Longest query worth sending. Past this it is a paste, not a search. */
export const MAX_QUERY = 200;

/**
 * One spelling per search, so "Newton's  LAWS" and "newton's laws" share a
 * cache entry and a single YouTube call. NFKC folds full-width and compatibility
 * characters a phone keyboard sometimes produces into their plain forms.
 */
export function normaliseQuery(q: string | null | undefined): string {
  if (!q) return "";
  return q.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, MAX_QUERY).trim();
}

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * Filters out of anything with a `get` — URLSearchParams on both ends. Unknown
 * values are dropped rather than passed on, because each one ends up in a
 * request that spends quota.
 */
export function readFilters(params: { get(name: string): string | null }): SearchFilters {
  const filters: SearchFilters = {};
  const dur = pick(params.get("dur"), DURATIONS);
  const date = pick(params.get("date"), DATES);
  const sort = pick(params.get("sort"), SORTS);
  if (dur) filters.dur = dur;
  if (date) filters.date = date;
  // Relevance is YouTube's default; writing it out would only split the cache.
  if (sort && sort !== "relevance") filters.sort = sort;
  if (params.get("cc") === "1") filters.cc = true;
  return filters;
}

/** The same filters as URL pairs, in a fixed order so equal filters make equal URLs. */
export function filterEntries(filters: SearchFilters): [string, string][] {
  const out: [string, string][] = [];
  if (filters.dur) out.push(["dur", filters.dur]);
  if (filters.date) out.push(["date", filters.date]);
  if (filters.sort && filters.sort !== "relevance") out.push(["sort", filters.sort]);
  if (filters.cc) out.push(["cc", "1"]);
  return out;
}

export function countFilters(filters: SearchFilters): number {
  return filterEntries(filters).length;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS: Record<DateFilter, number> = { week: 7, month: 30, year: 365 };

/**
 * The search.list parameters for a set of filters.
 *
 * `publishedAfter` is rounded down to midnight UTC so the request is the same
 * all day: a timestamp to the second would make two students a minute apart
 * look like two different searches to anything downstream that compares them.
 */
export function youtubeFilterParams(filters: SearchFilters, now = Date.now()): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.dur) params.videoDuration = filters.dur;
  if (filters.date) {
    const since = Math.floor((now - WINDOW_DAYS[filters.date] * DAY_MS) / DAY_MS) * DAY_MS;
    params.publishedAfter = new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  if (filters.sort && filters.sort !== "relevance") params.order = filters.sort;
  if (filters.cc) params.videoCaption = "closedCaption";
  return params;
}

/**
 * The language YouTube should favour. Panda's locale codes are already ISO
 * 639-1, which is what relevanceLanguage wants, except Chinese, where YouTube
 * asks for the script.
 */
export function relevanceLanguage(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const base = locale.toLowerCase().split(/[-_]/)[0];
  if (!/^[a-z]{2}$/.test(base)) return null;
  return base === "zh" ? "zh-Hans" : base;
}

export interface SearchSpec {
  q: string;
  filters?: SearchFilters;
  lang?: string | null;
  pageToken?: string | null;
  categoryId?: string | null;
}

/**
 * The cache key for one search. Every input that changes what YouTube returns
 * is in it, and nothing else is — in particular not the number of results the
 * caller wants, because every search fetches the maximum of fifty and slices.
 */
export function searchKey(spec: SearchSpec): string {
  const f = filterEntries(spec.filters ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return [
    "s",
    normaliseQuery(spec.q),
    f,
    relevanceLanguage(spec.lang) ?? "",
    spec.categoryId ?? "",
    spec.pageToken ?? "",
  ].join("|");
}

// --- Words ------------------------------------------------------------------

/**
 * English and Spanish function words, plus the ones every video title is made
 * of. Shared by the feed (which looks for a word that keeps coming up in what a
 * student saves) and by "More like this" (which searches a video's own words).
 */
export const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "how", "what", "why", "when",
  "are", "was", "were", "his", "her", "its", "our", "their", "they", "them", "but", "not", "all",
  "can", "will", "just", "about", "into", "out", "get", "got", "make", "made", "does", "did", "done",
  "video", "videos", "full", "part", "episode", "official", "new", "best", "top", "watch", "free",
  "tutorial", "lesson", "class", "course", "guide", "intro", "introduction", "crash", "review",
  "minutes", "minute", "hour", "hours", "explained", "explain", "learn", "easy", "simple", "quick",
  "los", "las", "una", "unos", "unas", "por", "para", "con", "que", "como", "del", "más", "muy",
  "este", "esta", "esto", "son", "ser", "todo", "toda", "sobre", "hacer", "clase",
]);

/** Words that carry meaning in a title: long enough, not numbers, not noise. */
export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * The one search behind "More like this" (YouTube removed relatedToVideoId in
 * 2023, so there is no free answer). The video's own title words come first
 * because they say what this video is about; the channel's name is taken out
 * of them, or every suggestion would be the same channel. Tags fill in when
 * the title is too short to say anything.
 */
export function relatedQuery(video: { title: string; channel: string; tags?: string[] }): string {
  const channelWords = new Set(titleWords(video.channel));
  const words = [...new Set(titleWords(video.title))].filter((w) => !channelWords.has(w)).slice(0, 4);
  if (words.length >= 2) return normaliseQuery(words.join(" "));

  const channel = video.channel.trim().toLowerCase();
  const tags = (video.tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && t.length <= 40 && t.toLowerCase() !== channel && !t.startsWith("#"))
    .slice(0, 2);
  const fromTags = normaliseQuery([...words, ...tags].join(" "));
  return fromTags || normaliseQuery(video.title);
}

// --- Curated lists ------------------------------------------------------------

export type TopicId = "math" | "science" | "coding" | "history" | "english" | "languages" | "arts" | "study";

export interface Topic {
  id: TopicId;
  /** The exact search the chip runs, the same for every student. */
  query: string;
  /** YouTube's Education (27) or Science & Technology (28) category. */
  categoryId: "27" | "28";
}

/**
 * The home page's category chips. Each one is a fixed search inside YouTube's
 * Education category, so the result is the same for everyone in the building
 * and the server can keep it for most of a day.
 */
export const TOPICS: Topic[] = [
  { id: "math", query: "math lesson explained step by step", categoryId: "27" },
  { id: "science", query: "science explained for students", categoryId: "27" },
  { id: "coding", query: "learn to code for beginners", categoryId: "28" },
  { id: "history", query: "history explained", categoryId: "27" },
  { id: "english", query: "english writing and grammar lesson", categoryId: "27" },
  { id: "languages", query: "learn a new language beginner lesson", categoryId: "27" },
  { id: "arts", query: "art and music lessons for beginners", categoryId: "27" },
  { id: "study", query: "study tips for students", categoryId: "27" },
];

export function findTopic(id: string | null | undefined): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/**
 * What the feed searches before a student has saved anything. Plain study
 * searches, said to be exactly that on every card they produce.
 */
export const STARTER_TERMS = [
  "study skills for high school students",
  "algebra explained step by step",
  "how to write a better essay",
];

/**
 * Suggestions for the search box. Panda has no access to YouTube's own
 * autocomplete (there is no official endpoint for it), so these are a fixed
 * list of things students actually look up, matched locally as they type.
 */
export const SUGGESTED_SEARCHES = [
  "photosynthesis",
  "pythagorean theorem",
  "solving linear equations",
  "quadratic formula",
  "fractions and decimals",
  "derivatives calculus",
  "periodic table",
  "chemical reactions",
  "newton's laws of motion",
  "cell structure biology",
  "dna and genetics",
  "the water cycle",
  "plate tectonics",
  "the solar system",
  "world war 1 causes",
  "world war 2 summary",
  "the american revolution",
  "ancient rome",
  "the cold war",
  "civil rights movement",
  "how to write a thesis statement",
  "parts of speech",
  "how to analyze a poem",
  "shakespeare explained",
  "persuasive essay structure",
  "python for beginners",
  "javascript basics",
  "html and css tutorial",
  "scratch programming",
  "how computers work",
  "spanish for beginners",
  "french pronunciation",
  "how to draw faces",
  "music theory basics",
  "how to take good notes",
  "pomodoro technique",
  "how to study for a test",
  "time management for students",
  "public speaking tips",
  "how to cite sources",
];

/** Every query the server should treat as shared by the whole school. */
export function isCuratedQuery(q: string): boolean {
  const n = normaliseQuery(q);
  return (
    STARTER_TERMS.includes(n) ||
    TOPICS.some((t) => t.query === n) ||
    SUGGESTED_SEARCHES.includes(n)
  );
}

/**
 * Local suggestions for what is typed so far: recent searches first (they are
 * the student's own), then curated ones, prefix matches ahead of mid-string
 * ones, never the exact text already in the box.
 */
export function suggest(input: string, recent: string[], limit = 8): { text: string; recent: boolean }[] {
  const typed = normaliseQuery(input);
  const seen = new Set<string>();
  const out: { text: string; recent: boolean }[] = [];

  const consider = (pool: string[], isRecent: boolean) => {
    const starts: string[] = [];
    const contains: string[] = [];
    for (const raw of pool) {
      const text = normaliseQuery(raw);
      if (!text || seen.has(text) || text === typed) continue;
      if (!typed || text.startsWith(typed) || text.split(" ").some((w) => w.startsWith(typed))) starts.push(text);
      else if (text.includes(typed)) contains.push(text);
    }
    for (const text of [...starts, ...contains]) {
      if (out.length >= limit || seen.has(text)) continue;
      seen.add(text);
      out.push({ text, recent: isRecent });
    }
  };

  consider(recent, true);
  // With nothing typed, recents alone are the useful list; the curated topics
  // join once there is something to match them against, or when there are no
  // recents to show.
  if (typed || out.length === 0) consider(SUGGESTED_SEARCHES, false);
  return out.slice(0, limit);
}
