import { z } from "zod";
import { branchOf, json, route, type Params } from "@/server/http";
import { getProject, restoreSnapshot } from "@/server/store";
import { snapshotFileMap, readFile, writeFile, deleteFile } from "@/server/store";

/** Restore a whole snapshot, or (with `paths`) just those files from it. */
export const POST = route(async (req, { params }: Params<{ id: string; sid: string }>) => {
  const { id, sid } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  const { paths } = z.object({ paths: z.array(z.string()).optional() }).parse(await req.json().catch(() => ({})));
  if (!paths?.length) return json(await restoreSnapshot(id, branch, sid));
  const snap = await snapshotFileMap(id, sid);
  for (const p of paths) {
    const data = snap.get(p);
    if (data !== undefined) await writeFile(id, branch, p, data);
    else await readFile(id, branch, p).then(() => deleteFile(id, branch, p), () => undefined);
  }
  return json({ changed: paths });
});
