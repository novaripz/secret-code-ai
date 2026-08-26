import { NextResponse } from "next/server";

// Hands the browser the Google client ID at runtime.
//
// An OAuth client ID is public by design — it ships in the page source of
// every "Sign in with Google" button on the web, and there is no client secret
// in this flow. But serving it from here rather than inlining it at build time
// means the whole setup is one server-side variable instead of a public one
// and a private one holding the same string.

export const runtime = "nodejs";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? null;
  return NextResponse.json(
    { clientId },
    // The value only changes when the deployment does, but a stale cache here
    // would strand sign-in, so let the browser re-ask.
    { headers: { "Cache-Control": "no-store" } },
  );
}
