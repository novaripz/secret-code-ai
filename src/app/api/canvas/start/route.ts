import { NextRequest, NextResponse } from "next/server";
import { normalizeBaseUrl } from "@/lib/canvas/types";

// Begins Canvas OAuth.
//
// The state parameter is generated here, stored in an httpOnly cookie, and
// checked on the way back. Without it, anyone could hand a student a crafted
// callback URL and attach their own Canvas account to that student's Panda.
//
// The base URL travels in the same cookie because schools each run their own
// Canvas and the callback needs to know which one to exchange the code with.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const clientId = process.env.CANVAS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Canvas isn't set up yet. A Canvas admin needs to create a developer key, then set CANVAS_CLIENT_ID, CANVAS_CLIENT_SECRET and CANVAS_REDIRECT_URI.",
        needsSetup: true,
      },
      { status: 503 },
    );
  }

  const redirectUri = process.env.CANVAS_REDIRECT_URI;
  if (!redirectUri) {
    return NextResponse.json({ error: "CANVAS_REDIRECT_URI is not set." }, { status: 503 });
  }

  let baseUrl: string | null = null;
  try {
    const body = await req.json();
    baseUrl = normalizeBaseUrl(String(body?.baseUrl ?? ""));
  } catch {
    // Falls through to the error below.
  }

  if (!baseUrl) {
    return NextResponse.json(
      { error: "That doesn't look like a Canvas address. It usually ends in instructure.com." },
      { status: 400 },
    );
  }

  const state = crypto.randomUUID();

  const authorize = new URL("/login/oauth2/auth", baseUrl);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  // Read-only, and only what Panda actually shows: courses and assignments.
  // Asking for more than that would be asking a student to hand over more than
  // the feature needs.
  authorize.searchParams.set("scope", "url:GET|/api/v1/courses url:GET|/api/v1/users/self");

  const res = NextResponse.json({ url: authorize.toString() });
  res.cookies.set("canvas_oauth", JSON.stringify({ state, baseUrl }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
