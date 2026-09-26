import { z } from "zod";
import { body, json, route, type Params } from "@/server/http";
import { getMemory, getProject, setMemory } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  await getProject(id);
  return json({ memory: await getMemory(id) });
});

const list = z.array(z.string().max(500)).max(200);
export const PUT = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  await getProject(id);
  const memory = await body(
    req,
    z.object({
      goals: list,
      architecture: list,
      designSystem: list,
      preferences: list,
      knownBugs: list,
      notes: list,
      decisions: z.array(z.object({ at: z.number(), text: z.string().max(500) })).max(500),
    }),
  );
  return json({ memory: await setMemory(id, memory) });
});
