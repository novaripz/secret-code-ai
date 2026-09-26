// Wavefront OBJ + MTL export. OBJ has no hierarchy or transforms, so parts are
// baked into asset space (pivot at the origin) and kept apart as named
// objects; that is the most OBJ can preserve, and why glTF is the default.

import { STUDS_TO_METERS, type GltfOptions } from "./gltf";
import type { BuiltAsset } from "./mesh";
import { hexToRgb, pbrFor, type AssetSpec } from "./spec";

export function writeObj(spec: AssetSpec, built: BuiltAsset, opts: GltfOptions): { obj: string; mtl: string } {
  const k = opts.units === "meters" ? STUDS_TO_METERS : 1;
  const lines: string[] = [
    `# ${spec.name} (${spec.category}) exported by Roblox Builder`,
    `# units: ${opts.units}, +Y up, front ${spec.front}`,
    `mtllib ${spec.name}.mtl`,
  ];
  const mtl: string[] = [`# Materials for ${spec.name}`];
  const matNames = new Map<string, string>();
  let vBase = 1;
  for (const placed of built.parts) {
    const p = placed.part;
    const key = JSON.stringify([p.color, p.material, p.transparency]);
    let mat = matNames.get(key);
    if (!mat) {
      mat = `mat${matNames.size}_${p.material}`;
      matNames.set(key, mat);
      const [r, g, b] = hexToRgb(p.color);
      const pbr = pbrFor(p.material);
      mtl.push(
        "",
        `newmtl ${mat}`,
        `Kd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`,
        `Ka 0 0 0`,
        `Ks ${pbr.metallic ? "0.8 0.8 0.8" : "0.1 0.1 0.1"}`,
        `Ns ${Math.round((1 - pbr.roughness) * 900 + 10)}`,
        `d ${(1 - p.transparency).toFixed(3)}`,
        pbr.emissive ? `Ke ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}` : "illum 2",
      );
    }
    lines.push(`o ${p.group ? `${p.group}_` : ""}${p.name}`, `usemtl ${mat}`);
    const m = placed.mesh;
    for (let i = 0; i < m.positions.length; i += 3) {
      lines.push(`v ${((m.positions[i] - built.pivot[0]) * k).toFixed(5)} ${((m.positions[i + 1] - built.pivot[1]) * k).toFixed(5)} ${((m.positions[i + 2] - built.pivot[2]) * k).toFixed(5)}`);
    }
    for (let i = 0; i < m.uvs.length; i += 2) lines.push(`vt ${m.uvs[i].toFixed(5)} ${m.uvs[i + 1].toFixed(5)}`);
    for (let i = 0; i < m.normals.length; i += 3) lines.push(`vn ${m.normals[i].toFixed(5)} ${m.normals[i + 1].toFixed(5)} ${m.normals[i + 2].toFixed(5)}`);
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = [m.indices[i], m.indices[i + 1], m.indices[i + 2]].map((x) => x + vBase);
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    vBase += m.positions.length / 3;
  }
  return { obj: lines.join("\n") + "\n", mtl: mtl.join("\n") + "\n" };
}
