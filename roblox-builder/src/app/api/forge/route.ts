import { z } from "zod";
import { startForge } from "@/server/agent/forge";
import { body, json, originOf, route } from "@/server/http";

export const maxDuration = 120;

export const POST = route(async (req) => {
  const input = await body(
    req,
    z.object({
      projectId: z.string(),
      prompt: z.string().min(1).max(20000),
      count: z.number().int().min(2).max(5),
      directions: z.array(z.object({ label: z.string().min(1).max(40), brief: z.string().min(1).max(400) })).max(5).optional(),
    }),
  );
  return json(await startForge({ ...input, origin: originOf(req) }), 202);
});
