import { NextResponse } from "next/server";

// What each provider says it will actually serve this key.
//
// The probe route can tell you a model call failed. It cannot tell you what to
// put in its place, and guessing model ids from memory is how the chain ended up
// asking Groq for `llama-3.3-70b-versatile` months after that id stopped
// existing -- a 404 on every single request, indistinguishable from the app
// being broken.
//
// So this asks. Every provider here exposes an OpenAI-shaped /models endpoint
// that lists exactly what the presented key is allowed to call, which is the
// only authoritative answer: a model can exist, be documented, and still be
// closed to a particular account.
//
// Nothing from the key reaches the response. The key is sent to the provider in
// an Authorization header, as it is on every ordinary request, and what comes
// back is a list of ids.

export const runtime = "nodejs";
export const maxDuration = 30;

const SOURCES = [
  { provider: "groq", env: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/models" },
  { provider: "cerebras", env: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/models" },
  { provider: "nvidia", env: "NVIDIA_API_KEY", url: "https://integrate.api.nvidia.com/v1/models" },
] as const;

interface ModelList {
  provider: string;
  ok: boolean;
  count?: number;
  models?: string[];
  status?: number;
  error?: string;
}

async function list(source: (typeof SOURCES)[number]): Promise<ModelList> {
  const key = process.env[source.env] ?? "";
  if (!key) return { provider: source.provider, ok: false, error: `${source.env} is not set` };
  try {
    const res = await fetch(source.url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // The provider's own words, trimmed. They are the useful part of a 401 or
      // a 402 and they never echo the key back.
      return { provider: source.provider, ok: false, status: res.status, error: text.slice(0, 300) };
    }
    const parsed = JSON.parse(text) as { data?: Array<{ id?: string }> };
    const models = (parsed.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string")
      .sort();
    return { provider: source.provider, ok: true, count: models.length, models };
  } catch (err) {
    return {
      provider: source.provider,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const results = await Promise.all(SOURCES.map(list));
  return NextResponse.json(
    {
      results,
      // Gemini is deliberately absent: it answers through its own SDK rather
      // than an OpenAI-compatible endpoint, and its model id has not been the
      // thing that breaks.
      note: "Model ids this deployment's keys are allowed to call. Set GROQ_MODEL, CEREBRAS_MODEL or NVIDIA_MODEL to switch.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
