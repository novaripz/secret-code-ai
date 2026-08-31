import { NextRequest, NextResponse } from "next/server";

// Whether Canvas is connected, and whether it could be.
//
// Never returns the token — only what the UI needs to decide which screen to
// show.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const configured = Boolean(process.env.CANVAS_CLIENT_ID && process.env.CANVAS_CLIENT_SECRET);
  const raw = req.cookies.get("canvas_conn")?.value;

  if (!raw) return NextResponse.json({ configured, connected: false });

  try {
    const conn = JSON.parse(raw);
    return NextResponse.json({
      configured,
      connected: true,
      baseUrl: conn.baseUrl,
      userName: conn.userName,
      connectedAt: conn.connectedAt,
    });
  } catch {
    return NextResponse.json({ configured, connected: false });
  }
}
