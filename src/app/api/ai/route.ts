import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { validateOperations } from "@/lib/ai/validateOperations";
import type { AiMessage, ImageAttachment } from "@/lib/ai/provider";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB decoded, generous for a tab screenshot

interface RequestBody {
  prompt: string;
  fileTree: string;
  contextFiles: Record<string, string>;
  history?: AiMessage[];
  explainMode?: boolean;
  projectMemory?: string;
  studentProfile?: string;
  image?: ImageAttachment;
}

function isRequestBody(x: unknown): x is RequestBody {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  return typeof b.prompt === "string" && typeof b.fileTree === "string";
}

function sanitizeImage(image: unknown): ImageAttachment | undefined {
  if (!image || typeof image !== "object") return undefined;
  const img = image as Record<string, unknown>;
  if (typeof img.data !== "string" || typeof img.mimeType !== "string") return undefined;
  if (!ALLOWED_IMAGE_TYPES.has(img.mimeType)) return undefined;
  if (img.data.length === 0 || img.data.length > MAX_IMAGE_BASE64_CHARS) return undefined;
  // Reject anything that isn't plain base64 (defense in depth — no data: URI, no path-like content).
  if (!/^[A-Za-z0-9+/=]+$/.test(img.data)) return undefined;
  return { data: img.data, mimeType: img.mimeType };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRequestBody(body)) {
    return NextResponse.json({ error: "Missing required fields: prompt, fileTree." }, { status: 400 });
  }

  if (body.prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt must not be empty." }, { status: 400 });
  }
  if (body.prompt.length > 20000) {
    return NextResponse.json({ error: "Prompt is too long." }, { status: 400 });
  }

  try {
    const provider = getAiProvider();
    const response = await provider.generate({
      prompt: body.prompt,
      fileTree: body.fileTree,
      contextFiles: body.contextFiles ?? {},
      history: Array.isArray(body.history) ? body.history.slice(-20) : [],
      explainMode: body.explainMode === true,
      projectMemory: typeof body.projectMemory === "string" ? body.projectMemory.slice(0, 4000) : undefined,
      studentProfile: typeof body.studentProfile === "string" ? body.studentProfile.slice(0, 2000) : undefined,
      image: sanitizeImage(body.image),
    });

    // Validate/sanitize operations server-side too, so a malformed model
    // response can never smuggle an unsafe path past the client.
    const { valid, errors } = validateOperations(response.operations);

    return NextResponse.json({
      operations: valid,
      message: response.message,
      openFiles: response.openFiles,
      operationErrors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[api/ai] generation failed:", err);
    const message = err instanceof Error ? err.message : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
