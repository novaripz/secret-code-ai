import { NextRequest, NextResponse } from "next/server";
import { allowedCanvasBase } from "@/lib/canvas/types";
import { CONNECTION_COOKIE, OAUTH_COOKIE, exchangeCode, writeConnection } from "@/lib/canvas/server";

// The other half of Canvas OAuth.
//
// Canvas redirects the student's browser here with a code. The code is
// exchanged for a token server-side, so the client secret never leaves the
// server and the token never passes through the page.
//
// The state is compared against the cookie set when the flow started. A
// mismatch means the request did not come from a flow this server began, and
// it is refused rather than investigated. The base URL in that cookie is
// checked against the allowlist again before the exchange, because the
// exchange is the request that carries the client secret.

export const runtime = "nodejs";

function fail(reason: string) {
  // Errors come back on the connect screen rather than as raw JSON, because a
  // student who declined a permission prompt should land somewhere that makes
  // sense, not on a wall of text.
  const res = NextResponse.redirect(
    new URL(`/settings?canvas=error&reason=${encodeURIComponent(reason)}`, process.env.CANVAS_REDIRECT_URI ?? "http://localhost:3000"),
  );
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error");

  if (denied) return fail("You didn't give Panda permission, so nothing was connected.");
  if (!code || !state) return fail("Canvas didn't send back what we expected.");

  const raw = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!raw) return fail("That connection attempt expired. Start again.");

  let saved: { state?: string; baseUrl?: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("That connection attempt was malformed. Start again.");
  }

  if (!saved.state || saved.state !== state || !saved.baseUrl) {
    return fail("That connection didn't start here, so it was refused.");
  }

  const baseUrl = allowedCanvasBase(saved.baseUrl);
  if (!baseUrl) return fail("Panda isn't set up for that Canvas address, so nothing was sent to it.");

  const redirectUri = process.env.CANVAS_REDIRECT_URI;
  if (!process.env.CANVAS_CLIENT_ID || !process.env.CANVAS_CLIENT_SECRET || !redirectUri) {
    return fail("Canvas isn't configured on the server.");
  }

  try {
    const conn = await exchangeCode(baseUrl, code);
    const res = NextResponse.redirect(new URL("/settings?canvas=connected", redirectUri));
    writeConnection(res, conn);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch {
    const res = fail("Panda couldn't finish connecting to your school's Canvas.");
    res.cookies.delete(CONNECTION_COOKIE);
    return res;
  }
}
