import { NextResponse } from "next/server";

// Which AI providers this deployment can actually reach.
//
// A provider chain fails quietly by design: if Groq is missing, requests slide
// to the next one and nobody notices until the last provider in the line runs
// out too, which is exactly how a classroom finds out mid-lesson. This says
// plainly which keys are present so a missing one is visible before it matters.
//
// It reports presence and length, never any part of a key. Length alone catches
// the common mistakes -- a truncated paste, a stray quote, an empty string left
// behind by a deleted variable -- without printing anything worth stealing.

export const runtime = "nodejs";

const PROVIDERS = [
  { name: "groq", env: "GROQ_API_KEY", note: "fastest, tried first" },
  { name: "cerebras", env: "CEREBRAS_API_KEY", note: "highest daily volume" },
  { name: "nvidia", env: "NVIDIA_API_KEY", note: "reads images" },
  { name: "gemini", env: "GEMINI_API_KEY", note: "last resort" },
] as const;

export async function GET() {
  const configured = PROVIDERS.map((p) => {
    const value = process.env[p.env] ?? "";
    return {
      provider: p.name,
      variable: p.env,
      set: value.length > 0,
      length: value.length,
      note: p.note,
    };
  });

  const live = configured.filter((p) => p.set).length;

  return NextResponse.json(
    {
      providersConfigured: live,
      // One provider is one bad day away from an outage: the free tiers here
      // are small enough that a single class can exhaust one in a period.
      healthy: live >= 2,
      order: "groq, cerebras, nvidia, gemini",
      providers: configured,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
