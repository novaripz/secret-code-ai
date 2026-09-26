import { inspectMeshFile } from "@/core/assets/gltf";
import { validateMeshInspection } from "@/core/assets/validate";
import { normalizePath } from "@/core/project/files";
import { branchOf, json, route, type Params } from "@/server/http";
import { getProject, listFiles, writeFile } from "@/server/store";

const ALLOWED = /\.(glb|gltf|obj|mtl|fbx|png|jpe?g|tga|bmp|rbxm|rbxmx|ogg|mp3|wav)$/i;

/** Import an asset file (multipart), store it under assets/imported/, and inspect it. */
export const POST = route(async (req, { params }: Params<{ id: string }>) => {
  const { id } = await params;
  const meta = await getProject(id);
  const branch = branchOf(req, meta.activeBranch);
  const form = await req.formData();
  const results = [];
  for (const entry of form.getAll("file")) {
    if (!(entry instanceof File)) continue;
    if (!ALLOWED.test(entry.name)) {
      results.push({ name: entry.name, error: "Unsupported file type" });
      continue;
    }
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const target = /\.(rbxm|rbxmx)$/i.test(entry.name) ? `src/assets/${entry.name}` : `assets/imported/${entry.name}`;
    const path = await writeFile(id, branch, normalizePath(target), bytes);
    let inspection;
    let diagnostics;
    if (/\.(glb|gltf|obj|fbx)$/i.test(entry.name)) {
      inspection = inspectMeshFile(path, bytes);
      const siblings = new Set((await listFiles(id, branch)).map((f) => f.path));
      diagnostics = validateMeshInspection(path, inspection, siblings);
    }
    results.push({ name: entry.name, path, inspection, diagnostics });
  }
  return json({ results });
});
