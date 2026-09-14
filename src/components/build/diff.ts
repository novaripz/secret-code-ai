// A line diff, written here rather than installed.
//
// The tradeoff was a real one: a proper diff library gives you word-level
// highlighting and the Myers algorithm's linear-space refinement. But this app
// serves a classroom over a school network under a CSP that only admits
// jsDelivr and cdnjs, and every extra runtime download is another thing that
// can be the reason a lesson does not start. What a student needs from a diff
// is "these lines went, those came" — which a common-subsequence walk over
// files of a few hundred lines answers in under a millisecond.
//
// The guard is the file size: above LINE_LIMIT the quadratic table would be the
// slowest thing on the page, so we stop claiming to diff and say so instead.

export type DiffKind = "same" | "added" | "removed";

export interface DiffRow {
  kind: DiffKind;
  text: string;
  /** 1-based line number in the old file, or null for an added line. */
  before: number | null;
  /** 1-based line number in the new file, or null for a removed line. */
  after: number | null;
}

export interface DiffResult {
  rows: DiffRow[];
  added: number;
  removed: number;
  /** True when the files were too big to compare honestly. */
  tooLarge: boolean;
}

/** Past this, the table costs more than the answer is worth. */
const LINE_LIMIT = 1200;

export function diffLines(before: string, after: string): DiffResult {
  const a = before.length === 0 ? [] : before.split("\n");
  const b = after.length === 0 ? [] : after.split("\n");

  if (a.length > LINE_LIMIT || b.length > LINE_LIMIT) {
    return { rows: [], added: b.length, removed: a.length, tooLarge: true };
  }

  // lcs[i][j] = length of the longest common run of a[i:] and b[j:]. Built from
  // the end so the walk below can go forwards, which is the order the rows are
  // read in.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i], before: i + 1, after: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ kind: "removed", text: a[i], before: i + 1, after: null });
      removed++;
      i++;
    } else {
      rows.push({ kind: "added", text: b[j], before: null, after: j + 1 });
      added++;
      j++;
    }
  }
  while (i < a.length) {
    rows.push({ kind: "removed", text: a[i], before: i + 1, after: null });
    removed++;
    i++;
  }
  while (j < b.length) {
    rows.push({ kind: "added", text: b[j], before: null, after: j + 1 });
    added++;
    j++;
  }

  return { rows, added, removed, tooLarge: false };
}

/**
 * Collapses long stretches of untouched lines. A student scrolling past two
 * hundred identical lines to find the one that changed has been shown the file,
 * not the edit.
 */
export interface DiffHunk {
  rows: DiffRow[];
  /** Lines hidden immediately before this hunk, 0 when nothing was skipped. */
  skipped: number;
}

const CONTEXT = 3;

export function hunks(rows: DiffRow[]): DiffHunk[] {
  const interesting = rows.map((r) => r.kind !== "same");
  const keep = rows.map((_, index) =>
    interesting.slice(Math.max(0, index - CONTEXT), index + CONTEXT + 1).some(Boolean),
  );

  const out: DiffHunk[] = [];
  let current: DiffRow[] = [];
  let skipped = 0;
  let pendingSkip = 0;

  for (let index = 0; index < rows.length; index++) {
    if (keep[index]) {
      if (current.length === 0) skipped = pendingSkip;
      pendingSkip = 0;
      current.push(rows[index]);
    } else {
      pendingSkip++;
      if (current.length > 0) {
        out.push({ rows: current, skipped });
        current = [];
      }
    }
  }
  if (current.length > 0) out.push({ rows: current, skipped });
  return out;
}
