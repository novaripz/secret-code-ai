import type { StringKey } from "@/lib/i18n";
import { formatClock } from "@/lib/watch/parse";

// Numbers a student reads at a glance rather than counts.
//
// All of it is formatted here, in one file, because the same video appears on
// the home page, in search results, in Up next and in the library, and "1.2M
// views" turning into "1,234,567 views" between two of them would read as two
// different videos. The browser's Intl does the language work — "1,2 M" in
// French, "3 años" in Spanish — so nothing here is English by accident.

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

/** 3723 -> "1:02:03". Null in, null out: some videos have no length. */
export function duration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  return formatClock(seconds);
}

const compactCache = new Map<string, Intl.NumberFormat>();
function compact(locale: string): Intl.NumberFormat {
  let f = compactCache.get(locale);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
    } catch {
      f = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
    }
    compactCache.set(locale, f);
  }
  return f;
}

/** 1_234_567 -> "1.2M views". */
export function views(count: number | null | undefined, t: T, locale: string): string | null {
  if (count == null || count < 0) return null;
  if (count === 1) return t("watch.viewsOne");
  // Rounded down before formatting, so "1.29M" never shows as "1.3M": a count
  // should never over-claim.
  const magnitude = count >= 1e9 ? 1e8 : count >= 1e6 ? 1e5 : count >= 1e4 ? 1e3 : count >= 1e3 ? 1e2 : 1;
  return t("watch.views", { count: compact(locale).format(Math.floor(count / magnitude) * magnitude) });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/**
 * "3 years ago". Deliberately vague at the top end — for schoolwork the only
 * thing age answers is "is this still the way we're taught it", and a date
 * would take longer to read without answering it any better.
 */
export function age(iso: string | null | undefined, t: T, locale: string, now = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const ms = Math.max(0, now - at);
  for (const [unit, size] of UNITS) {
    if (ms >= size) {
      try {
        return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(ms / size), unit);
      } catch {
        return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(-Math.floor(ms / size), unit);
      }
    }
  }
  return t("watch.justNow");
}

/** "Mar 3, 2024", for the watch page where the exact day is worth showing. */
export function date(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(at);
  } catch {
    return new Date(at).toDateString();
  }
}

/** "views · age", the meta line under every title. */
export function metaLine(video: { viewCount: number | null; publishedAt: string }, t: T, locale: string): string {
  return [views(video.viewCount, t, locale), age(video.publishedAt, t, locale)].filter(Boolean).join(" · ");
}

/**
 * A colour for a channel's initial when there is no avatar to show, picked
 * from the channel name so the same channel always gets the same one.
 */
export function channelHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function watchUrl(origin: string, id: string): string {
  return `${origin}/watch?v=${id}`;
}
