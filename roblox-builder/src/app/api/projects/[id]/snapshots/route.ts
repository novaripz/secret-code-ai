import { z } from "zod";
import { body, branchOf, json, route, type Params } from "@/server/http";
import { createSnapshot, getProject, listSnapshots } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const meta = await getProject(id);
  return json({ snapshots: await listSnapshots(id, all ? undefined : branchOf(req, meta.activeBranch)) });
});

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const { label } = await body(req, z.object({ label: z.string().min(1).max(120) }));
  return json({ snapshot: await createSnapshot(id, branchOf(req, meta.activeBranch), { label, reason: "manual", force: true }) });
});
