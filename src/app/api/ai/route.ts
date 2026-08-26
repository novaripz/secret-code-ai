import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { validateOperations } from "@/lib/ai/validateOperations";
import type { AiMessage, ImageAttachment } from "@/lib/ai/provider";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";

const EXPLAIN_DEPTHS = new Set<ExplainDepth>(["minimal", "fair", "normal", "extra", "overload"]);

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BASE64_CHARS = 8_000_000; // ~6MB decoded, generous for a tab screenshot

const MAX_IMAGES = 4;

interface RequestBody {
  prompt: string;
  fileTree: string;
  contextFiles: Record<string, string>;
  history?: AiMessage[];
  explainMode?: boolean;
  explainDepth?: ExplainDepth;
  humanize?: boolean;
  aiHomie?: boolean;
  chatOnly?: boolean;
  projectMemory?: string;
  studentProfile?: string;
  image?: ImageAttachment;
  images?: ImageAttachment[];
  /** Ask for the reply as a text stream instead of one buffered JSON payload. */
  stream?: boolean;
}

function isRequestBody(x: unknown): x is RequestBody {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  // fileTree is only meaningful when a project is open; plain chat omits it.
  return typeof b.prompt === "string" && (typeof b.fileTree === "string" || b.chatOnly === true);
}

function sanitizeImages(images: unknown): ImageAttachment[] {
  if (!Array.isArray(images)) return [];
  return images
    .map(sanitizeImage)
    .filter((i): i is ImageAttachment => i !== undefined)
    .slice(0, MAX_IMAGES);
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
  // Generous, because attached text/code files are folded into the prompt.
  if (body.prompt.length > 400_000) {
    return NextResponse.json({ error: "That's too much text to send at once." }, { status: 400 });
  }

  const request = {
    prompt: body.prompt,
    fileTree: body.fileTree ?? "",
    contextFiles: body.contextFiles ?? {},
    history: Array.isArray(body.history) ? body.history.slice(-20) : [],
    explainMode: body.explainMode === true,
    explainDepth:
      body.explainDepth && EXPLAIN_DEPTHS.has(body.explainDepth) ? body.explainDepth : "normal",
    humanize: body.humanize === true,
    aiHomie: body.aiHomie === true,
    chatOnly: body.chatOnly === true,
    projectMemory: typeof body.projectMemory === "string" ? body.projectMemory.slice(0, 4000) : undefined,
    studentProfile: typeof body.studentProfile === "string" ? body.studentProfile.slice(0, 2000) : undefined,
    image: sanitizeImage(body.image),
    images: sanitizeImages(body.images),
  };

  // Streaming only applies to plain chat. A project turn answers in JSON, which
  // is unparseable until the last brace arrives, so there is nothing to show
  // early and it stays on the buffered path.
  if (body.stream === true && request.chatOnly) {
    try {
      const provider = getAiProvider();
      const chunks = provider.generateStream(request);
      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
          } catch (err) {
            // The response has already begun, so the status line is spent.
            // Send the failure inline; the client surfaces whatever arrived
            // plus this note rather than silently truncating.
            console.error("[api/ai] stream failed mid-flight:", err);
            const message = err instanceof Error ? err.message : "The reply stopped early.";
            controller.enqueue(encoder.encode(`\n\n[stream error] ${message}`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      console.error("[api/ai] stream failed to start:", err);
      const message = err instanceof Error ? err.message : "AI request failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const provider = getAiProvider();
    const response = await provider.generate(request);

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
