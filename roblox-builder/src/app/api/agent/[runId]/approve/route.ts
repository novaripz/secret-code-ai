import { z } from "zod";
import { resolveApproval } from "@/server/agent/runs";
import { body, json, route, type Params } from "@/server/http";

export const POST = route(async (req, { params }: Params<{ runId: string }>) => {
  const { runId } = await params;
  const { approvalId, approved } = await body(req, z.object({ approvalId: z.string(), approved: z.boolean() }));
  const ok = resolveApproval(runId, approvalId, approved);
  return json({ ok }, ok ? 200 : 404);
});
