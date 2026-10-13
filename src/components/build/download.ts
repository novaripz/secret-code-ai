"use client";

// Handing a file to the student's own computer.

/**
 * Saves a Blob through a temporary link.
 *
 * The object URL is let go a little later, not on the next line: revoking it
 * straight after `click()` raced the download in some browsers, which then
 * saved an empty or failed file — the student pressed Download and got
 * nothing, with no error to say why.
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A stored file as the bytes it stands for.
 *
 * A picture or a sound is kept as a data URL. Saving that TEXT as
 * "text/plain" — which is what Download used to do — produced cat.png
 * containing the characters "data:image/png;base64,iVBOR…", a file no image
 * viewer would open. The data URL is decoded back into real bytes, with the
 * real type, before it leaves.
 */
export function fileBlob(content: string, mimeType?: string): Blob {
  if (content.startsWith("data:")) {
    const comma = content.indexOf(",");
    const header = content.slice(5, comma);
    const body = content.slice(comma + 1);
    const type = mimeType || header.split(";")[0] || "application/octet-stream";
    if (/;base64/i.test(header)) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(body)], { type });
  }
  return new Blob([content], { type: `${mimeType || "text/plain"};charset=utf-8` });
}

/** A name that is safe as a file name on every system a school has. */
export function safeFileName(name: string, fallback = "project"): string {
  return name.replace(/[^a-z0-9-_ ]+/gi, "_").trim() || fallback;
}
