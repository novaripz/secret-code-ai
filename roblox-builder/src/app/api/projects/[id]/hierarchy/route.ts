import { z } from "zod";
import { applyHierarchyOps, type HierarchyOp } from "@/core/roblox/hierarchyEdit";
import { body, branchOf, json, route, type Params } from "@/server/http";
import { applyFileMap, getProject, readTree } from "@/server/store";

const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), parent: z.string(), className: z.string(), name: z.string(), properties: z.record(z.string(), z.unknown()).optional(), children: z.array(z.record(z.string(), z.unknown())).optional() }),
  z.object({ op: z.literal("set"), path: z.string(), properties: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("remove"), path: z.string() }),
  z.object({ op: z.literal("rename"), path: z.string(), name: z.string() }),
  z.object({ op: z.literal("move"), path: z.string(), newParent: z.string() }),
]);

export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  const { ops } = await body(req, z.object({ ops: z.array(op).min(1).max(100) }));
  const files = await readTree(id, branch);
  const res = applyHierarchyOps(files, ops as HierarchyOp[]);
  const changed = await applyFileMap(id, branch, res.files);
  return json({ changed, summary: res.summary });
});
