import { z } from "zod";
import { body, json, route, type Params } from "@/server/http";
import { deleteProject, getProject, listBranches, updateProject } from "@/server/store";

export const GET = route(async (_req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  return json({ project: await getProject(id), branches: await listBranches(id) });
});

export const PATCH = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const patch = await body(
    req,
    z.object({
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(4000).optional(),
      activeBranch: z.string().optional(),
      settings: z
        .object({
          robloxUniverseId: z.string().regex(/^\d*$/).optional(),
          robloxPlaceId: z.string().regex(/^\d*$/).optional(),
          robloxCreatorUserId: z.string().regex(/^\d*$/).optional(),
          robloxCreatorGroupId: z.string().regex(/^\d*$/).optional(),
          autoApproveDestructive: z.boolean().optional(),
          assetUnits: z.enum(["studs", "meters"]).optional(),
          assetFormats: z.array(z.enum(["glb", "gltf", "obj"])).optional(),
        })
        .optional(),
    }),
  );
  return json({ project: await updateProject(id, patch) });
});

export const DELETE = route(async (_req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  await deleteProject(id);
  return json({ ok: true });
});
