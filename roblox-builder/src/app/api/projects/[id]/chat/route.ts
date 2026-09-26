import { branchOf, json, route, type Params } from "@/server/http";
import { getChat, getProject } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  return json({ messages: await getChat(id, branchOf(req, meta.activeBranch)) });
});
