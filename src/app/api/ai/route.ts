import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { validateOperations } from "@/lib/ai/validateOperations";
import type { AiMessage } from "@/lib/ai/provider";

export const runtime = "nodejs";

interface RequestBody {
  prompt: string;
  fileTree: string;
  contextFiles: Record<string, string>;
  history?: AiMessage[];
}

function isRequestBody(x: unknown): x is RequestBody {
  if (typeof x !== "object" || x === null) return false;
  const b = x as Record<string, unknown>;
  return typeof b.prompt === "string" && typeof b.fileTree === "string";
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
