import { z } from "zod";
import { body, json, route } from "@/server/http";
import { createProject, listProjects } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ projects: await listProjects() }));

export const POST = route(async (req) => {
  const input = await body(
    req,
    z.object({
      name: z.string().min(1).max(80),
      kind: z.enum(["roblox-experience", "roblox-ui", "roblox-system", "roblox-plugin", "roblox-asset", "web-app"]),
      description: z.string().max(4000).optional(),
    }),
  );
  return json({ project: await createProject(input) }, 201);
});
