import { NextResponse } from "next/server";
import { z } from "zod";
import { authEnabled, createSessionToken, passwordMatches, SESSION_COOKIE } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const POST = route(async (req) => {
  if (!authEnabled()) return json({ ok: true });
  const { password } = await body(req, z.object({ password: z.string().max(500) }));
  if (!passwordMatches(password)) {
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: "Wrong password" }, 401);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), { httpOnly: true, sameSite: "lax", secure: req.url.startsWith("https"), path: "/", maxAge: 7 * 24 * 3600 });
  return res;
});
