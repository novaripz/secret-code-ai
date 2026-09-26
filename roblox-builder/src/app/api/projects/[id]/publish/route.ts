import { z } from "zod";
import { writeRobloxXml } from "@/core/roblox/rbxmx";
import { buildDataModel } from "@/core/roblox/rojo";
import { validateRobloxProject } from "@/core/roblox/validate";
import { body, branchOf, json, route, type Params } from "@/server/http";
import { cloudConfigured, publishPlace, uploadAsset } from "@/server/robloxCloud";
import { getProject, readFile, readTree } from "@/server/store";

export const maxDuration = 120;

/** Publishing through Roblox Open Cloud. Success is reported only when Roblox confirms it. */
export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  if (!cloudConfigured()) return json({ ok: false, error: "ROBLOX_OPEN_CLOUD_API_KEY is not set on the server. Add it to .env.local and restart." }, 400);
  const input = await body(
    req,
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("place"), versionType: z.enum(["Published", "Saved"]), force: z.boolean().optional() }),
      z.object({ type: z.literal("asset"), path: z.string(), assetType: z.enum(["Model", "Decal", "Audio"]), displayName: z.string().min(1).max(50), description: z.string().max(1000).optional() }),
    ]),
  );
  if (input.type === "place") {
    const { robloxUniverseId, robloxPlaceId } = meta.settings;
    if (!robloxUniverseId || !robloxPlaceId) return json({ ok: false, error: "Set the universe id and place id in project settings" }, 400);
    const files = await readTree(id, branch);
    const report = validateRobloxProject(files);
    if (report.summary.error && !input.force) {
      return json({ ok: false, error: `The compatibility check has ${report.summary.error} error(s). Fix them first, or publish anyway.`, errors: report.summary.error }, 409);
    }
    const build = buildDataModel(files);
    const xml = writeRobloxXml(build.root, { place: true });
    const r = await publishPlace(robloxUniverseId, robloxPlaceId, xml.xml, input.versionType);
    return json(r, r.ok ? 200 : 502);
  }
  const f = await readFile(id, branch, input.path);
  const data = typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data;
  const r = await uploadAsset({
    assetType: input.assetType,
    fileName: f.path.split("/").pop() ?? "asset",
    data,
    displayName: input.displayName,
    description: input.description ?? "",
    creator: { userId: meta.settings.robloxCreatorUserId, groupId: meta.settings.robloxCreatorGroupId },
  });
  return json(r, r.ok ? 200 : 502);
});
