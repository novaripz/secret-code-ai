import { NextRequest, NextResponse } from "next/server";
import { allowedCanvasBase, allowedCanvasBases } from "@/lib/canvas/types";
import { OAUTH_COOKIE } from "@/lib/canvas/server";

// Begins Canvas OAuth.
//
// The state parameter is generated here, stored in an httpOnly cookie, and
// checked on the way back. Without it, anyone could hand a student a crafted
// callback URL and attach their own Canvas account to that student's Panda.
//
// The base URL travels in the same cookie because schools each run their own
// Canvas and the callback needs to know which one to exchange the code with.
// It must be on the CANVAS_BASE_URLS allowlist: the callback sends this
// server's client secret to that host, so a host typed into a form is never
// enough on its own.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const clientId = process.env.CANVAS_CLIENT_ID;
  const allowed = allowedCanvasBases();
  if (!clientId || allowed.length === 0) {
    return NextResponse.json(
      {
        error:
          "Canvas isn't set up yet. A Canvas admin needs to create a developer key, then set CANVAS_CLIENT_ID, CANVAS_CLIENT_SECRET, CANVAS_REDIRECT_URI and CANVAS_BASE_URLS.",
        needsSetup: true,
      },
      { status: 503 },
    );
  }

  const redirectUri = process.env.CANVAS_REDIRECT_URI;
  if (!redirectUri) {
    return NextResponse.json({ error: "CANVAS_REDIRECT_URI is not set." }, { status: 503 });
  }

  let requested = "";
  try {
    const body = await req.json();
    requested = String(body?.baseUrl ?? "");
  } catch {
    // An empty body is fine when there is only one school to choose from.
  }

  // One allowed host is the common case, and then the student does not need to
  // know or type their school's Canvas address at all.
  const baseUrl = requested.trim() ? allowedCanvasBase(requested) : allowed.length === 1 ? allowed[0] : null;

  if (!baseUrl) {
    return NextResponse.json(
      {
        error: requested.trim()
          ? "Panda isn't set up for that Canvas address. Ask whoever runs Panda at your school to add it."
          : "Which Canvas does your school use? Pick it from the list.",
        allowed,
      },
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
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, baseUrl }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
