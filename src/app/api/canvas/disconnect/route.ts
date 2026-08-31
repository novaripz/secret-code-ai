import { NextResponse } from "next/server";

// Forgets the Canvas connection. Imported classes stay, because they are the
// student's work now — disconnecting an integration should not delete their
// homework list.

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("canvas_conn");
  res.cookies.delete("canvas_oauth");
  return res;
}
