// Asset spec -> Roblox model (.model.json for Rojo).
//
// The model is made of native parts, so it needs no upload and no import
// step: it syncs into ReplicatedStorage.Assets and scripts can Clone() it.
// PrimaryPart is set (via Rojo refs) so PivotTo/GetPivot work, and assets
// with unanchored parts are welded to it so they move as one.

import type { ModelJson } from "../roblox/hierarchyEdit";
import type { BuiltAsset } from "./mesh";
import { hexToRgb, type AssetPart, type AssetSpec } from "./spec";

const SHAPE_CLASS: Record<AssetPart["shape"], { className: string; shape?: string }> = {
  block: { className: "Part", shape: "Block" },
  cylinder: { className: "Part", shape: "Cylinder" },
  sphere: { className: "Part", shape: "Ball" },
  wedge: { className: "WedgePart" },
  cornerwedge: { className: "CornerWedgePart" },
};

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function partModel(spec: AssetSpec, placed: BuiltAsset["parts"][number], origin: number[], id: string): ModelJson {
  const p = placed.part;
  const cls = SHAPE_CLASS[p.shape];
  const r = placed.rotation;
  const props: Record<string, unknown> = {
    Size: p.size.map(round),
    CFrame: {
      CFrame: {
        position: [0, 1, 2].map((i) => round(p.position[i] - origin[i])),
        orientation: [r.slice(0, 3).map(round), r.slice(3, 6).map(round), r.slice(6, 9).map(round)],
      },
    },
    Color: hexToRgb(p.color).map((c) => round(c)),
    Material: p.material,
    Anchored: p.anchored,
    CanCollide: p.canCollide,
    TopSurface: "Smooth",
    BottomSurface: "Smooth",
  };
  if (cls.shape) props.Shape = cls.shape;
  if (p.transparency) props.Transparency = p.transparency;
  if (p.reflectance) props.Reflectance = p.reflectance;
  const children: ModelJson[] = [];
  for (const e of p.effects ?? []) {
    if (e.type === "ParticleEmitter") {
      const c = e.color ? hexToRgb(e.color) : [1, 1, 1];
      children.push({
        Name: "Particles",
        ClassName: "ParticleEmitter",
        Properties: {
          Color: { ColorSequence: { keypoints: [{ time: 0, color: c }, { time: 1, color: c }] } },
          Rate: e.rate ?? 10,
          Lifetime: { NumberRange: e.lifetime ?? [1, 2] },
          Speed: { NumberRange: e.speed ?? [2, 4] },
          Size: { NumberSequence: { keypoints: [{ time: 0, value: e.size ?? 0.5, envelope: 0 }, { time: 1, value: 0, envelope: 0 }] } },
        },
      });
    } else {
      children.push({
        Name: e.type.replace("Light", "") + "Light",
        ClassName: e.type,
        Properties: {
          ...(e.color ? { Color: hexToRgb(e.color) } : {}),
          Brightness: e.brightness ?? 1,
          Range: e.range ?? 12,
        },
      });
    }
  }
  return {
    Name: p.name,
    ClassName: cls.className,
    Properties: props,
    Attributes: { Rojo_Id: id },
    ...(children.length ? { Children: children } : {}),
  };
}

export interface RobloxAssetModel {
  model: ModelJson;
  /** Where the model lands in the DataModel when saved under src/assets. */
  robloxPath: string;
  primaryPart: string;
}

export function assetToRobloxModel(spec: AssetSpec, built: BuiltAsset): RobloxAssetModel {
  const idFor = (i: number) => `${spec.name}_${i}`;
  const volume = (p: AssetPart) => p.size[0] * p.size[1] * p.size[2];

  const buildGroup = (indices: number[], origin: number[], name: string, className: "Model"): { model: ModelJson; primary: string } => {
    const primaryIdx = indices.reduce((best, i) => (volume(built.parts[i].part) > volume(built.parts[best].part) ? i : best), indices[0]);
    const byGroup = new Map<string, number[]>();
    const loose: number[] = [];
    for (const i of indices) {
      const g = built.parts[i].part.group;
      if (g && !spec.modular) {
        const list = byGroup.get(g) ?? [];
        list.push(i);
        byGroup.set(g, list);
      } else loose.push(i);
    }
    const children: ModelJson[] = loose.map((i) => partModel(spec, built.parts[i], origin, idFor(i)));
    for (const [g, list] of byGroup) {
      children.push({ Name: g, ClassName: "Model", Children: list.map((i) => partModel(spec, built.parts[i], origin, idFor(i))) });
    }
    // Weld loose parts to the primary part so they move as one.
    const unanchored = indices.some((i) => !built.parts[i].part.anchored);
    if (unanchored) {
      const welds: ModelJson[] = indices
        .filter((i) => i !== primaryIdx)
        .map((i) => ({
          Name: `Weld_${built.parts[i].part.name}`,
          ClassName: "WeldConstraint",
          Attributes: { Rojo_Target_Part0: idFor(primaryIdx), Rojo_Target_Part1: idFor(i) },
        }));
      children.push({ Name: "Welds", ClassName: "Folder", Children: welds });
    }
    return {
      model: {
        Name: name,
        ClassName: className,
        Attributes: {
          Rojo_Target_PrimaryPart: idFor(primaryIdx),
          AssetCategory: spec.category,
          GeneratedBy: "RobloxBuilder",
        },
        Children: children,
      },
      primary: built.parts[primaryIdx].part.name,
    };
  };

  const all = built.parts.map((_, i) => i);
  if (spec.modular) {
    const groups = new Map<string, number[]>();
    all.forEach((i) => {
      const g = built.parts[i].part.group ?? built.parts[i].part.name;
      const list = groups.get(g) ?? [];
      list.push(i);
      groups.set(g, list);
    });
    const pieces: ModelJson[] = [];
    let primary = "";
    for (const [g, list] of groups) {
      // Each kit piece is centred on its own bottom-centre so it snaps on a grid.
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const i of list) {
        const m = built.parts[i].mesh;
        for (let v = 0; v < m.positions.length; v += 3)
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], m.positions[v + k]);
            max[k] = Math.max(max[k], m.positions[v + k]);
          }
      }
      const origin = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
      const { model, primary: pp } = buildGroup(list, origin, g, "Model");
      primary ||= pp;
      pieces.push(model);
    }
    return {
      model: { Name: spec.name, ClassName: "Folder", Attributes: { AssetCategory: spec.category, GeneratedBy: "RobloxBuilder" }, Children: pieces },
      robloxPath: `ReplicatedStorage.Assets.${spec.name}`,
      primaryPart: primary,
    };
  }
  const { model, primary } = buildGroup(all, built.pivot, spec.name, "Model");
  return { model, robloxPath: `ReplicatedStorage.Assets.${spec.name}`, primaryPart: primary };
}
