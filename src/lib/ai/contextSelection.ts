import type { FileNode, Project } from "@/types";
import { listAllFiles } from "@/lib/fileSystem";
import { isAssetNode } from "@/lib/assets";
import { MAX_NOTES_CHARS, PROJECT_NOTES_PATH } from "./projectNotes";

const MAX_FILES = 12;

/**
 * The files a person would open first, in the order they would open them. Used
 * twice: to top up a selection that has room, and as the first resort when
 * nothing matched at all.
 */
const ENTRY_NAMES = ["index.html", "index.js", "index.ts", "main.py", "app.py", "package.json"];
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
  for (const name of ENTRY_NAMES) {
    if (picked.size >= MAX_FILES) break;
    const match = allFiles.find((f) => f.path === name);
    if (match) picked.set(match.path, match);
  }

  // If the project is small enough, just include everything — simpler and still cheap.
  if (allFiles.length <= MAX_FILES) {
    for (const f of allFiles) picked.set(f.path, f);
  }

  // NOTHING MATCHED. This is the hole the passes above leave.
  //
  // A project with more than MAX_FILES files, no file open in the editor, and a
  // prompt whose words happen to match no path — "make it look nicer", "why is
  // this broken", "add sound" — selected literally nothing. The model was sent
  // a file tree and asked to modify code it had never been shown, which is the
  // one situation the rules explicitly forbid it to guess its way out of. It
  // either refused or invented the file's contents.
  //
  // So when the honest answer is "no idea which files", send the ones any
  // reader would open first: the entry points, then the largest source files,
  // which in a project this size are where the code actually lives. A rough
  // guess that is usually right beats nothing, which is never right.
  if (picked.size === 0) {
    const byWeight = allFiles
      .filter((f) => f.kind === "file" && (f.content ?? "").trim().length > 0)
      .sort((a, b) => {
        const aEntry = ENTRY_NAMES.indexOf(a.path);
        const bEntry = ENTRY_NAMES.indexOf(b.path);
        // An entry point first, in the order ENTRY_NAMES lists them; everything
        // else by size, biggest first.
        if (aEntry !== -1 || bEntry !== -1) {
          if (aEntry === -1) return 1;
          if (bEntry === -1) return -1;
          return aEntry - bEntry;
        }
        return (b.content?.length ?? 0) - (a.content?.length ?? 0);
      });
    for (const f of byWeight) {
      if (picked.size >= MAX_FILES) break;
      picked.set(f.path, f);
    }
  }

  const result: Record<string, string> = {};
  let totalChars = 0;

  // PANDA.md first, and outside every budget below.
  //
  // It is the one file whose absence costs more than its size: without it a
  // model re-derives the project from source every turn, which is the expense
  // this whole selection exists to bound. It is also the shortest file here.
  // Counting it against MAX_FILES would mean a project with twelve source files
  // silently dropped its own brief, which is exactly backwards.
  const notes = allFiles.find((f) => f.path === PROJECT_NOTES_PATH);
  if (notes?.content?.trim()) {
    result[PROJECT_NOTES_PATH] = notes.content.slice(0, MAX_NOTES_CHARS);
    picked.delete(PROJECT_NOTES_PATH);
  }

  for (const f of picked.values()) {
    // AN ASSET NEVER CONTRIBUTES ITS CONTENT.
    //
    // An image's content is half a megabyte of base64. It means nothing to a
    // model, and MAX_CHARS_PER_FILE would still let 8000 characters of it
    // through — enough to evict the actual source files this selection exists
    // to choose between, on exactly the projects that have the most going on.
    // What the model needs in order to write <img src="..."> is the path, and
    // the path is already in the file tree. assetManifest() says the rest.
    if (isAssetNode(f)) continue;
    const content = (f.content ?? "").slice(0, MAX_CHARS_PER_FILE);
    if (totalChars + content.length > MAX_TOTAL_CHARS) break;
    result[f.path] = content;
    totalChars += content.length;
  }
  return result;
}
