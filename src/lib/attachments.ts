"use client";

import { captureTabScreenshot, readFileAsImage } from "./tabCapture";

// Anything the user drops, pastes, picks, or screenshots on their way into a
// message. Images go to the model as images; text-ish files (code, notes,
// homework) go as text so they can be quoted and edited.

export type AttachmentKind = "image" | "text";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** Bytes of the original file, for display. */
  size: number;
  /** kind === "image" */
  dataUrl?: string;
  base64?: string;
  mimeType?: string;
  /** kind === "text" */
  text?: string;
}

/** Image types the API route accepts. Anything else gets converted to PNG. */
const MODEL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "html", "htm", "css", "js", "jsx", "ts", "tsx", "json",
  "csv", "xml", "yml", "yaml", "py", "java", "c", "cpp", "cs", "rb", "go", "rs",
  "sh", "sql", "svg", "log", "env",
]);

const MAX_TEXT_CHARS = 100_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSIONS.has(extensionOf(file.name));
}

/** Re-encodes an image the model can't read (HEIC, GIF, BMP…) into a PNG. */
async function toSupportedImage(file: File): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  const raw = await readFileAsImage(file);
  if (MODEL_IMAGE_TYPES.has(raw.mimeType)) return raw;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`Couldn't read "${file.name}".`);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, base64: dataUrl.split(",")[1] ?? "", mimeType: "image/png" };
}

/** Turns one dropped/picked file into an attachment, or throws with a readable reason. */
export async function attachmentFromFile(file: File): Promise<Attachment> {
  if (file.type.startsWith("image/")) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`"${file.name}" is too big to send (over 12MB).`);
    }
    const image = await toSupportedImage(file);
    return { id: newId(), kind: "image", name: file.name, size: file.size, ...image };
  }

  if (isTextFile(file)) {
    const text = await file.text();
    return {
      id: newId(),
      kind: "text",
      name: file.name,
      size: file.size,
      text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…(truncated)` : text,
    };
  }

  throw new Error(`I can't read "${file.name}" yet — try an image, or a text/code file.`);
}

/** Converts a whole drop/paste at once, keeping what worked and reporting what didn't. */
export async function attachmentsFromFiles(
  files: Iterable<File>,
): Promise<{ attachments: Attachment[]; errors: string[] }> {
  const attachments: Attachment[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      attachments.push(await attachmentFromFile(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Couldn't read "${file.name}".`);
    }
  }
  return { attachments, errors };
}

/** Grabs one frame of whatever the user picks in the browser's share prompt. */
export async function screenshotAttachment(): Promise<Attachment> {
  const shot = await captureTabScreenshot();
  return {
    id: newId(),
    kind: "image",
    name: "Screenshot",
    size: shot.base64.length,
    dataUrl: shot.dataUrl,
    base64: shot.base64,
    mimeType: shot.mimeType,
  };
}

/** Text attachments are folded into the prompt; images ride along separately. */
export function attachmentsToPromptText(attachments: Attachment[]): string {
  const textFiles = attachments.filter((a) => a.kind === "text" && a.text);
  if (textFiles.length === 0) return "";
  return textFiles.map((a) => `--- ATTACHED FILE: ${a.name} ---\n${a.text}`).join("\n\n");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
