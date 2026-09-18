import type { FileNode, Project } from "@/types";
import { listAllFiles } from "@/lib/fileSystem";

// Real assets: images, audio, video, fonts.
//
// A project used to be text and nothing else. FileNode.content is a string, the
// preview is built as a srcdoc iframe with no server behind it, and the context
// selector reads content straight into the prompt — so a student who wanted a
// picture in their game had three separate walls to hit and no way over any of
// them. They got a coloured <div> and a comment saying "put your image here",
// which is the placeholder-rectangle habit this is meant to end.
//
// HOW A BINARY FILE IS STORED, and why it is still a string.
//
// `content` holds a complete data URL — "data:image/png;base64,iVBOR…" — and
// `mimeType` records what it is. Storing base64 in the same field the text
// files use is deliberate: every path that already reads, saves, copies,
// renames, versions, diffs and exports a file keeps working untouched, and
// IndexedDB stores the string without a second schema. A Blob column would have
// been tidier in isolation and would have meant auditing every one of those
// paths for a type they had never seen.
//
// The cost is honest and bounded: base64 is a third larger than the bytes, and
// a data URL cannot be streamed. Both are fine for the thing a student actually
// does — a sprite, a button click sound, a background photo — and both are why
// MAX_ASSET_BYTES exists below rather than letting someone drop a 40MB video
// into a browser database and discover the limit as a crash.

/** What each stored asset costs before base64 inflates it by about a third. */
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

/** Everything one project may hold, so a class cannot fill a school laptop's disk. */
export const MAX_PROJECT_ASSET_BYTES = 16 * 1024 * 1024;

/**
 * Extensions we will accept and the type we stamp on them.
 *
 * An allow-list rather than "anything the file picker returns". The preview
 * inlines these into a sandboxed document, and the set of things that can be
 * inlined safely is small and known — a picture cannot execute, and an .html or
 * .js dropped in as an "asset" could. Those are text files and belong on the
 * ordinary path, where the editor shows the student what they are running.
 */
const ASSET_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

export type AssetFamily = "image" | "audio" | "video" | "font";

export function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The MIME type for a path we are willing to store as an asset, or undefined. */
export function assetMimeType(path: string): string | undefined {
  return ASSET_TYPES[extensionOf(path)];
}

export function familyOf(mimeType: string | undefined): AssetFamily | undefined {
  if (!mimeType) return undefined;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("font/")) return "font";
  return undefined;
}

/**
 * Is this node stored as a data URL rather than as source text?
 *
 * Checked on the CONTENT, not on the name. A file called logo.png whose content
 * is not a data URL is text that happens to be misnamed, and treating it as an
 * asset would hand the preview a broken src and the editor a blob it refuses to
 * show. The name only decides what a NEW file becomes; from then on the content
 * is the truth.
 */
export function isAssetNode(node: Pick<FileNode, "content" | "mimeType">): boolean {
  return typeof node.content === "string" && node.content.startsWith("data:");
}

/**
 * A URL that will actually load this file, for either kind of asset.
 *
 * SVG is the awkward one and it is awkward for a good reason: it is TEXT, so a
 * generated or hand-written .svg is stored as markup like any other source file
 * — editable, diffable, a few hundred bytes — and isAssetNode() correctly says
 * it is not a data-URL asset. But the preview still has to turn
 * `<img src="art/star.svg">` into something an iframe with no server can load.
 *
 * This was found by rendering the output in a browser rather than reading it:
 * every generated shape came back BROKEN because the preview only inlined files
 * whose content already began with "data:". Encoding here keeps the file text
 * on disk and makes it loadable at the point of use.
 *
 * encodeURIComponent rather than base64: an SVG is text, the result stays
 * readable in the generated document, and it avoids a base64 round trip on
 * every preview rebuild. The "#" must be escaped by hand because it is legal in
 * SVG markup and terminates a data URL.
 */
export function assetContentUrl(node: Pick<FileNode, "content" | "mimeType" | "path">): string | undefined {
  const content = node.content;
  if (typeof content !== "string" || content.length === 0) return undefined;
  if (content.startsWith("data:")) return content;
  if (extensionOf(node.path ?? "") === "svg") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  }
  return undefined;
}

/** Bytes an asset really occupies, derived from its base64 length. */
export function assetByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** "12 KB", "1.4 MB" — for a student, not for a log. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AssetEntry {
  path: string;
  mimeType: string;
  family: AssetFamily | undefined;
  bytes: number;
}

/** Every asset in the project, for the explorer, the export and the prompt. */
export function listAssets(project: Project): AssetEntry[] {
  return listAllFiles(project)
    // A text .svg counts: it is referenceable exactly like a stored asset, and
    // leaving it off the manifest would mean the model generated a star and
    // then did not know it had one.
    .filter((f) => f.kind === "file" && (isAssetNode(f) || extensionOf(f.path) === "svg"))
    .map((f) => ({
      path: f.path,
      mimeType: f.mimeType ?? assetMimeType(f.path) ?? "application/octet-stream",
      family: familyOf(f.mimeType ?? assetMimeType(f.path)),
      bytes: isAssetNode(f) ? assetByteSize(f.content ?? "") : (f.content ?? "").length,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function totalAssetBytes(project: Project): number {
  return listAssets(project).reduce((sum, a) => sum + a.bytes, 0);
}

/**
 * The asset list as the model sees it.
 *
 * This exists because of the specific way assets would otherwise break a turn:
 * the context selector reads file content into the prompt, and an asset's
 * content is half a megabyte of base64 that means nothing to a model and would
 * evict every real source file from the budget. So an asset never contributes
 * its content — it contributes one line saying it exists, what it is and how
 * big it is, which is all anything needs in order to write `<img src="…">`
 * against it.
 */
export function assetManifest(project: Project): string {
  const assets = listAssets(project);
  if (assets.length === 0) return "";
  const lines = assets.map((a) => `- ${a.path} (${a.family ?? a.mimeType}, ${humanSize(a.bytes)})`);
  return (
    `The project contains these real assets. Reference them by path exactly as written — ` +
    `they load in the preview. Never invent an asset path that is not on this list.\n${lines.join("\n")}`
  );
}
