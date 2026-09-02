import { NextResponse } from "next/server";

// Hands the browser what it needs to start a sign-in, at runtime.
//
// Neither value here is a secret. An OAuth client ID ships in the page source
// of every "Sign in with Google" button on the web, and a Supabase anon key is
// sent by every browser that talks to a Supabase project — row-level security,
// not secrecy, is what guards the data behind it. Serving them from here rather
// than inlining them at build time means each one is a single server-side
// variable instead of a public copy and a private copy of the same string.

export const runtime = "nodejs";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  return NextResponse.json(
    {
      clientId: process.env.GOOGLE_CLIENT_ID ?? null,
      supabase: url && anonKey ? { url, anonKey } : null,
    },
    // These only change when the deployment does, but a stale cache here would
    // strand sign-in, so let the browser re-ask.
    { headers: { "Cache-Control": "no-store" } },
  );
}
