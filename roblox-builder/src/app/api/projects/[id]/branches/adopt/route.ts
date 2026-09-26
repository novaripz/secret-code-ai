import { z } from "zod";
import { adoptBranch } from "@/server/agent/forge";
import { body, json, route, type Params } from "@/server/http";

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const { from, into } = await body(req, z.object({ from: z.string(), into: z.string() }));
  return json(await adoptBranch(id, from, into));
});
