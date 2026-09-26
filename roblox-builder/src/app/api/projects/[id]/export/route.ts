import JSZip from "jszip";
import { findNodeByPath } from "@/core/roblox/hierarchyEdit";
import { writeRobloxXml } from "@/core/roblox/rbxmx";
import { buildDataModel } from "@/core/roblox/rojo";
import { branchOf, json, route, type Params } from "@/server/http";
import { getProject, readTree } from "@/server/store";

export const dynamic = "force-dynamic";

function safe(name: string): string {
  return name.replace(/[^\w.-]+/g, "_") || "export";
}

/**
 * Downloads: `zip` (the whole project, ready for `rojo serve`), `rbxlx` (a
 * place Studio opens directly), `rbxmx` (one instance subtree as a model).
 * With `check=1`, returns what the export would contain instead of the file.
 */
export const GET = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "zip";
  const branch = branchOf(req, meta.activeBranch);
  const files = await readTree(id, branch);

  if (format === "zip") {
    const zip = new JSZip();
    for (const [p, d] of files) zip.file(p, d);
    const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Response(new Uint8Array(data), {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${safe(meta.name)}.zip"` },
    });
  }
  if (format === "rbxlx" || format === "rbxmx") {
    const build = buildDataModel(files);
    const instance = url.searchParams.get("instance");
    const root = format === "rbxmx" ? (instance ? findNodeByPath(build.root, instance) : build.root.className === "DataModel" ? undefined : build.root) : build.root;
    if (!root) return json({ error: format === "rbxmx" ? "Pick an instance to export as a model" : "Nothing to export" }, 400);
    if (format === "rbxlx" && root.className !== "DataModel") return json({ error: "This project is a model, not a place; export it as .rbxmx" }, 400);
    const out = writeRobloxXml(root, { place: format === "rbxlx" });
    if (url.searchParams.get("check") === "1") {
      return json({ instances: out.instanceCount, bytes: out.xml.length, warnings: out.warnings, buildErrors: build.diagnostics.filter((d) => d.severity === "error").map((d) => d.message) });
    }
    const name = format === "rbxlx" ? `${safe(meta.name)}.rbxlx` : `${safe(root.name)}.rbxmx`;
    return new Response(out.xml, { headers: { "content-type": "application/xml", "content-disposition": `attachment; filename="${name}"` } });
  }
  return json({ error: `Unknown format ${format}` }, 400);
});
