// Triangle meshes for Roblox's primitive part shapes, with the same geometry
// Roblox uses: cylinders run along X (their length is Size.X), balls take
// the smallest Size component as their diameter, wedges slope down toward
// the front (-Z), and corner wedges rise to their back-right corner.

import { rotationFromOrientation } from "../roblox/values";
import type { AssetPart, AssetSpec } from "./spec";

export interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

type V3 = [number, number, number];

function empty(): Mesh {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/** Adds a flat-shaded polygon (triangle fan) with a computed normal. */
function addFace(m: Mesh, pts: V3[], uv: [number, number][]): void {
  const base = m.positions.length / 3;
  const n = faceNormal(pts[0], pts[1], pts[2]);
  pts.forEach((p, i) => {
    m.positions.push(...p);
    m.normals.push(...n);
    m.uvs.push(...uv[i]);
  });
  for (let i = 1; i < pts.length - 1; i++) m.indices.push(base, base + i, base + i + 1);
}

function faceNormal(a: V3, b: V3, c: V3): V3 {
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

const QUAD_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export function boxMesh([sx, sy, sz]: V3): Mesh {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const m = empty();
  // Counter-clockwise when viewed from outside.
  addFace(m, [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], QUAD_UV); // +X
  addFace(m, [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], QUAD_UV); // -X
  addFace(m, [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], QUAD_UV); // +Y
  addFace(m, [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], QUAD_UV); // -Y
  addFace(m, [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], QUAD_UV); // +Z
  addFace(m, [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], QUAD_UV); // -Z
  return m;
}

export function wedgeMesh([sx, sy, sz]: V3): Mesh {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const m = empty();
  addFace(m, [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], QUAD_UV); // bottom
  addFace(m, [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], QUAD_UV); // back (+Z), full height
  addFace(m, [[x, -y, -z], [-x, -y, -z], [-x, y, z], [x, y, z]], QUAD_UV); // slope, facing front/up
  addFace(m, [[x, -y, z], [x, -y, -z], [x, y, z]], [[0, 0], [1, 0], [0, 1]]); // +X side
  addFace(m, [[-x, -y, -z], [-x, -y, z], [-x, y, z]], [[0, 0], [1, 0], [1, 1]]); // -X side
  return m;
}

export function cornerWedgeMesh([sx, sy, sz]: V3): Mesh {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const apex: V3 = [x, y, z];
  const m = empty();
  addFace(m, [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], QUAD_UV); // bottom
  addFace(m, [[x, -y, z], [x, -y, -z], apex], [[0, 0], [1, 0], [0, 1]]); // +X
  addFace(m, [[-x, -y, z], [x, -y, z], apex], [[0, 0], [1, 0], [1, 1]]); // +Z
  addFace(m, [[x, -y, -z], [-x, -y, -z], apex], [[0, 0], [1, 0], [0.5, 1]]); // front slope
  addFace(m, [[-x, -y, -z], [-x, -y, z], apex], [[0, 0], [1, 0], [0.5, 1]]); // left slope
  return m;
}

export function cylinderMesh([sx, sy, sz]: V3, segments = 24): Mesh {
  const r = Math.min(sy, sz) / 2;
  const hx = sx / 2;
  const m = empty();
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (a: number, xx: number): V3 => [xx, Math.cos(a) * r, Math.sin(a) * r];
    // Side quad with smooth normals.
    const base = m.positions.length / 3;
    const quad: V3[] = [p(a0, -hx), p(a1, -hx), p(a1, hx), p(a0, hx)];
    const normals: V3[] = [
      [0, Math.cos(a0), Math.sin(a0)],
      [0, Math.cos(a1), Math.sin(a1)],
      [0, Math.cos(a1), Math.sin(a1)],
      [0, Math.cos(a0), Math.sin(a0)],
    ];
    quad.forEach((q, k) => {
      m.positions.push(...q);
      m.normals.push(...normals[k]);
      m.uvs.push(k === 0 || k === 3 ? i / segments : (i + 1) / segments, k < 2 ? 0 : 1);
    });
    // Orientation: outward normals, CCW from outside.
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const cap = (xx: number, dir: 1 | -1) => {
    const pts: V3[] = [];
    const uv: [number, number][] = [];
    for (let i = 0; i < segments; i++) {
      const a = ((dir === 1 ? i : segments - i) / segments) * Math.PI * 2;
      pts.push([xx, Math.cos(a) * r, Math.sin(a) * r]);
      uv.push([0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2]);
    }
    addFace(m, pts, uv);
  };
  cap(hx, 1);
  cap(-hx, -1);
  return m;
}

export function sphereMesh(size: V3, rings = 12, segments = 24): Mesh {
  const r = Math.min(...size) / 2;
  const m = empty();
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const phi = v * Math.PI;
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const theta = u * Math.PI * 2;
      const n: V3 = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      m.positions.push(n[0] * r, n[1] * r, n[2] * r);
      m.normals.push(...n);
      m.uvs.push(u, v);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      m.indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return m;
}

export function primitiveMesh(part: Pick<AssetPart, "shape" | "size">): Mesh {
  switch (part.shape) {
    case "wedge":
      return wedgeMesh(part.size);
    case "cornerwedge":
      return cornerWedgeMesh(part.size);
    case "cylinder":
      return cylinderMesh(part.size);
    case "sphere":
      return sphereMesh(part.size);
    default:
      return boxMesh(part.size);
  }
}

export function transformMesh(m: Mesh, rot: number[], t: V3, scale = 1): Mesh {
  const out: Mesh = { positions: [], normals: [], uvs: [...m.uvs], indices: [...m.indices] };
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
    out.positions.push(
      (rot[0] * x + rot[1] * y + rot[2] * z + t[0]) * scale,
      (rot[3] * x + rot[4] * y + rot[5] * z + t[1]) * scale,
      (rot[6] * x + rot[7] * y + rot[8] * z + t[2]) * scale,
    );
    const [nx, ny, nz] = [m.normals[i], m.normals[i + 1], m.normals[i + 2]];
    out.normals.push(rot[0] * nx + rot[1] * ny + rot[2] * nz, rot[3] * nx + rot[4] * ny + rot[5] * nz, rot[6] * nx + rot[7] * ny + rot[8] * nz);
  }
  return out;
}

export function meshBounds(m: Mesh): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  }
  return { min, max };
}

