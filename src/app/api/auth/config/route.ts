import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/apiGuard";

// Hands the browser what it needs to start a sign-in, at runtime.
//
// Neither value here is a secret. An OAuth client ID ships in the page source
// of every "Sign in with Google" button on the web, and a Supabase anon key is
// sent by every browser that talks to a Supabase project — row-level security,
// not secrecy, is what guards the data behind it. Serving them from here rather
// than inlining them at build time means each one is a single server-side
// variable instead of a public copy and a private copy of the same string.

export const runtime = "nodejs";

// Public by design — see above — so there is no auth here and there must not
// be: the sign-in screen fetches this before anyone has a token. It is still
// rate limited per IP, because "public" and "free to hammer" are different
// things and every call reads env and allocates a response. The ceiling is
// high enough that a page reload storm never notices it.
const CONFIG_RULE = { limit: 60, windowMs: 60_000 };

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, {
    route: "auth-config",
    user: CONFIG_RULE,
    guest: CONFIG_RULE,
    busyMessage: "Panda is being asked for this too often right now. Reload in a moment.",
    // Never look at the Authorization header: this is what you call *before*
    // you have a token, and verifying one here would be pure latency.
    authenticate: false,
  });
  if (!guard.ok) return guard.response;

  const url = process.env.SUPABASE_URL;
  // Supabase renamed the anon key to the "publishable key" and the dashboard
  // now shows only the new name, so accept either rather than making anyone
  // work out that the two are the same string.
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

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
