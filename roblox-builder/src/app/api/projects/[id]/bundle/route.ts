import { branchOf, json, route, type Params } from "@/server/http";
import { getProject, readTree } from "@/server/store";

export const dynamic = "force-dynamic";

const MAX_BINARY = 8 * 1024 * 1024;

/** Every file's content, for the client-side hierarchy, previews and 3D viewport. */
export const GET = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const tree = await readTree(id, branchOf(req, meta.activeBranch));
  const files: Record<string, { text?: string; base64?: string; size: number; binary: boolean }> = {};
  for (const [p, d] of tree) {
    if (typeof d === "string") files[p] = { text: d, size: d.length, binary: false };
    else files[p] = { base64: d.length <= MAX_BINARY ? Buffer.from(d).toString("base64") : undefined, size: d.length, binary: true };
  }
  return json({ files });
});