export function mergeMeshes(meshes: Mesh[]): Mesh {
  const out = empty();
  for (const m of meshes) {
    const base = out.positions.length / 3;
    out.positions.push(...m.positions);
    out.normals.push(...m.normals);
    out.uvs.push(...m.uvs);
    out.indices.push(...m.indices.map((i) => i + base));
  }
  return out;
}

export interface PlacedPart {
  part: AssetPart;
  rotation: number[];
  /** World-space (asset-space, pivot-relative) mesh. */
  mesh: Mesh;
  triangles: number;
}

export interface BuiltAsset {
  parts: PlacedPart[];
  bounds: { min: V3; max: V3 };
  pivot: V3;
  triangles: number;
}

/** Places every part, and computes bounds and the pivot (bottom centre unless the spec sets one). */
export function buildAsset(spec: AssetSpec): BuiltAsset {
  const placed: PlacedPart[] = spec.parts.map((part) => {
    const rot = rotationFromOrientation((part.rotation ?? [0, 0, 0]) as V3);
    const mesh = transformMesh(primitiveMesh(part), rot, part.position as V3);
    return { part, rotation: rot, mesh, triangles: mesh.indices.length / 3 };
  });
  const all = mergeMeshes(placed.map((p) => p.mesh));
  const bounds = meshBounds(all);
  const pivot: V3 = (spec.pivot as V3 | undefined) ?? [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1], (bounds.min[2] + bounds.max[2]) / 2];
  return { parts: placed, bounds, pivot, triangles: placed.reduce((a, p) => a + p.triangles, 0) };
}
