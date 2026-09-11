// Numbers a student reads at a glance rather than counts.
//
// All of it is formatted here, in one file, because the same video appears in
// the feed, in search results and under Saved, and "1.2M views" turning into
// "1,234,567 views" between two tabs would read as two different videos.

/** 3723 -> "1:02:03". Null in, null out: live streams have no length. */
export function duration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** 1_234_567 -> "1.2M views". Rounded down, so it never over-claims. */
export function views(count: number | null): string | null {
  if (count === null || count < 0) return null;
  if (count < 1_000) return `${count} view${count === 1 ? "" : "s"}`;
  if (count < 1_000_000) return `${trim(count / 1_000)}K views`;
  if (count < 1_000_000_000) return `${trim(count / 1_000_000)}M views`;
  return `${trim(count / 1_000_000_000)}B views`;
}

function trim(value: number): string {
  // One decimal below ten, none above: "1.2M" is useful, "12.4M" is noise.
  return value < 10 ? (Math.floor(value * 10) / 10).toString() : Math.floor(value).toString();
}

const YEAR = 365 * 24 * 60 * 60 * 1000;
const MONTH = 30 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/**
 * "3 years ago". Deliberately vague at the top end — for schoolwork the only
 * thing age answers is "is this still the way we're taught it", and a date
 * would take longer to read without answering it any better.
 */
export function age(iso: string, now = Date.now()): string | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const ms = Math.max(0, now - at);

  if (ms >= YEAR) return plural(Math.floor(ms / YEAR), "year");
  if (ms >= MONTH) return plural(Math.floor(ms / MONTH), "month");
  if (ms >= DAY) return plural(Math.floor(ms / DAY), "day");
  if (ms >= HOUR) return plural(Math.floor(ms / HOUR), "hour");
  return "just now";
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
