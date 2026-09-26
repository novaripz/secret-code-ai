import { z } from "zod";
import { body, json, route, type Params } from "@/server/http";
import { createBranch, deleteBranch, getProject, listBranches } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  return json({ branches: await listBranches(id) });
});

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const input = await body(req, z.object({ name: z.string(), fromBranch: z.string().optional(), fromSnapshot: z.string().optional(), label: z.string().max(80).optional() }));
  const branch = await createBranch(id, input.name, input.fromSnapshot ? { snapshot: input.fromSnapshot } : { branch: input.fromBranch ?? meta.activeBranch }, { label: input.label });
  return json({ branch }, 201);
});

export const DELETE = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const name = new URL(req.url).searchParams.get("name") ?? "";
  await deleteBranch(id, name);
  return json({ ok: true });
});
