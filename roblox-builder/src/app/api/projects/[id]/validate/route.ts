import { validateRobloxProject } from "@/core/roblox/validate";
import { branchOf, json, route, type Params } from "@/server/http";
import { getProject, readTree } from "@/server/store";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const files = await readTree(id, branchOf(req, meta.activeBranch));
  const r = validateRobloxProject(files);
  return json({ diagnostics: r.diagnostics, checks: r.checks, stats: r.stats, summary: r.summary, unmappedFiles: r.build.unmappedFiles });
});
