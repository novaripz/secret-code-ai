import { z } from "zod";
import { runAssetPipeline } from "@/core/assets/pipeline";
import { body, branchOf, json, route, type Params } from "@/server/http";
import { createSnapshot, getProject, writeFile } from "@/server/store";

/** Run the asset pipeline on a spec (from the asset panel's spec editor) and write its outputs. */
export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  const input = await body(req, z.object({ spec: z.unknown(), formats: z.array(z.enum(["glb", "gltf", "obj"])).optional(), dryRun: z.boolean().optional() }));
  const r = runAssetPipeline(input.spec, { formats: input.formats ?? meta.settings.assetFormats ?? ["glb"], units: meta.settings.assetUnits ?? "studs" });
  if (r.ok && !input.dryRun) {
    await createSnapshot(id, branch, { label: `Before asset ${r.spec?.name}`, reason: "edit" });
    for (const [p, d] of Object.entries(r.files)) await writeFile(id, branch, p, d);
  }
  return json({ ok: r.ok, steps: r.steps, diagnostics: r.diagnostics, files: Object.keys(r.files), robloxPath: r.robloxPath, stats: r.stats });
});
