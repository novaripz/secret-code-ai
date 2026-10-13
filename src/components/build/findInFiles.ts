// Find (and replace) across every file in the project, as plain functions.
//
// The palette only ever matched file NAMES, so "where did I use `score`?" in a
// six-file game meant opening each file and pressing Ctrl F six times. This is
// the search every editor has, kept away from React so the matching rules —
// which are easy to get subtly wrong (a regex that matches nothing forever, a
// "whole word" that ignores the edges of a line, a `$1` in a plain replacement)
// — can be checked by `npm run check` rather than by hand.

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  /** 1-based, as the editor counts. */
  line: number;
  /** 1-based column of the match's first character. */
  col: number;
  length: number;
  /** The line it is on, trimmed to something that fits a row. */
  preview: string;
  /** Where the match starts inside `preview`. */
  previewStart: number;
}

export interface FileMatches {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResult {
  results: FileMatches[];
  total: number;
  /** True when the cap was reached and there are more matches than shown. */
  truncated: boolean;
  /** A regex that does not compile, in words. */
  error?: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pattern for these options, or an error when a regex will not compile. Null for an empty query. */
export function buildMatcher(options: SearchOptions): RegExp | { error: string } | null {
  if (!options.query) return null;
  let source = options.regex ? options.query : escapeRegExp(options.query);
  if (options.wholeWord) source = `(?<![\\w$])(?:${source})(?![\\w$])`;
  try {
    return new RegExp(source, options.caseSensitive ? "g" : "gi");
  } catch (err) {
    return { error: err instanceof Error ? err.message.replace(/^Invalid regular expression: /, "") : "That pattern doesn't work." };
  }
}

/** Every match in one text, capped. Zero-length matches (a bare `^`) are skipped rather than looped on. */
function matchesIn(text: string, pattern: RegExp, cap: number): SearchMatch[] {
  const out: SearchMatch[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && out.length < cap; i++) {
    const line = lines[i];
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(line)) !== null && out.length < cap) {
      if (m[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      const start = m.index;
      // A long minified line is shown from a little before the match, so the
      // match is on screen rather than three hundred characters to the right.
      const from = Math.max(0, start - 40);
      const leading = line.slice(from).length - line.slice(from).trimStart().length;
      const preview = line.slice(from + leading, from + 200).trimEnd();
      out.push({ line: i + 1, col: start + 1, length: m[0].length, preview, previewStart: start - from - leading });
    }
  }
  return out;
}

/**
 * Searches every text file. Pictures and sounds are skipped — their content is
 * base64, and a match inside it is noise.
 */
export function searchFiles(
  files: { path: string; content: string }[],
  options: SearchOptions,
  limit = 1000,
): SearchResult {
  const pattern = buildMatcher(options);
  if (!pattern) return { results: [], total: 0, truncated: false };
  if ("error" in pattern) return { results: [], total: 0, truncated: false, error: pattern.error };
  const results: FileMatches[] = [];
  let total = 0;
  let truncated = false;
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (file.content.startsWith("data:")) continue;
    const remaining = limit - total;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const matches = matchesIn(file.content, pattern, remaining + 1);
    if (matches.length > remaining) {
      truncated = true;
      matches.length = remaining;
    }
    if (matches.length > 0) {
      results.push({ path: file.path, matches });
      total += matches.length;
    }
  }
  return { results, total, truncated };
}

/**
 * Replaces every match in one text. With "regex" on, `$1` in the replacement
 * means the first group, as students who know regexes expect; with it off, the
 * replacement is inserted exactly as typed — a `$` in a price is a dollar sign.
 */
export function replaceAll(text: string, options: SearchOptions, replacement: string): { text: string; count: number } {
  const pattern = buildMatcher(options);
  if (!pattern || "error" in pattern) return { text, count: 0 };
  let count = 0;
  const out = text.replace(pattern, (...args) => {
    const match = args[0] as string;
    if (match.length === 0) return match;
    count++;
    if (!options.regex) return replacement;
    // Expand $1, $2 … and $& by hand, against this match's own groups.
    // The callback's tail is (offset, whole string) — plus a groups object
    // when the pattern has named groups.
    const named = typeof args[args.length - 1] === "object" && args[args.length - 1] !== null;
    const groups = args.slice(1, named ? -3 : -2) as (string | undefined)[];
    return replacement.replace(/\$(\$|&|\d{1,2})/g, (whole, token: string) => {
      if (token === "$") return "$";
      if (token === "&") return match;
      const index = Number(token);
      return index >= 1 && index <= groups.length ? (groups[index - 1] ?? "") : whole;
    });
  });
  return { text: out, count };
}
