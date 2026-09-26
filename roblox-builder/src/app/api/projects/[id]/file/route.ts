import { z } from "zod";
import { body, branchOf, json, route, type Params } from "@/server/http";
import { deleteFile, getProject, readFile, writeFile } from "@/server/store";

export const dynamic = "force-dynamic";

function pathOf(req: Request): string {
  const p = new URL(req.url).searchParams.get("path");
  if (!p) throw new z.ZodError([{ code: "custom", path: ["path"], message: "path is required", input: undefined }]);
  return p;
}

export const GET = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const f = await readFile(id, branchOf(req, meta.activeBranch), pathOf(req));
  if (new URL(req.url).searchParams.get("raw") === "1") {
    const data = typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data;
    return new Response(new Uint8Array(data), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${f.path.split("/").pop()}"` } });
  }
  return json(f.binary ? { path: f.path, binary: true, base64: Buffer.from(f.data as Uint8Array).toString("base64") } : { path: f.path, binary: false, content: f.data });
});

export const PUT = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const input = await body(req, z.object({ path: z.string(), content: z.string(), encoding: z.enum(["utf8", "base64"]).optional() }));
  const data = input.encoding === "base64" ? new Uint8Array(Buffer.from(input.content, "base64")) : input.content;
  const p = await writeFile(id, branchOf(req, meta.activeBranch), input.path, data);
  return json({ path: p });
});

export const DELETE = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  await deleteFile(id, branchOf(req, meta.activeBranch), pathOf(req));
  return json({ ok: true });
});
