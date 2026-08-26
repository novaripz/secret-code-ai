import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";

// Verifies a Google sign-in.
//
// The browser gets an ID token from Google and posts it here. We never trust
// that token as-is: it is verified against Google's public keys, and the
// account details we hand back come out of the verified payload rather than
// out of anything the client claimed. A forged token fails here.
//
// Setup: create an OAuth 2.0 Client ID (type: Web application) in Google Cloud
// Console, add your site to "Authorized JavaScript origins", then set both
// GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID to it.

export const runtime = "nodejs";

export interface Account {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in isn't set up yet. Add GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID." },
      { status: 503 },
    );
  }

  let credential: unknown;
  try {
    credential = (await req.json())?.credential;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof credential !== "string" || credential.length === 0) {
    return NextResponse.json({ error: "Missing sign-in token." }, { status: 400 });
  }

  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub) {
      return NextResponse.json({ error: "That sign-in couldn't be verified." }, { status: 401 });
    }

    const account: Account = {
      id: payload.sub,
      name: payload.name ?? payload.given_name ?? "",
      email: payload.email ?? "",
      picture: payload.picture,
    };

    return NextResponse.json({ account });
  } catch (err) {
    console.error("[api/auth/google] verification failed:", err);
    return NextResponse.json({ error: "That sign-in couldn't be verified." }, { status: 401 });
  }
}
