import { z } from "zod";
import { applyRepairs, planRepairs } from "@/core/roblox/repair";
import { validateRobloxProject } from "@/core/roblox/validate";
import { branchOf, json, route, type Params } from "@/server/http";
import { applyFileMap, createSnapshot, getProject, readTree } from "@/server/store";

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  const input = z.object({ rules: z.array(z.string()).optional(), dryRun: z.boolean().optional() }).parse(await req.json().catch(() => ({})));
  const files = await readTree(id, branch);
  const report = validateRobloxProject(files);
  let plan = planRepairs(files, report);
  if (input.rules?.length) plan = plan.filter((a) => input.rules!.includes(a.rule));
  if (input.dryRun) return json({ plan: plan.map((a) => ({ rule: a.rule, description: a.description })) });
  if (!plan.length) return json({ applied: [], failed: [], changed: [], summary: report.summary });
  await createSnapshot(id, branch, { label: "Before auto-repair", reason: "repair" });
  const res = applyRepairs(files, plan);
  const changed = await applyFileMap(id, branch, res.files);
  const after = validateRobloxProject(res.files);
  return json({
    applied: res.applied.map((a) => a.description),
    failed: res.failed.map((f) => `${f.action.description}: ${f.reason}`),
    changed,
    summary: after.summary,
  });
});
