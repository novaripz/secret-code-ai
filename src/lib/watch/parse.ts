// Small parsers for the strings YouTube hands back.
//
// Every one of these is a pure function with no network and no React, so the
// checks in scripts/checks/watch.test.ts can pin them down exactly. They are
// the places where a wrong answer is visible to a student: a title that reads
// "Newton&#39;s Laws", a live stream drawn with a "0:00" badge, or a timestamp
// in a description that seeks to the wrong second.

/**
 * "PT1H2M3S" -> 3723. Null when YouTube gives no real length: live streams and
 * premieres come back as "P0D", which is a length of nothing rather than a
 * zero-second video, and a card should not print "0:00" for it.
 */
export function parseDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parts = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!parts) return null;
  const [, d, h, m, s] = parts;
  const total = Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Math.floor(Number(s ?? 0));
  return total > 0 ? total : null;
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Undoes the HTML escaping search.list applies to titles and channel names.
 *
 * Only the handful of entities YouTube actually emits are named here; numeric
 * ones cover the rest. Anything unrecognised is left exactly as it was, because
 * a title that genuinely contains "&copy;" is better shown as typed than
 * guessed at.
 */
export function decodeEntities(text: string): string {
  if (!text || !text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Refuse control characters and anything past the end of Unicode rather
      // than letting a malformed entity become an invisible character.
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return whole;
      return String.fromCodePoint(code);
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** 3723 -> "1:02:03", 192 -> "3:12". The format a timestamp is written in. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * "3:12" -> 192, "1:02:03" -> 3723. Null for anything that is not a clock
 * reading: minutes and seconds past 59 mean it was a ratio or a score ("3:75"),
 * not a time, and seeking to it would be nonsense.
 */
export function parseClock(text: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [, h, mm, ss] = m;
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (seconds > 59) return null;
  if (h !== undefined && minutes > 59) return null;
  return Number(h ?? 0) * 3600 + minutes * 60 + seconds;
}

export type DescriptionPart =
  | { kind: "text"; text: string }
  | { kind: "time"; text: string; seconds: number };

// A clock reading on its own, not glued to a word or a longer number on either
// side, so "v1:20:30a" or "10:30:45:12" do not light up as links.
const CLOCK = /(?<![\w:])(\d{1,2}:)?\d{1,2}:\d{2}(?![\w:])/g;

/**
 * Splits a description into plain text and clickable timestamps.
 *
 * Timestamps past the end of the video are left as text when the length is
 * known: a creator's "see 12:30 in part two" in a ten-minute video would
 * otherwise seek to the end and look broken.
 */
export function splitTimestamps(text: string, lengthSeconds: number | null = null): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(CLOCK)) {
    const at = match.index ?? 0;
    const seconds = parseClock(match[0]);
    if (seconds === null) continue;
    if (lengthSeconds !== null && seconds > lengthSeconds) continue;
    if (at > last) parts.push({ kind: "text", text: text.slice(last, at) });
    parts.push({ kind: "time", text: match[0], seconds });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export interface Chapter {
  seconds: number;
  title: string;
}

/**
 * Chapters the way YouTube itself recognises them: a list of lines that each
 * start (or end) with a timestamp, the first one at 0:00, at least three of
 * them, in ascending order. Anything looser is just a description that happens
 * to mention some times, and turning that into a chapter list would invent
 * structure the creator never wrote.
 */
export function parseChapters(description: string, lengthSeconds: number | null = null): Chapter[] {
  const found: Chapter[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const lead = /^[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*(?:[-–—:|•·]\s*)?(.+)$/.exec(line);
    const tail = lead ? null : /^(.+?)\s*(?:[-–—:|•·]\s*)?[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?$/.exec(line);
    const clock = lead ? lead[1] : tail ? tail[2] : null;
    const title = (lead ? lead[2] : tail ? tail[1] : "").trim();
    if (!clock || !title) continue;
    const seconds = parseClock(clock);
    if (seconds === null) continue;
    if (lengthSeconds !== null && seconds >= lengthSeconds) continue;
    found.push({ seconds, title: title.slice(0, 120) });
  }

  if (found.length < 3 || found[0].seconds !== 0) return [];
  for (let i = 1; i < found.length; i++) {
    if (found[i].seconds <= found[i - 1].seconds) return [];
  }
  return found;
}

/** Which chapter a given moment falls in, or -1 before the first. */
export function chapterAt(chapters: Chapter[], seconds: number): number {
  let index = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].seconds <= seconds) index = i;
    else break;
  }
  return index;
}

/** YouTube video ids are eleven URL-safe base64 characters, always. */
export function isVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
}

/** Channel ids are "UC" and twenty-two more of the same alphabet. */
export function isChannelId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^UC[A-Za-z0-9_-]{22}$/.test(value);
}
