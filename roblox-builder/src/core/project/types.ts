import type { ProjectKind } from "../roblox/template";

export interface ProjectSettings {
  /** Open Cloud publishing target. The API key itself is server config, never stored here. */
  robloxUniverseId?: string;
  robloxPlaceId?: string;
  /** Creator for asset uploads: a user id or a group id. */
  robloxCreatorUserId?: string;
  robloxCreatorGroupId?: string;
  /** Let autopilot run destructive tools (delete, restore) without asking. */
  autoApproveDestructive?: boolean;
  /** Units for 3D source exports. */
  assetUnits?: "studs" | "meters";
  assetFormats?: ("glb" | "gltf" | "obj")[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  kind: ProjectKind;
  description: string;
  createdAt: number;
  updatedAt: number;
  activeBranch: string;
  settings: ProjectSettings;
}

export interface BranchInfo {
  name: string;
  createdAt: number;
  createdFrom?: { branch?: string; snapshot?: string };
  /** Short description, used for Forge variants ("Neon arcade direction"). */
  label?: string;
  /** Forge batch this branch belongs to. */
  forgeBatch?: string;
}

export interface SnapshotInfo {
  id: string;
  branch: string;
  createdAt: number;
  label: string;
  /** Why it exists: manual, agent run start/end, before restore, repair... */
  reason: "manual" | "agent-start" | "agent-end" | "before-restore" | "repair" | "created" | "branch" | "edit";
  parent?: string;
  fileCount: number;
  runId?: string;
}

export interface SnapshotManifest extends SnapshotInfo {
  files: Record<string, string>;
}

export interface FileEntry {
  path: string;
  size: number;
  binary: boolean;
  modifiedAt: number;
}

/**
 * Structured project memory. The agent reads all of it every turn and
 * updates it with the update_memory tool; the user can edit it in Settings.
 * Everything derivable from the files (tree, hierarchy, scripts, remotes,
 * assets, dependencies) is computed live instead of stored, so it can never
 * go stale.
 */
export interface ProjectMemory {
  goals: string[];
  architecture: string[];
  decisions: { at: number; text: string }[];
  knownBugs: string[];
  designSystem: string[];
  preferences: string[];
  notes: string[];
}

export const EMPTY_MEMORY: ProjectMemory = {
  goals: [],
  architecture: [],
  decisions: [],
  knownBugs: [],
  designSystem: [],
  preferences: [],
  notes: [],
};

export const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tga",
  "ico",
  "glb",
  "fbx",
  "rbxm",
  "rbxl",
  "ogg",
  "mp3",
  "wav",
  "zip",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "pdf",
]);

export function looksBinary(path: string, bytes?: Uint8Array): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (!bytes) return false;
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}
