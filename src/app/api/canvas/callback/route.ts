import { NextRequest, NextResponse } from "next/server";

// The other half of Canvas OAuth.
//
// Canvas redirects the student's browser here with a code. The code is
// exchanged for a token server-side, so the client secret never leaves the
// server and the token never passes through the page.
//
// The state is compared against the cookie set when the flow started. A
// mismatch means the request did not come from a flow this server began, and
// it is refused rather than investigated.

export const runtime = "nodejs";

function fail(reason: string) {
  // Errors come back on the connect screen rather than as raw JSON, because a
  // student who declined a permission prompt should land somewhere that makes
  // sense, not on a wall of text.
  return NextResponse.redirect(
    new URL(`/settings?canvas=error&reason=${encodeURIComponent(reason)}`, process.env.CANVAS_REDIRECT_URI ?? "http://localhost:3000"),
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error");

  if (denied) return fail("You didn't give Panda permission, so nothing was connected.");
  if (!code || !state) return fail("Canvas didn't send back what we expected.");

  const raw = req.cookies.get("canvas_oauth")?.value;
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

  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;
  const redirectUri = process.env.CANVAS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return fail("Canvas isn't configured on the server.");

  try {
    const tokenRes = await fetch(new URL("/login/oauth2/token", saved.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.access_token) {
      return fail("Canvas wouldn't complete the connection.");
    }

    // The token goes into an httpOnly cookie rather than to the page, so a
    // script on the page can never read it.
    const res = NextResponse.redirect(new URL("/settings?canvas=connected", redirectUri));
    res.cookies.set(
      "canvas_conn",
      JSON.stringify({
        baseUrl: saved.baseUrl,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        userName: data.user?.name,
        connectedAt: Date.now(),
      }),
      { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 },
    );
    res.cookies.delete("canvas_oauth");
    return res;
  } catch {
    return fail("Panda couldn't reach your school's Canvas.");
  }
}
