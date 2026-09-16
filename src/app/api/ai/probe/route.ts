import { NextResponse } from "next/server";
import { probeProviders } from "@/lib/ai/chain";

// Times each provider separately, so a slow chain can be blamed on the right one.
//
// The chain is deliberately opaque from outside: it tries providers in order and
// reports only the answer, so a student never learns whose model served them.
// That is right for students and useless for debugging — when a one-line edit
// takes thirty seconds, the question is WHICH provider spent them, and the
// ordinary path cannot say.
//
// `/api/ai/status` reports what one server instance remembers, and on serverless
// the instance that failed is rarely the instance answering, so its failure list
// reads empty exactly when it matters most. This asks all four directly instead.
//
// It costs four small model calls per run, so it is not something to poll.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const results = await probeProviders();
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
