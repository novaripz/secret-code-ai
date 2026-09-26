// The asset spec: a precise, editable description of a 3D asset built from
// Roblox-native primitives. The agent writes one of these (create_asset); the
// pipeline turns it into a Roblox model the project uses directly, plus
// glTF/GLB/OBJ source exports for Studio's 3D Importer or other tools.
//
// Conventions match Roblox so nothing needs converting on the way in:
// units are studs, +Y is up, the asset faces -Z (Roblox's LookVector), and
// rotations are Orientation degrees applied in Roblox's Y, X, Z order.

import { z } from "zod";
import { ENUMS } from "../roblox/enums";

export const ASSET_CATEGORIES = [
  "prop",
  "building",
  "environment",
  "furniture",
  "vehicle",
  "tool",
  "creature",
  "character",
  "decoration",
  "kit",
  "gameplay",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const SHAPES = ["block", "cylinder", "sphere", "wedge", "cornerwedge"] as const;
export type Shape = (typeof SHAPES)[number];

export const TEXTURE_PATTERNS = ["planks", "bricks", "checker", "stripes", "noise", "tiles"] as const;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const color = z.union([z.string().regex(/^#?[0-9a-fA-F]{6}$/, "colour must be #rrggbb"), z.tuple([z.number(), z.number(), z.number()])]);

const lightSchema = z.object({
  type: z.enum(["PointLight", "SpotLight", "SurfaceLight"]),
  color: color.optional(),
  brightness: z.number().min(0).max(40).optional(),
  range: z.number().min(0).max(60).optional(),
});

const particleSchema = z.object({
  type: z.literal("ParticleEmitter"),
  color: color.optional(),
  rate: z.number().min(0).max(500).optional(),
  lifetime: z.tuple([z.number(), z.number()]).optional(),
  speed: z.tuple([z.number(), z.number()]).optional(),
  size: z.number().min(0).max(20).optional(),
});

export const partSchema = z.object({
  name: z.string().min(1).max(100),
  shape: z.enum(SHAPES).default("block"),
  size: vec3,
  position: vec3,
  rotation: vec3.optional(),
  color: color.default("#a3a2a5"),
  material: z.string().default("SmoothPlastic"),
  transparency: z.number().min(0).max(1).default(0),
  reflectance: z.number().min(0).max(1).default(0),
  anchored: z.boolean().default(true),
  canCollide: z.boolean().default(true),
  group: z.string().max(100).optional(),
  texture: z
    .object({ pattern: z.enum(TEXTURE_PATTERNS), color2: color.optional(), scale: z.number().min(0.1).max(64).optional() })
    .optional(),
  effects: z.array(z.union([lightSchema, particleSchema])).max(4).optional(),
});

export const assetSpecSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "name must be an identifier like OakTable"),
  category: z.enum(ASSET_CATEGORIES),
  description: z.string().max(500).optional(),
  /** Which way the asset faces. Roblox convention is -Z. */
  front: z.enum(["-Z", "+Z", "-X", "+X"]).default("-Z"),
  /** Pivot in asset space. Defaults to the bottom centre of the bounds. */
  pivot: vec3.optional(),
  /** For kits: each group becomes its own Model with its own pivot. */
  modular: z.boolean().default(false),
  parts: z.array(partSchema).min(1).max(2000),
});

export type AssetSpec = z.infer<typeof assetSpecSchema>;
export type AssetPart = z.infer<typeof partSchema>;
export type AssetSpecInput = z.input<typeof assetSpecSchema>;

export function parseAssetSpec(input: unknown): { spec?: AssetSpec; errors: string[] } {
  const r = assetSpecSchema.safeParse(input);
  if (!r.success) {
    return { errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const errors: string[] = [];
  const materials = ENUMS.Material;
  r.data.parts.forEach((p, i) => {
    if (!(p.material in materials)) {
      errors.push(`parts.${i}.material: "${p.material}" is not a Roblox material (${Object.keys(materials).slice(0, 12).join(", ")}, …)`);
    }
    if (p.size.some((s) => s <= 0)) errors.push(`parts.${i}.size: every component must be positive`);
  });
  return errors.length ? { errors } : { spec: r.data, errors: [] };
}

export function hexToRgb(c: string | [number, number, number]): [number, number, number] {
  if (Array.isArray(c)) return c.some((x) => x > 1) ? [c[0] / 255, c[1] / 255, c[2] / 255] : c;
  const n = parseInt(c.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** PBR approximations of Roblox materials, for glTF export and the 3D viewport. */
export function pbrFor(material: string): { metallic: number; roughness: number; emissive?: boolean } {
  switch (material) {
    case "Metal":
    case "DiamondPlate":
    case "CorrodedMetal":
      return { metallic: 1, roughness: material === "CorrodedMetal" ? 0.75 : 0.4 };
    case "Foil":
      return { metallic: 1, roughness: 0.2 };
    case "Neon":
      return { metallic: 0, roughness: 0.5, emissive: true };
    case "Glass":
    case "Ice":
      return { metallic: 0, roughness: 0.05 };
    case "SmoothPlastic":
      return { metallic: 0, roughness: 0.35 };
    case "Plastic":
      return { metallic: 0, roughness: 0.55 };
    case "Marble":
    case "Granite":
      return { metallic: 0, roughness: 0.45 };
    default:
      return { metallic: 0, roughness: 0.85 };
  }
}
