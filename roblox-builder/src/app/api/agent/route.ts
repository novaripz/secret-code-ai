import { z } from "zod";
import { startRun } from "@/server/agent/runs";
import { body, json, originOf, route } from "@/server/http";
import { getProject } from "@/server/store";

export const POST = route(async (req) => {
  const input = await body(
    req,
    z.object({
      projectId: z.string(),
      branch: z.string().optional(),
      prompt: z.string().min(1).max(20000),
      mode: z.enum(["chat", "autopilot"]),
      focus: z.object({ file: z.string().optional(), instance: z.string().optional() }).optional(),
    }),
  );
  const meta = await getProject(input.projectId);
  const run = await startRun({ ...input, branch: input.branch ?? meta.activeBranch, origin: originOf(req) });
  return json({ runId: run.id, summary: run.summary }, 202);
});
