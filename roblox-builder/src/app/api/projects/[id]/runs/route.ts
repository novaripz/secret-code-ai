import { listRuns } from "@/server/agent/runs";
import { json, route, type Params } from "@/server/http";
import { getProject, listRunRecords } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  await getProject(id);
  const live = listRuns(id);
  const records = (await listRunRecords(id, 30)) as { runId: string }[];
  const liveIds = new Set(live.map((r) => r.runId));
  const past = records.filter((r) => !liveIds.has(r.runId)).map((r) => {
    const { events: _e, ...rest } = r as { events?: unknown };
    void _e;
    return rest;
  });
  return json({ runs: [...live, ...past] });
});
