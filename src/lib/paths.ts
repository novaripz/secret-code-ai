// Path helpers + strict validation. All AI- and user-supplied paths must go through here.

/** Normalizes a path: forward slashes, no leading/trailing slash, collapses "." segments. */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg.length > 0 && seg !== ".")
    .join("/");
}

const INVALID_CHARS = /[<>:"|?*]/;

/**
 * Validates a project-relative path is safe: no traversal, no absolute paths,
 * no empty segments, no reserved characters. Throws on violation.
 */
export function assertSafePath(path: string): string {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new Error("Path must be a non-empty string.");
  }
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`Absolute paths are not allowed: "${path}"`);
  }
  const normalized = normalizePath(path);
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`Path traversal is not allowed: "${path}"`);
    }
    if (seg.length === 0) {
      throw new Error(`Path contains an empty segment: "${path}"`);
    }
    if (INVALID_CHARS.test(seg)) {
      throw new Error(`Path contains invalid characters: "${path}"`);
    }
  }
  if (normalized.length === 0) {
    throw new Error("Path resolves to empty.");
  }
  return normalized;
}

export function fileName(path: string): string {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1];
}

export function parentPath(path: string): string {
  const parts = normalizePath(path).split("/");
  parts.pop();
  return parts.join("/");
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.join("/"));
}

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  py: "python",
  java: "java",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  h: "cpp",
  hpp: "cpp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sh: "shell",
  bash: "shell",
  txt: "plaintext",
  swift: "swift",
  kt: "kotlin",
};

export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}
