import { cancelRun } from "@/server/agent/runs";
import { json, route, type Params } from "@/server/http";

export const POST = route(async (_req, { params }: Params<{ runId: string }>) => {
  const { runId } = await params;
  return json({ ok: cancelRun(runId) });
});
