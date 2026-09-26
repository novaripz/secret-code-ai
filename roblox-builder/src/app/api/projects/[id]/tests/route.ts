import { branchOf, json, originOf, route, type Params } from "@/server/http";
import { getProject } from "@/server/store";
import { runProjectTests } from "@/server/testing";

export const maxDuration = 600;

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const report = await runProjectTests(id, branchOf(req, meta.activeBranch), { origin: originOf(req), signal: req.signal });
  return json({ report: { ...report, screenshotPath: undefined, hasScreenshot: !!report.screenshotPath } });
});
