import { NextResponse } from "next/server";

import { lastProviderFailures, providerCooldowns } from "@/lib/ai/provider";

// Which AI providers this deployment can actually reach.
//
// A provider chain fails quietly by design: if Groq is missing, requests slide
// to the next one and nobody notices until the last provider in the line runs
// out too, which is exactly how a classroom finds out mid-lesson. This says
// plainly which keys are present so a missing one is visible before it matters.
//
// It also reports which providers are currently benched after saying they were
// out of quota, and until when, so the thing a class actually feels -- messages
// getting slower through the period as more of the chain is skipped -- is
// answerable from a URL instead of from a guess. Read that number honestly: the
// cooldowns live in one server instance's memory, so this is what THIS instance
// has learned, not a fleet-wide truth, and a cold start shows an empty list
// while other instances are still skipping.
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

  const now = Date.now();
  const cooling = Object.entries(providerCooldowns()).map(([provider, cooldown]) => ({
    provider,
    until: new Date(cooldown.until).toISOString(),
    secondsLeft: Math.max(1, Math.round((cooldown.until - now) / 1000)),
    reason: cooldown.reason,
    status: cooldown.status,
    // "retry-after" means the provider named this interval; the others are ours.
    source: cooldown.source,
  }));

  const failures = Object.entries(lastProviderFailures()).map(([provider, failure]) => ({
    provider,
    at: new Date(failure.at).toISOString(),
    status: failure.status,
    reason: failure.reason,
  }));

  return NextResponse.json(
    {
      providersConfigured: live,
      // One provider is one bad day away from an outage: the free tiers here
      // are small enough that a single class can exhaust one in a period.
      healthy: live >= 2,
      order: "groq, cerebras, nvidia, gemini",
      providers: configured,
      // Per-instance and forgotten on a cold start -- see the note above.
      coolingDown: cooling,
      // Never skipped on account of a cooldown alone: if every provider is
      // benched the chain tries them anyway rather than answering nobody.
      allCoolingDown: cooling.length > 0 && cooling.length >= live,
      lastFailures: failures,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
