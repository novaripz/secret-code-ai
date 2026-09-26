import { promises as fs } from "node:fs";
import path from "node:path";
import { branchOf, route, type Params } from "@/server/http";
import { DATA_DIR, getProject } from "@/server/store";

export const dynamic = "force-dynamic";

/** The screenshot from the last browser smoke test of this branch. */
export const GET = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch).replace(/[^\w.-]/g, "");
  const file = path.join(DATA_DIR, "screens", `${id}-${branch}.png`);
  const data = await fs.readFile(file).catch(() => undefined);
  if (!data) return new Response("No screenshot yet", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
});
