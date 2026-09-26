// The asset pipeline: spec in, validated project files out.
//
//   1. parse the spec           5. prepare textures
//   2. inspect (build meshes)   6. package the Roblox model
//   3. optimize                 7. write metadata
//   4. validate                 8. export source formats
//
// Every file lands in a place that says what it is: Roblox models under
// src/assets (synced by Rojo), 3D source exports under assets/source,
// textures under assets/textures, and the spec itself under assets/specs so
// the asset can be regenerated after an edit.

import type { Diagnostic } from "../diagnostics";
import { writeGlb, writeGltf, type GltfOptions } from "./gltf";
import { buildAsset } from "./mesh";
import { writeObj } from "./obj";
import { patternTexture } from "./png";
import { hexToRgb, parseAssetSpec, type AssetSpec } from "./spec";
import { assetToRobloxModel } from "./toRoblox";
import { validateAsset } from "./validate";

export type ExportFormat = "glb" | "gltf" | "obj";

export interface PipelineOptions {
  formats?: ExportFormat[];
  units?: GltfOptions["units"];
}

export interface PipelineStep {
  step: "parse" | "inspect" | "optimize" | "validate" | "textures" | "package" | "metadata" | "export";
  ok: boolean;
  detail: string;
}

export interface PipelineResult {
  ok: boolean;
  spec?: AssetSpec;
  steps: PipelineStep[];
  files: Record<string, string | Uint8Array>;
  diagnostics: Diagnostic[];
  robloxPath?: string;
  stats?: { parts: number; triangles: number; materials: number; size: [number, number, number] };
}

/** Removes exact duplicate parts and rounds noise; returns what it changed. */
export function optimizeSpec(spec: AssetSpec): { spec: AssetSpec; notes: string[] } {
  const notes: string[] = [];
  const seen = new Set<string>();
  const parts = spec.parts.filter((p) => {
    const key = JSON.stringify([p.shape, p.size, p.position, p.rotation ?? [0, 0, 0], p.color, p.material, p.transparency]);
    if (seen.has(key)) {
      notes.push(`removed duplicate part "${p.name}"`);
      return false;
    }
    seen.add(key);
    return true;
  });
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  const cleaned = parts.map((p) => ({
    ...p,
    size: p.size.map(r) as [number, number, number],
    position: p.position.map(r) as [number, number, number],
    rotation: p.rotation?.map(r) as [number, number, number] | undefined,
  }));
  return { spec: { ...spec, parts: cleaned }, notes };
}

