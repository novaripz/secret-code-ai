import { looksBinary } from "@/core/project/types";
import { compareFileSets, diffLines, toHunks } from "@/core/versions/diff";
import { branchOf, json, route, type Params } from "@/server/http";
import { currentManifest, getBlob, getProject, getSnapshot } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Compare a snapshot with `against` (another snapshot id, or "current" for
 * the working tree). With `path`, also return that file's hunks.
 */
export const GET = route(async (req, { params }: Params<{ id: string; sid: string }>) => {
  const { id, sid } = await params;
  const meta = await getProject(id);
  const url = new URL(req.url);
  const against = url.searchParams.get("against") ?? "current";
  const path = url.searchParams.get("path");
  const base = (await getSnapshot(id, sid)).files;
  const other = against === "current" ? await currentManifest(id, branchOf(req, meta.activeBranch)) : (await getSnapshot(id, against)).files;
  const text = async (hash: string | undefined, p: string) => {
    if (!hash) return "";
    const bytes = await getBlob(hash);
    return looksBinary(p, bytes) ? undefined : new TextDecoder().decode(bytes);
  };
  const cache = new Map<string, string | undefined>();
  for (const p of new Set([...Object.keys(base), ...Object.keys(other)])) {
    if (base[p] === other[p]) continue;
    cache.set(`b:${p}`, await text(base[p], p));
    cache.set(`a:${p}`, await text(other[p], p));
  }
  const changes = compareFileSets(base, other, (side, p) => cache.get(`${side === "before" ? "b" : "a"}:${p}`));
  let hunks;
  if (path) {
    const a = cache.get(`b:${path}`);
    const b = cache.get(`a:${path}`);
    hunks = a === undefined || b === undefined ? null : toHunks(diffLines(a, b), 3);
  }
  return json({ changes, hunks });
});
