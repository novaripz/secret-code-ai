import { NextRequest, NextResponse } from "next/server";
import { allowedCanvasBases } from "@/lib/canvas/types";
import { readConnection } from "@/lib/canvas/server";

// Whether Canvas is connected, and whether it could be.
//
// Never returns the token — only what the UI needs to decide which screen to
// show. The allowed hosts are not a secret (they are the school's public
// Canvas address), and a connect screen needs them to offer a choice.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const allowed = allowedCanvasBases();
  const configured = Boolean(process.env.CANVAS_CLIENT_ID && process.env.CANVAS_CLIENT_SECRET && allowed.length > 0);
  // readConnection drops a cookie whose host has since left the allowlist, so
  // "connected" here always means "connected to somewhere we will still call".
  const conn = readConnection(req);
  if (!conn) return NextResponse.json({ configured, allowed, connected: false });

  return NextResponse.json({
    configured,
    allowed,
    connected: true,
    baseUrl: conn.baseUrl,
    userName: conn.userName,
    connectedAt: conn.connectedAt,
  });
}