export function runAssetPipeline(input: unknown, options: PipelineOptions = {}): PipelineResult {
  const formats = options.formats ?? ["glb"];
  const units = options.units ?? "studs";
  const steps: PipelineStep[] = [];
  const files: Record<string, string | Uint8Array> = {};

  const parsed = parseAssetSpec(input);
  if (!parsed.spec) {
    steps.push({ step: "parse", ok: false, detail: parsed.errors.join("; ") });
    return {
      ok: false,
      steps,
      files,
      diagnostics: parsed.errors.map((m) => ({ rule: "asset/spec", severity: "error", category: "asset", message: m })),
    };
  }
  steps.push({ step: "parse", ok: true, detail: `${parsed.spec.parts.length} parts` });

  const { spec, notes } = optimizeSpec(parsed.spec);
  let built = buildAsset(spec);
  steps.push({
    step: "inspect",
    ok: true,
    detail: `${built.triangles} triangles, ${built.bounds.max.map((m, i) => (m - built.bounds.min[i]).toFixed(2)).join(" × ")} studs`,
  });
  steps.push({ step: "optimize", ok: true, detail: notes.length ? notes.join("; ") : "nothing to optimize" });
  built = buildAsset(spec);

  const diagnostics = validateAsset(spec, built, `assets/specs/${spec.name}.spec.json`);
  const errors = diagnostics.filter((d) => d.severity === "error");
  steps.push({
    step: "validate",
    ok: errors.length === 0,
    detail: `${errors.length} errors, ${diagnostics.filter((d) => d.severity === "warning").length} warnings`,
  });
  if (errors.length) return { ok: false, spec, steps, files, diagnostics };

  const textured = spec.parts.filter((p) => p.texture);
  const texKeys = new Set<string>();
  for (const p of textured) {
    const key = `${p.texture!.pattern}_${String(p.color).replace("#", "")}`;
    if (texKeys.has(key)) continue;
    texKeys.add(key);
    const c1 = hexToRgb(p.color);
    const c2 = p.texture!.color2 ? hexToRgb(p.texture!.color2) : (c1.map((c) => c * 0.7) as [number, number, number]);
    files[`assets/textures/${spec.name}_${key}.png`] = patternTexture(p.texture!.pattern, c1, c2);
  }
  steps.push({ step: "textures", ok: true, detail: texKeys.size ? `${texKeys.size} texture(s)` : "no textures" });

  const roblox = assetToRobloxModel(spec, built);
  const { Name: _drop, ...modelFile } = roblox.model;
  void _drop;
  files[`src/assets/${spec.name}.model.json`] = JSON.stringify(modelFile, null, 2) + "\n";
  steps.push({ step: "package", ok: true, detail: `Roblox model at ${roblox.robloxPath} (PrimaryPart ${roblox.primaryPart})` });

  const size = [0, 1, 2].map((i) => Math.round((built.bounds.max[i] - built.bounds.min[i]) * 1000) / 1000) as [number, number, number];
  const materials = new Set(spec.parts.map((p) => `${p.material}|${p.color}|${p.transparency}`)).size;
  const exported = formats.flatMap((f) => (f === "obj" ? [`assets/source/${spec.name}.obj`, `assets/source/${spec.name}.mtl`] : [`assets/source/${spec.name}.${f}`]));
  const metadata = {
    name: spec.name,
    category: spec.category,
    description: spec.description ?? "",
    units,
    upAxis: "+Y",
    front: spec.front,
    pivot: "bottom centre of bounds",
    sizeStuds: size,
    parts: spec.parts.length,
    triangles: built.triangles,
    materials,
    roblox: {
      model: `src/assets/${spec.name}.model.json`,
      path: roblox.robloxPath,
      primaryPart: roblox.primaryPart,
      usage: `local asset = game:GetService("ReplicatedStorage").Assets.${spec.name}:Clone()\nasset:PivotTo(CFrame.new(0, 0, 0))\nasset.Parent = workspace`,
    },
    sourceExports: exported,
    importNotes: [
      "The Roblox model is built from native parts: it needs no upload and syncs with Rojo.",
      `To import a source export as a MeshPart instead, use Studio's 3D Importer and set File Dimensions to ${units === "studs" ? "Studs" : "Meter"}.`,
      "glTF/GLB keep the part hierarchy, names, pivots and materials; OBJ bakes transforms and has no hierarchy.",
      "FBX is not generated: use GLB, which the Roblox 3D Importer reads directly.",
    ],
  };
  files[`assets/source/${spec.name}.asset.json`] = JSON.stringify(metadata, null, 2) + "\n";
  files[`assets/specs/${spec.name}.spec.json`] = JSON.stringify(spec, null, 2) + "\n";
  steps.push({ step: "metadata", ok: true, detail: `assets/source/${spec.name}.asset.json` });

  const opts: GltfOptions = { units };
  for (const f of formats) {
    if (f === "glb") files[`assets/source/${spec.name}.glb`] = writeGlb(spec, built, opts);
    if (f === "gltf") files[`assets/source/${spec.name}.gltf`] = writeGltf(spec, built, opts);
    if (f === "obj") {
      const { obj, mtl } = writeObj(spec, built, opts);
      files[`assets/source/${spec.name}.obj`] = obj;
      files[`assets/source/${spec.name}.mtl`] = mtl;
    }
  }
  steps.push({ step: "export", ok: true, detail: exported.join(", ") || "no source exports" });

  return { ok: true, spec, steps, files, diagnostics, robloxPath: roblox.robloxPath, stats: { parts: spec.parts.length, triangles: built.triangles, materials, size } };
}
