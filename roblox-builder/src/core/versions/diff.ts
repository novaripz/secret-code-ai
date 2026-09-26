// Line diffs (Myers' O(ND) algorithm) and file-set comparison, for the diff
// views, change review before approval, and version history.

export type DiffOp = { kind: "equal" | "add" | "remove"; line: string; a?: number; b?: number };

export function diffLines(a: string, b: string): DiffOp[] {
  const A = a === "" ? [] : a.split("\n");
  const B = b === "" ? [] : b.split("\n");
  // Trim a common prefix and suffix first: most edits touch a small region.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length, endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const mid = myers(A.slice(start, endA), B.slice(start, endB));
  const out: DiffOp[] = [];
  for (let i = 0; i < start; i++) out.push({ kind: "equal", line: A[i], a: i + 1, b: i + 1 });
  let ai = start, bi = start;
  for (const op of mid) {
    if (op === "=") out.push({ kind: "equal", line: A[ai], a: ++ai, b: ++bi });
    else if (op === "-") out.push({ kind: "remove", line: A[ai], a: ++ai });
    else out.push({ kind: "add", line: B[bi], b: ++bi });
  }
  for (let i = endA; i < A.length; i++) out.push({ kind: "equal", line: A[i], a: ++ai, b: ++bi });
  return out;
}

function myers(A: string[], B: string[]): ("=" | "-" | "+")[] {
  const n = A.length, m = B.length;
  if (n === 0) return new Array(m).fill("+");
  if (m === 0) return new Array(n).fill("-");
  const max = n + m;
  // Very large, very different files: fall back to remove-all/add-all rather than O(N^2) memory.
  if (n * m > 25_000_000) return [...new Array(n).fill("-"), ...new Array(m).fill("+")];
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, A.length, B.length, offset);
    }
  }
  return [];
}

function backtrack(trace: Int32Array[], n: number, m: number, offset: number): ("=" | "-" | "+")[] {
  const ops: ("=" | "-" | "+")[] = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = v[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("=");
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push("+");
        y--;
      } else {
        ops.push("-");
        x--;
      }
    }
  }
  return ops.reverse();
}

export interface Hunk {
  aStart: number;
  bStart: number;
  lines: DiffOp[];
}

/** Groups a diff into hunks with `context` unchanged lines around each change. */
export function toHunks(ops: DiffOp[], context = 3): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;
  let lastChange = -Infinity;
  const closeCurrent = () => {
    if (current) current.lines.push(...ops.slice(lastChange + 1, Math.min(ops.length, lastChange + 1 + context)));
  };
  ops.forEach((op, i) => {
    if (op.kind === "equal") return;
    if (!current || i - lastChange > context * 2) {
      closeCurrent();
      const from = Math.max(0, i - context);
      const first = ops[from];
      current = { aStart: first.a ?? (first.b ?? 1), bStart: first.b ?? (first.a ?? 1), lines: ops.slice(from, i) };
      hunks.push(current);
    } else {
      current.lines.push(...ops.slice(lastChange + 1, i));
    }
    current.lines.push(op);
    lastChange = i;
  });
  closeCurrent();
  return hunks;
}

export function unifiedDiff(path: string, a: string, b: string): string {
  const hunks = toHunks(diffLines(a, b));
  if (hunks.length === 0) return "";
  const out = [`--- a/${path}`, `+++ b/${path}`];
  for (const h of hunks) {
    const aLen = h.lines.filter((l) => l.kind !== "add").length;
    const bLen = h.lines.filter((l) => l.kind !== "remove").length;
    out.push(`@@ -${h.aStart},${aLen} +${h.bStart},${bLen} @@`);
    for (const l of h.lines) out.push(`${l.kind === "add" ? "+" : l.kind === "remove" ? "-" : " "}${l.line}`);
  }
  return out.join("\n");
}

export interface FileChange {
  path: string;
  status: "added" | "removed" | "modified";
  binary: boolean;
  additions: number;
  deletions: number;
}

/** Compares two file sets given as path -> content hash (or content). */
export function compareFileSets(
  before: Record<string, string>,
  after: Record<string, string>,
  textOf?: (side: "before" | "after", path: string) => string | undefined,
): FileChange[] {
  const out: FileChange[] = [];
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const path of [...paths].sort()) {
    const a = before[path];
    const b = after[path];
    if (a === b) continue;
    const status: FileChange["status"] = a === undefined ? "added" : b === undefined ? "removed" : "modified";
    const ta = a === undefined ? "" : textOf ? textOf("before", path) : a;
    const tb = b === undefined ? "" : textOf ? textOf("after", path) : b;
    if (ta === undefined || tb === undefined) {
      out.push({ path, status, binary: true, additions: 0, deletions: 0 });
      continue;
    }
    const ops = diffLines(ta, tb);
    out.push({
      path,
      status,
      binary: false,
      additions: ops.filter((o) => o.kind === "add").length,
      deletions: ops.filter((o) => o.kind === "remove").length,
    });
  }
  return out;
}
