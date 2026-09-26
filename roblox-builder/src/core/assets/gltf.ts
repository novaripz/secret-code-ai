// glTF 2.0 export (.gltf with an embedded buffer, and binary .glb), and an
// inspector for glTF/GLB files a user imports.
//
// The export keeps the asset's structure rather than flattening it: one node
// per group, one node per part with its own translation and rotation, meshes
// in part-local space, and one material per distinct look. That is what lets
// Studio's 3D Importer (or Blender) show the same hierarchy, pivots and
// names the Roblox model has.

import type { BuiltAsset } from "./mesh";
import { patternTexture } from "./png";
import { hexToRgb, pbrFor, type AssetSpec } from "./spec";
import { primitiveMesh } from "./mesh";

export const STUDS_TO_METERS = 0.28;

export interface GltfOptions {
  /** Output units. Studs keep 1:1 numbers; set File Dimensions to Studs in the importer. */
  units: "studs" | "meters";
}

interface Pending {
  json: Record<string, unknown>;
  bin: Uint8Array;
}

function quatFromMatrix(m: number[]): [number, number, number, number] {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

class BinWriter {
  private parts: Uint8Array[] = [];
  private length = 0;
  add(data: Uint8Array): { offset: number; length: number } {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) {
      this.parts.push(new Uint8Array(pad));
      this.length += pad;
    }
    const offset = this.length;
    this.parts.push(data);
    this.length += data.length;
    return { offset, length: data.length };
  }
  finish(): Uint8Array {
    const pad = (4 - (this.length % 4)) % 4;
    const out = new Uint8Array(this.length + pad);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

function buildGltf(spec: AssetSpec, built: BuiltAsset, opts: GltfOptions): Pending {
  const k = opts.units === "meters" ? STUDS_TO_METERS : 1;
  const bin = new BinWriter();
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const materials: Record<string, unknown>[] = [];
  const images: Record<string, unknown>[] = [];
  const textures: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const materialIndex = new Map<string, number>();

  const view = (data: Uint8Array, target?: number) => {
    const { offset, length } = bin.add(data);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: length, ...(target ? { target } : {}) });
    return bufferViews.length - 1;
  };
  const floatAccessor = (values: number[], type: "VEC3" | "VEC2", withBounds: boolean) => {
    const arr = new Float32Array(values);
    const bv = view(new Uint8Array(arr.buffer), 34962);
    const n = type === "VEC3" ? 3 : 2;
    const acc: Record<string, unknown> = { bufferView: bv, componentType: 5126, count: values.length / n, type };
    if (withBounds) {
      const min = new Array(n).fill(Infinity);
      const max = new Array(n).fill(-Infinity);
      for (let i = 0; i < values.length; i += n)
        for (let j = 0; j < n; j++) {
          min[j] = Math.min(min[j], arr[i + j]);
          max[j] = Math.max(max[j], arr[i + j]);
        }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const indexAccessor = (indices: number[], vertexCount: number) => {
    const big = vertexCount > 65535;
    const arr = big ? new Uint32Array(indices) : new Uint16Array(indices);
    const bv = view(new Uint8Array(arr.buffer, 0, arr.byteLength), 34963);
    accessors.push({ bufferView: bv, componentType: big ? 5125 : 5123, count: indices.length, type: "SCALAR" });
    return accessors.length - 1;
  };

  const materialFor = (p: AssetSpec["parts"][number]) => {
    const key = JSON.stringify([p.color, p.material, p.transparency, p.texture]);
    const existing = materialIndex.get(key);
    if (existing !== undefined) return existing;
    const rgb = hexToRgb(p.color);
    const pbr = pbrFor(p.material);
    const mat: Record<string, unknown> = {
      name: `${p.material}_${Array.isArray(p.color) ? rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("") : String(p.color).replace("#", "")}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb, 1 - p.transparency],
        metallicFactor: pbr.metallic,
        roughnessFactor: pbr.roughness,
      },
      doubleSided: false,
    };
    if (pbr.emissive) mat.emissiveFactor = rgb;
    if (p.transparency > 0) mat.alphaMode = "BLEND";
    if (p.texture) {
      const c2 = p.texture.color2 ? hexToRgb(p.texture.color2) : (rgb.map((c) => c * 0.7) as [number, number, number]);
      const png = patternTexture(p.texture.pattern, rgb, c2);
      images.push({ name: `${spec.name}_${p.texture.pattern}`, mimeType: "image/png", bufferView: view(png) });
      textures.push({ source: images.length - 1, sampler: 0 });
      (mat.pbrMetallicRoughness as Record<string, unknown>).baseColorTexture = { index: textures.length - 1 };
      (mat.pbrMetallicRoughness as Record<string, unknown>).baseColorFactor = [1, 1, 1, 1 - p.transparency];
    }
    materials.push(mat);
    materialIndex.set(key, materials.length - 1);
    return materials.length - 1;
  };

  // Groups become parent nodes so the hierarchy survives the round trip.
  const rootChildren: number[] = [];
  const groupNodes = new Map<string, number>();
  for (const placed of built.parts) {
    const p = placed.part;
    const local = primitiveMesh(p);
    const scaled = local.positions.map((x) => x * k);
    const mesh = {
      name: p.name,
      primitives: [
        {
          attributes: {
            POSITION: floatAccessor(scaled, "VEC3", true),
            NORMAL: floatAccessor(local.normals, "VEC3", false),
            TEXCOORD_0: floatAccessor(local.uvs, "VEC2", false),
          },
          indices: indexAccessor(local.indices, local.positions.length / 3),
          material: materialFor(p),
        },
      ],
    };
    meshes.push(mesh);
    const node: Record<string, unknown> = {
      name: p.name,
      mesh: meshes.length - 1,
      translation: [0, 1, 2].map((i) => (p.position[i] - built.pivot[i]) * k),
      extras: { shape: p.shape, material: p.material, anchored: p.anchored },
    };
    const rot = placed.rotation;
    if (rot.some((v, i) => Math.abs(v - [1, 0, 0, 0, 1, 0, 0, 0, 1][i]) > 1e-9)) node.rotation = quatFromMatrix(rot);
    nodes.push(node);
    const idx = nodes.length - 1;
    if (p.group) {
      let g = groupNodes.get(p.group);
      if (g === undefined) {
        nodes.push({ name: p.group, children: [] });
        g = nodes.length - 1;
        groupNodes.set(p.group, g);
        rootChildren.push(g);
      }
      (nodes[g].children as number[]).push(idx);
    } else {
      rootChildren.push(idx);
    }
  }
  nodes.push({ name: spec.name, children: rootChildren, extras: { units: opts.units, up: "+Y", front: spec.front, category: spec.category } });
  const rootIndex = nodes.length - 1;

  const binData = bin.finish();
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "Roblox Builder asset pipeline" },
    scene: 0,
    scenes: [{ name: spec.name, nodes: [rootIndex] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binData.length }],
  };
  if (images.length) {
    json.images = images;
    json.textures = textures;
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  }
  return { json, bin: binData };
}

export function writeGlb(spec: AssetSpec, built: BuiltAsset, opts: GltfOptions): Uint8Array {
  const { json, bin } = buildGltf(spec, built, opts);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
  jsonChunk.set(jsonBytes);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonChunk.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonChunk, 20);
  const binStart = 20 + jsonChunk.length;
  dv.setUint32(binStart, bin.length, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
  out.set(bin, binStart + 8);
  return out;
}

export function writeGltf(spec: AssetSpec, built: BuiltAsset, opts: GltfOptions): string {
  const { json, bin } = buildGltf(spec, built, opts);
  let s = "";
  for (let i = 0; i < bin.length; i++) s += String.fromCharCode(bin[i]);
  (json.buffers as Record<string, unknown>[])[0].uri = `data:application/octet-stream;base64,${btoa(s)}`;
  return JSON.stringify(json, null, 1) + "\n";
}

// ------------------------------------------------------------------ inspection

export interface MeshInspection {
  format: "glb" | "gltf" | "obj" | "fbx" | "unknown";
  ok: boolean;
  error?: string;
  meshes: number;
  nodes: number;
  triangles: number;
  vertices: number;
  materials: number;
  textures: number;
  embeddedImages: number;
  externalImages: string[];
  animations: number;
  skins: number;
  bounds?: { min: number[]; max: number[] };
  /** Largest dimension of the bounds, in file units. */
  extent?: number;
  notes: string[];
  maxTrianglesPerMesh: number;
}

function emptyInspection(format: MeshInspection["format"]): MeshInspection {
  return {
    format,
    ok: true,
    meshes: 0,
    nodes: 0,
    triangles: 0,
    vertices: 0,
    materials: 0,
    textures: 0,
    embeddedImages: 0,
    externalImages: [],
    animations: 0,
    skins: 0,
    notes: [],
    maxTrianglesPerMesh: 0,
  };
}

export function inspectGltfJson(json: Record<string, unknown>, format: "glb" | "gltf"): MeshInspection {
  const r = emptyInspection(format);
  const asset = json.asset as { version?: string } | undefined;
  if (!asset || asset.version !== "2.0") {
    r.ok = false;
    r.error = `Not glTF 2.0 (asset.version is ${JSON.stringify(asset?.version)})`;
    return r;
  }
  const accessors = (json.accessors as { count?: number; min?: number[]; max?: number[] }[]) ?? [];
  const meshes = (json.meshes as { primitives?: { attributes?: Record<string, number>; indices?: number; mode?: number }[] }[]) ?? [];
  r.meshes = meshes.length;
  r.nodes = ((json.nodes as unknown[]) ?? []).length;
  r.materials = ((json.materials as unknown[]) ?? []).length;
  r.textures = ((json.textures as unknown[]) ?? []).length;
  r.animations = ((json.animations as unknown[]) ?? []).length;
  r.skins = ((json.skins as unknown[]) ?? []).length;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    let meshTris = 0;
    for (const p of m.primitives ?? []) {
      const pos = p.attributes?.POSITION;
      const posAcc = pos !== undefined ? accessors[pos] : undefined;
      const vcount = posAcc?.count ?? 0;
      r.vertices += vcount;
      const tris = p.indices !== undefined ? Math.floor((accessors[p.indices]?.count ?? 0) / 3) : Math.floor(vcount / 3);
      if (p.mode === undefined || p.mode === 4) meshTris += tris;
      if (posAcc?.min && posAcc?.max) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], posAcc.min[i]);
          max[i] = Math.max(max[i], posAcc.max[i]);
        }
      }
    }
    r.triangles += meshTris;
    r.maxTrianglesPerMesh = Math.max(r.maxTrianglesPerMesh, meshTris);
  }
  if (Number.isFinite(min[0])) {
    r.bounds = { min, max };
    r.extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    r.notes.push("Bounds are from mesh accessors in local space; node transforms are not applied.");
  }
  for (const img of (json.images as { uri?: string; bufferView?: number }[]) ?? []) {
    if (img.bufferView !== undefined || img.uri?.startsWith("data:")) r.embeddedImages++;
    else if (img.uri) r.externalImages.push(img.uri);
  }
  return r;
}

export function inspectMeshFile(name: string, data: Uint8Array): MeshInspection {
  const lower = name.toLowerCase();
  if (lower.endsWith(".glb")) {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data.length < 20 || dv.getUint32(0, true) !== 0x46546c67) {
      return { ...emptyInspection("glb"), ok: false, error: "Not a GLB file (bad magic number)" };
    }
    const len = dv.getUint32(12, true);
    try {
      const json = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + len)));
      return inspectGltfJson(json, "glb");
    } catch (err) {
      return { ...emptyInspection("glb"), ok: false, error: `Malformed GLB JSON chunk: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  if (lower.endsWith(".gltf")) {
    try {
      const json = JSON.parse(new TextDecoder().decode(data));
      const r = inspectGltfJson(json, "gltf");
      const buffers = (json.buffers as { uri?: string }[]) ?? [];
      for (const b of buffers) if (b.uri && !b.uri.startsWith("data:")) r.externalImages.push(b.uri);
      return r;
    } catch (err) {
      return { ...emptyInspection("gltf"), ok: false, error: `Malformed glTF JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  if (lower.endsWith(".obj")) return inspectObj(new TextDecoder().decode(data));
  if (lower.endsWith(".fbx")) {
    const r = emptyInspection("fbx");
    const head = new TextDecoder().decode(data.subarray(0, 23));
    if (head.startsWith("Kaydara FBX Binary")) {
      const version = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(23, true);
      r.notes.push(`Binary FBX, version ${version}. Contents are not parsed here; Studio's 3D Importer reads it directly.`);
      if (version < 7100) r.notes.push("FBX versions older than 7.1 (2011) often fail to import; re-export as FBX 2014+ or glTF.");
    } else if (new TextDecoder().decode(data.subarray(0, 200)).includes("FBX")) {
      r.notes.push("ASCII FBX. Export as binary FBX or glTF/GLB instead; ASCII FBX is not reliably supported by Studio's importer.");
      r.ok = false;
      r.error = "ASCII FBX";
    } else {
      r.ok = false;
      r.error = "Not an FBX file";
    }
    return r;
  }
  return { ...emptyInspection("unknown"), ok: false, error: `Unsupported 3D format: ${name}` };
}

export function inspectObj(text: string): MeshInspection {
  const r = emptyInspection("obj");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const objects = new Set<string>();
  let current = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("v ")) {
      const [, x, y, z] = t.split(/\s+/).map(Number);
      r.vertices++;
      [x, y, z].forEach((v, i) => {
        min[i] = Math.min(min[i], v);
        max[i] = Math.max(max[i], v);
      });
    } else if (t.startsWith("f ")) {
      const n = t.split(/\s+/).length - 1;
      r.triangles += Math.max(0, n - 2);
      current += Math.max(0, n - 2);
    } else if (t.startsWith("o ") || t.startsWith("g ")) {
      objects.add(t.slice(2));
      r.maxTrianglesPerMesh = Math.max(r.maxTrianglesPerMesh, current);
      current = 0;
    } else if (t.startsWith("mtllib ")) {
      r.externalImages.push(t.slice(7).trim());
    } else if (t.startsWith("usemtl ")) {
      r.materials++;
    }
  }
  r.maxTrianglesPerMesh = Math.max(r.maxTrianglesPerMesh, current);
  r.meshes = Math.max(1, objects.size);
  r.nodes = r.meshes;
  if (Number.isFinite(min[0])) {
    r.bounds = { min, max };
    r.extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  }
  if (r.vertices === 0) {
    r.ok = false;
    r.error = "OBJ has no vertices";
  }
  return r;
}
