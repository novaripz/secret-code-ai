// Small helpers shared by the API routes.

import { NextResponse } from "next/server";
import { z } from "zod";
import { StoreError } from "./store";
import { CommandRejected } from "./exec";
import { HierarchyEditError } from "@/core/roblox/hierarchyEdit";

export function json(data: unknown, init?: number | ResponseInit): NextResponse {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof StoreError) return json({ error: err.message }, err.status);
  if (err instanceof z.ZodError) return json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  if (err instanceof CommandRejected || err instanceof HierarchyEditError) return json({ error: err.message }, 400);
  if (err instanceof SyntaxError) return json({ error: `Invalid JSON body: ${err.message}` }, 400);
  if (err instanceof Error && /Path|path/.test(err.message) && /not allowed|may not|Invalid character|empty/.test(err.message)) {
    return json({ error: err.message }, 400);
  }
  console.error("[api]", err);
  return json({ error: err instanceof Error ? err.message : String(err) }, 500);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const data = await req.json();
  return schema.parse(data);
}

export function branchOf(req: Request, fallback: string): string {
  return new URL(req.url).searchParams.get("branch") || fallback;
}

export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  // The headless browser runs on this machine; talk to ourselves over loopback.
  const port = host.split(":")[1] ?? (proto === "https" ? "443" : "80");
  return process.env.INTERNAL_ORIGIN || `http://127.0.0.1:${port}`;
}

export type Params<T extends Record<string, string | string[]>> = { params: Promise<T> };
