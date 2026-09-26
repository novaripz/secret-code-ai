// Asset validation: the checks that catch an asset that will look wrong or
// behave wrong once it is in Roblox, before anyone imports it.

import type { Diagnostic } from "../diagnostics";
import type { MeshInspection } from "./gltf";
import type { BuiltAsset } from "./mesh";
import type { AssetCategory, AssetSpec } from "./spec";

/** Plausible overall height, in studs, per category. A Roblox R15 character is ~5.5 studs tall. */
export const EXPECTED_HEIGHT: Record<AssetCategory, [number, number]> = {
  prop: [0.2, 40],
  building: [6, 600],
  environment: [2, 2048],
  furniture: [0.5, 14],
  vehicle: [2, 60],
  tool: [0.2, 8],
  creature: [0.5, 80],
  character: [2.5, 14],
  decoration: [0.1, 60],
  kit: [0.2, 100],
  gameplay: [0.2, 200],
};

/** Roblox's triangle limit for a single imported mesh. */
export const MAX_TRIANGLES_PER_MESH = 20000;

export function validateAsset(spec: AssetSpec, built: BuiltAsset, file?: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (rule: string, severity: Diagnostic["severity"], message: string) =>
    out.push({ rule, severity, category: "asset", message: `${spec.name}: ${message}`, file });

  const size = [0, 1, 2].map((i) => built.bounds.max[i] - built.bounds.min[i]);
  const [lo, hi] = EXPECTED_HEIGHT[spec.category];
  if (size[1] < lo || size[1] > hi) {
    add(
      "asset/scale",
      "warning",
      `is ${size[1].toFixed(2)} studs tall, outside the usual ${lo}–${hi} studs for a ${spec.category} (a player is about 5.5 studs). Check units: 1 stud ≈ 0.28 m.`,
    );
  }
  if (size.some((s) => s > 2048)) add("asset/too-large", "error", "is larger than 2048 studs on one axis");

  if (spec.front !== "-Z") {
    add("asset/orientation", "warning", `faces ${spec.front}; Roblox models face -Z (LookVector). It will appear turned in game.`);
  }

  const grounded = Math.abs(built.bounds.min[1] - built.pivot[1]) < 1e-3;
  if (!spec.pivot && !grounded) {
    add("asset/pivot", "info", "pivot is not at the base");
  }
  const floor = built.bounds.min[1];
  if (Math.abs(floor) > 0.05 && spec.category !== "kit") {
    add(
      "asset/grounding",
      "info",
      `its lowest point is at y=${floor.toFixed(2)}; the exported pivot is moved to the base, so it sits on whatever it is placed on.`,
    );
  }

  const names = new Map<string, number>();
  spec.parts.forEach((p, i) => {
    const key = `${p.group ?? ""}/${p.name}`;
    names.set(key, (names.get(key) ?? 0) + 1);
    if (p.size.some((s) => s > 2048)) add("asset/part-too-large", "error", `part "${p.name}" exceeds 2048 studs on one axis`);
    if (p.size.some((s) => s < 0.001)) add("asset/part-tiny", "error", `part "${p.name}" is thinner than 0.001 studs`);
    if (p.shape === "sphere" && new Set(p.size.map((s) => s.toFixed(3))).size > 1) {
      add("asset/ball-size", "info", `part "${p.name}" is a ball with unequal size; Roblox uses the smallest component (${Math.min(...p.size)}) as the diameter`);
    }
    if (p.shape === "cylinder" && Math.abs(p.size[1] - p.size[2]) > 1e-3) {
      add("asset/cylinder-size", "info", `part "${p.name}" is a cylinder: Size.X is its length and min(Size.Y, Size.Z) its diameter`);
    }
    for (let j = 0; j < i; j++) {
      const q = spec.parts[j];
      if (q.shape === p.shape && q.size.every((s, k) => Math.abs(s - p.size[k]) < 1e-4) && q.position.every((s, k) => Math.abs(s - p.position[k]) < 1e-4)) {
        add("asset/duplicate-part", "warning", `parts "${q.name}" and "${p.name}" occupy exactly the same space (z-fighting)`);
        break;
      }
    }
  });
  for (const [key, n] of names) {
    if (n > 1) add("asset/duplicate-name", "info", `${n} parts are named "${key.split("/")[1]}" in the same group; scripts can only find one by name`);
  }
  if (spec.parts.length > 500) {
    add("asset/part-count", "warning", `has ${spec.parts.length} parts; consider a MeshPart (export the GLB) for anything placed many times`);
  }
  const unanchored = spec.parts.filter((p) => !p.anchored).length;
  if (unanchored && unanchored < spec.parts.length) {
    add("asset/mixed-anchoring", "info", `${unanchored} of ${spec.parts.length} parts are unanchored; they are welded to the primary part`);
  }
  if (built.triangles > MAX_TRIANGLES_PER_MESH) {
    add("asset/triangles", "warning", `the merged mesh has ${built.triangles} triangles, over Roblox's ${MAX_TRIANGLES_PER_MESH} per-mesh import limit; import the GLB per part (it keeps parts as separate meshes) rather than merged`);
  }
  if (spec.parts.some((p) => p.texture)) {
    add(
      "asset/textures",
      "info",
      "has procedural textures. They are embedded in the GLB/glTF; the Roblox model uses the matching Roblox material instead, since Roblox textures must be uploaded before they can be referenced.",
    );
  }
  return out;
}

/** Findings for a mesh file the user imported. */
export function validateMeshInspection(name: string, r: MeshInspection, siblings: Set<string>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const add = (rule: string, severity: Diagnostic["severity"], message: string) =>
    out.push({ rule, severity, category: "asset", message: `${name}: ${message}`, file: name });
  if (!r.ok) {
    add("asset/malformed", "error", r.error ?? "could not be read");
    return out;
  }
  if (r.maxTrianglesPerMesh > MAX_TRIANGLES_PER_MESH) {
    add("asset/triangles", "error", `has a mesh with ${r.maxTrianglesPerMesh} triangles; Roblox rejects meshes over ${MAX_TRIANGLES_PER_MESH}. Decimate it or split it.`);
  }
  const dir = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
  for (const ref of r.externalImages) {
    if (!siblings.has(dir + ref) && !siblings.has(ref)) {
      add("asset/missing-file", "error", `references "${ref}", which is not in the project; the importer will load it without that file`);
    }
  }
  if (r.extent !== undefined) {
    if (r.extent > 2048) add("asset/scale", "warning", `is ${r.extent.toFixed(1)} units across; if the file is in centimetres, import with File Dimensions set to Centimeter`);
    if (r.extent < 0.05) add("asset/scale", "warning", `is only ${r.extent.toFixed(3)} units across; if the file is in metres, set File Dimensions to Meter when importing`);
  }
  if (r.skins > 0) add("asset/skinned", "info", "is skinned; import it with Rig General settings in the 3D Importer");
  if (r.animations > 0) add("asset/animations", "info", `contains ${r.animations} animation(s); upload them through the Animation Editor after import`);
  if (r.format === "obj" && r.materials === 0) add("asset/no-materials", "info", "has no materials; it will import grey");
  return out;
}
