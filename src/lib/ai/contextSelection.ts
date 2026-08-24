import type { FileNode, Project } from "@/types";
import { listAllFiles } from "@/lib/fileSystem";

const MAX_FILES = 12;
const MAX_CHARS_PER_FILE = 8000;
const MAX_TOTAL_CHARS = 40000;

/** Very small import-reference scanner for JS/TS/HTML/CSS so we can pull in related files. */
function extractReferencedPaths(file: FileNode): string[] {
  if (!file.content) return [];
  const refs = new Set<string>();
  const importRe = /(?:from\s+|require\(|import\()\s*["']([^"']+)["']/g;
  const hrefRe = /(?:href|src)\s*=\s*["']([^"']+)["']/g;
  const cssImportRe = /@import\s+["']([^"']+)["']/g;
  for (const re of [importRe, hrefRe, cssImportRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content))) {
      const ref = m[1];
      if (ref.startsWith(".") || !ref.includes("://")) refs.add(ref);
    }
  }
  return [...refs];
}

function resolveRelative(fromPath: string, ref: string): string | undefined {
  if (!ref.startsWith(".")) return undefined;
  const fromDir = fromPath.split("/").slice(0, -1);
  const parts = ref.split("/");
  const stack = [...fromDir];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

/**
 * Picks a bounded, relevant subset of project files to send to the AI instead
 * of the entire project: the current file, files it references, files whose
 * name/content look relevant to the prompt, and always the file tree (sent separately).
 */
export function selectContextFiles(
  project: Project,
  opts: { currentFilePath?: string; prompt: string }
): Record<string, string> {
  const allFiles = listAllFiles(project);
  const picked = new Map<string, FileNode>();

  const currentFile = opts.currentFilePath
    ? allFiles.find((f) => f.path === opts.currentFilePath)
    : undefined;

  if (currentFile) {
    picked.set(currentFile.path, currentFile);
    for (const ref of extractReferencedPaths(currentFile)) {
      const resolved = resolveRelative(currentFile.path, ref);
      const candidates = resolved
        ? allFiles.filter((f) => f.path === resolved || f.path.startsWith(`${resolved}.`))
        : allFiles.filter((f) => f.path.endsWith(ref));
      for (const c of candidates) picked.set(c.path, c);
    }
  }

  // Keyword relevance: score files whose path/name matches words in the prompt.
  const words = opts.prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  const scored = allFiles
    .filter((f) => !picked.has(f.path))
    .map((f) => {
      const lowerPath = f.path.toLowerCase();
      const score = words.reduce((acc, w) => (lowerPath.includes(w) ? acc + 1 : acc), 0);
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { f } of scored) {
    if (picked.size >= MAX_FILES) break;
    picked.set(f.path, f);
  }

  // Always include entry-point-ish files if there's room, since the AI often needs them.
  const entryNames = ["index.html", "index.js", "index.ts", "main.py", "app.py", "package.json"];
  for (const name of entryNames) {
    if (picked.size >= MAX_FILES) break;
    const match = allFiles.find((f) => f.path === name);
    if (match) picked.set(match.path, match);
  }

  // If the project is small enough, just include everything — simpler and still cheap.
  if (allFiles.length <= MAX_FILES) {
    for (const f of allFiles) picked.set(f.path, f);
  }

  const result: Record<string, string> = {};
  let totalChars = 0;
  for (const f of picked.values()) {
    const content = (f.content ?? "").slice(0, MAX_CHARS_PER_FILE);
    if (totalChars + content.length > MAX_TOTAL_CHARS) break;
    result[f.path] = content;
    totalChars += content.length;
  }
  return result;
}
