import { z } from "zod";
import { body, branchOf, json, route, type Params } from "@/server/http";
import { getProject, renameFile } from "@/server/store";

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const { from, to } = await body(req, z.object({ from: z.string(), to: z.string() }));
  return json({ path: await renameFile(id, branchOf(req, meta.activeBranch), from, to) });
});
