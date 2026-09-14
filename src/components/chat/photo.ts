"use client";

// Getting a phone photo down to a size the request can actually carry.
//
// A homework photo off a modern phone is 3000-4000px wide and three to eight
// megabytes of JPEG. Base64 inflates that by a third on the way into the JSON
// body, and the AI route refuses anything over 12MB total (see
// MAX_AI_BODY_BYTES) — so a single unresized photo can fail the request
// outright, and two of them always will. Worse, the failure would land on the
// student as "that's more than Panda can take", which reads like their
// homework was too hard a question.
//
// So we shrink before the file ever reaches the attachment pipeline. The
// output is still a File, handed to the same `ingest` path as a dropped or
// pasted image, because a second image pipeline is a second place for image
// bugs to live.
//
// 1600px on the long edge is the number. It is above what any of the vision
// models we route through actually consume (they tile to ~1024-1568), so this
// is not throwing away detail the model would have used, and it keeps
// handwriting legible — the whole point of the feature. JPEG at 0.82 lands a
// typical page of maths at 200-500KB, which leaves room for a second photo and
// a long conversation in the same request.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
/** Below this, resizing costs more than it saves — send what they took. */
const SKIP_BELOW_BYTES = 600_000;

/**
 * Downscales an image File, returning the original if it is already small or
 * if anything about the canvas path fails.
 *
 * Failing open is deliberate: a photo that is slightly too big is a problem
 * the route will report honestly, but a photo that vanishes because
 * `createImageBitmap` choked on some phone's HEIC-in-a-JPEG-wrapper is a
 * feature that looks broken. The attachment pipeline re-encodes odd formats
 * anyway.
 */
export async function downscalePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
