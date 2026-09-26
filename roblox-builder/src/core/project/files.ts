// A project's files as the pure core sees them: a map from normalized
// forward-slash relative paths to contents. Text is a string; binary assets
// (meshes, textures, place files) are bytes.

export type FileData = string | Uint8Array;
export type FileMap = Map<string, FileData>;

export function isText(data: FileData | undefined): data is string {
  return typeof data === "string";
}

export function textOf(files: FileMap, path: string): string | undefined {
  const d = files.get(path);
  return typeof d === "string" ? d : undefined;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

/**
 * Normalizes a relative project path and rejects anything that could escape
 * the project root. Every path from the UI or the agent goes through this.
 */
export function normalizePath(raw: string): string {
  if (typeof raw !== "string") throw new Error("Path must be a string");
  const p = raw.replace(/\\/g, "/").trim();
  if (!p) throw new Error("Path is empty");
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p)) throw new Error(`Absolute paths are not allowed: ${raw}`);
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") throw new Error(`Path may not contain '..': ${raw}`);
    if (/[\x00-\x1f<>:"|?*]/.test(seg)) throw new Error(`Invalid character in path segment "${seg}"`);
    out.push(seg);
  }
  if (out.length === 0) throw new Error("Path is empty");
  return out.join("/");
}

/** Files directly or indirectly inside `dir` (a normalized path, or "" for the root). */
export function filesUnder(files: FileMap, dir: string): string[] {
  const prefix = dir ? `${dir}/` : "";
  return [...files.keys()].filter((p) => p.startsWith(prefix)).sort();
}

/** Immediate children of `dir`: file names and sub-directory names. */
export function listDir(files: FileMap, dir: string): { files: string[]; dirs: string[] } {
  const prefix = dir ? `${dir}/` : "";
  const fileSet = new Set<string>();
  const dirSet = new Set<string>();
  for (const p of files.keys()) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) fileSet.add(rest);
    else dirSet.add(rest.slice(0, slash));
  }
  return { files: [...fileSet].sort(), dirs: [...dirSet].sort() };
}

export function isDir(files: FileMap, path: string): boolean {
  const prefix = `${path}/`;
  for (const p of files.keys()) if (p.startsWith(prefix)) return true;
  return false;
}

/** Plain-text file tree, for prompts and logs. */
export function renderTree(paths: string[]): string {
  const root: Record<string, unknown> = {};
  for (const p of [...paths].sort()) {
    let node = root;
    for (const seg of p.split("/")) node = (node[seg] ??= {}) as Record<string, unknown>;
  }
  const lines: string[] = [];
  const go = (node: Record<string, unknown>, indent: string) => {
    const keys = Object.keys(node).sort((a, b) => {
      const ad = Object.keys(node[a] as object).length > 0 ? 0 : 1;
      const bd = Object.keys(node[b] as object).length > 0 ? 0 : 1;
      return ad - bd || a.localeCompare(b);
    });
    for (const k of keys) {
      const child = node[k] as Record<string, unknown>;
      const isDirNode = Object.keys(child).length > 0;
      lines.push(`${indent}${k}${isDirNode ? "/" : ""}`);
      if (isDirNode) go(child, indent + "  ");
    }
  };
  go(root, "");
  return lines.join("\n");
}

/** Line/column for a character offset, 1-based. */
export function lineColAt(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, col };
}

/** Best-effort line of a JSON key, for pointing diagnostics at property names. */
export function lineOfJsonKey(text: string, key: string, after = 0): number | undefined {
  const i = text.indexOf(JSON.stringify(key), after);
  return i < 0 ? undefined : lineColAt(text, i).line;
}

export function parseJsonWithPosition(text: string): { value?: unknown; error?: { message: string; line: number; col: number } } {
  try {
    return { value: JSON.parse(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const m = /position (\d+)/.exec(msg) ?? /line (\d+) column (\d+)/.exec(msg);
    if (m && m.length === 2) {
      const { line, col } = lineColAt(text, Number(m[1]));
      return { error: { message: msg.replace(/ in JSON at position \d+.*$/, ""), line, col } };
    }
    if (m && m.length === 3) return { error: { message: msg, line: Number(m[1]), col: Number(m[2]) } };
    return { error: { message: msg, line: 1, col: 1 } };
  }
}
