// Project persistence on disk.
//
//   DATA_DIR/
//     blobs/ab/abcdef...          content-addressed file contents (shared)
//     projects/<id>/
//       meta.json                 ProjectMeta
//       memory.json               ProjectMemory
//       branches/<name>/branch.json
//       branches/<name>/tree/...  the working tree: real files, so commands run in it
//       snapshots/<id>.json       manifest: path -> blob hash
//       chat/<branch>.json        conversation for that branch
//       runs/<runId>.json         agent run records (timeline + outcome)
//
// Snapshots are manifests over the blob store, so they are cheap: restoring,
// branching and diffing never copy more than the files that differ.

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizePath, type FileMap } from "@/core/project/files";
import {
  EMPTY_MEMORY,
  looksBinary,
  type BranchInfo,
  type FileEntry,
  type ProjectMemory,
  type ProjectMeta,
  type SnapshotInfo,
  type SnapshotManifest,
} from "@/core/project/types";
import { templateFor, type ProjectKind } from "@/core/roblox/template";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), ".data"));
const PROJECTS = path.join(DATA_DIR, "projects");
const BLOBS = path.join(DATA_DIR, "blobs");

/** Directories never read into the project model or snapshots. */
const IGNORED_DIRS = new Set(["node_modules", ".git", ".cache", ".next", "dist-ssr", ".rbuild"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class StoreError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function newId(prefix = ""): string {
  return prefix + randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12);
}

function validId(id: string): string {
  if (!/^[A-Za-z0-9]{4,40}$/.test(id)) throw new StoreError("Invalid id", 400);
  return id;
}

export function validBranchName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    throw new StoreError("Branch names use letters, digits, '.', '_' and '-' (max 64)", 400);
  }
  return name;
}

// ------------------------------------------------------------ locking

const locks = new Map<string, Promise<unknown>>();

/** Serializes writes per project so the agent and the UI never interleave half-writes. */
export async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => next);
  locks.set(projectId, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(projectId) === chained) locks.delete(projectId);
  }
}

// ------------------------------------------------------------ paths

function projectDir(id: string) {
  return path.join(PROJECTS, validId(id));
}

export function treeDir(id: string, branch: string) {
  return path.join(projectDir(id), "branches", validBranchName(branch), "tree");
}

/** Resolves a project-relative path inside a branch tree, refusing anything that escapes it. */
function resolveInTree(id: string, branch: string, rel: string): { abs: string; rel: string } {
  const clean = normalizePath(rel);
  const root = treeDir(id, branch);
  const abs = path.resolve(root, clean);
  if (!abs.startsWith(root + path.sep)) throw new StoreError(`Path escapes the project: ${rel}`, 400);
  return { abs, rel: clean };
}

async function readJson<T>(file: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if (fallback !== undefined && (err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

// ------------------------------------------------------------ blobs

function sha(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function putBlob(data: Uint8Array): Promise<string> {
  const h = sha(data);
  const file = path.join(BLOBS, h.slice(0, 2), h);
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }
  return h;
}

export async function getBlob(hash: string): Promise<Uint8Array> {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new StoreError("Invalid blob hash");
  return new Uint8Array(await fs.readFile(path.join(BLOBS, hash.slice(0, 2), hash)));
}

// ------------------------------------------------------------ projects

export async function listProjects(): Promise<ProjectMeta[]> {
  await fs.mkdir(PROJECTS, { recursive: true });
  const ids = await fs.readdir(PROJECTS);
  const metas = await Promise.all(
    ids.map(async (id) => {
      try {
        return await readJson<ProjectMeta>(path.join(PROJECTS, id, "meta.json"));
      } catch {
        return undefined;
      }
    }),
  );
  return metas.filter((m): m is ProjectMeta => !!m).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ProjectMeta> {
  try {
    return await readJson<ProjectMeta>(path.join(projectDir(id), "meta.json"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new StoreError("Project not found", 404);
    throw err;
  }
}

export async function updateProject(id: string, patch: Partial<Pick<ProjectMeta, "name" | "description" | "settings" | "activeBranch">>): Promise<ProjectMeta> {
  return withProjectLock(id, async () => {
    const meta = await getProject(id);
    const next: ProjectMeta = {
      ...meta,
      ...patch,
      settings: { ...meta.settings, ...(patch.settings ?? {}) },
      updatedAt: Date.now(),
    };
    if (patch.activeBranch) {
      validBranchName(patch.activeBranch);
      await fs.access(treeDir(id, patch.activeBranch)).catch(() => {
        throw new StoreError(`No branch ${patch.activeBranch}`, 404);
      });
    }
    await writeJson(path.join(projectDir(id), "meta.json"), next);
    return next;
  });
}

async function touch(id: string): Promise<void> {
  const file = path.join(projectDir(id), "meta.json");
  const meta = await readJson<ProjectMeta>(file);
  meta.updatedAt = Date.now();
  await writeJson(file, meta);
}

export async function createProject(input: { name: string; kind: ProjectKind; description?: string; files?: Record<string, string | Uint8Array> }): Promise<ProjectMeta> {
  const name = input.name.trim().slice(0, 80) || "Untitled";
  const id = newId();
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    name,
    kind: input.kind,
    description: (input.description ?? "").slice(0, 2000),
    createdAt: now,
    updatedAt: now,
    activeBranch: "main",
    settings: { assetUnits: "studs", assetFormats: ["glb"] },
  };
  await fs.mkdir(treeDir(id, "main"), { recursive: true });
  await writeJson(path.join(projectDir(id), "meta.json"), meta);
  await writeJson(path.join(projectDir(id), "memory.json"), {
    ...EMPTY_MEMORY,
    goals: input.description ? [input.description.slice(0, 500)] : [],
  });
  await writeJson(path.join(projectDir(id), "branches", "main", "branch.json"), { name: "main", createdAt: now } satisfies BranchInfo);
  const files = input.files ?? templateFor(name, input.kind);
  for (const [p, data] of Object.entries(files)) await writeFileRaw(id, "main", p, data);
  await createSnapshot(id, "main", { label: "Project created", reason: "created" });
  return meta;
}

export async function deleteProject(id: string): Promise<void> {
  await getProject(id);
  await fs.rm(projectDir(id), { recursive: true, force: true });
}

// ------------------------------------------------------------ files

async function walkTree(root: string): Promise<{ rel: string; abs: string; size: number; mtime: number }[]> {
  const out: { rel: string; abs: string; size: number; mtime: number }[] = [];
  const go = async (dir: string, prefix: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        await go(abs, rel);
      } else if (e.isFile()) {
        const st = await fs.stat(abs);
        out.push({ rel, abs, size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  await go(root, "");
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

export async function listFiles(id: string, branch: string): Promise<FileEntry[]> {
  const entries = await walkTree(treeDir(id, branch));
  return entries.map((e) => ({ path: e.rel, size: e.size, binary: looksBinary(e.rel), modifiedAt: e.mtime }));
}

/** The whole tree as the core's FileMap. Text files as strings, binary as bytes. */
export async function readTree(id: string, branch: string): Promise<FileMap> {
  const map: FileMap = new Map();
  for (const e of await walkTree(treeDir(id, branch))) {
    if (e.size > MAX_FILE_BYTES) continue;
    const bytes = new Uint8Array(await fs.readFile(e.abs));
    map.set(e.rel, looksBinary(e.rel, bytes) ? bytes : new TextDecoder().decode(bytes));
  }
  return map;
}

export async function readFile(id: string, branch: string, rel: string): Promise<{ path: string; data: string | Uint8Array; binary: boolean }> {
  const { abs, rel: clean } = resolveInTree(id, branch, rel);
  let bytes: Uint8Array;
  try {
    const st = await fs.lstat(abs);
    if (st.isSymbolicLink() || !st.isFile()) throw new StoreError(`${clean} is not a file`, 400);
    bytes = new Uint8Array(await fs.readFile(abs));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new StoreError(`${clean} does not exist`, 404);
    throw err;
  }
  const binary = looksBinary(clean, bytes);
  return { path: clean, data: binary ? bytes : new TextDecoder().decode(bytes), binary };
}

async function writeFileRaw(id: string, branch: string, rel: string, data: string | Uint8Array): Promise<string> {
  const { abs, rel: clean } = resolveInTree(id, branch, rel);
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (bytes.length > MAX_FILE_BYTES) throw new StoreError(`${clean} is larger than 20 MB`, 413);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return clean;
}

export async function writeFile(id: string, branch: string, rel: string, data: string | Uint8Array): Promise<string> {
  return withProjectLock(id, async () => {
    const p = await writeFileRaw(id, branch, rel, data);
    await touch(id);
    return p;
  });
}

export async function deleteFile(id: string, branch: string, rel: string): Promise<void> {
  return withProjectLock(id, async () => {
    const { abs, rel: clean } = resolveInTree(id, branch, rel);
    const st = await fs.lstat(abs).catch(() => undefined);
    if (!st) throw new StoreError(`${clean} does not exist`, 404);
    await fs.rm(abs, { recursive: st.isDirectory(), force: true });
    await pruneEmptyDirs(treeDir(id, branch), path.dirname(abs));
    await touch(id);
  });
}

export async function renameFile(id: string, branch: string, from: string, to: string): Promise<string> {
  return withProjectLock(id, async () => {
    const a = resolveInTree(id, branch, from);
    const b = resolveInTree(id, branch, to);
    if (!(await fs.lstat(a.abs).catch(() => undefined))) throw new StoreError(`${a.rel} does not exist`, 404);
    if (await fs.lstat(b.abs).catch(() => undefined)) throw new StoreError(`${b.rel} already exists`, 409);
    await fs.mkdir(path.dirname(b.abs), { recursive: true });
    await fs.rename(a.abs, b.abs);
    await pruneEmptyDirs(treeDir(id, branch), path.dirname(a.abs));
    await touch(id);
    return b.rel;
  });
}

async function pruneEmptyDirs(root: string, dir: string): Promise<void> {
  let cur = dir;
  while (cur.startsWith(root + path.sep)) {
    const entries = await fs.readdir(cur).catch(() => ["x"]);
    if (entries.length > 0) return;
    await fs.rmdir(cur).catch(() => undefined);
    cur = path.dirname(cur);
  }
}

/**
 * Makes the branch tree match `next` exactly (for tracked files): writes what
 * changed, deletes what disappeared. Ignored directories (node_modules) are
 * left alone. Returns the paths that changed.
 */
export async function applyFileMap(id: string, branch: string, next: FileMap): Promise<string[]> {
  return withProjectLock(id, async () => {
    const current = await readTree(id, branch);
    const changed: string[] = [];
    for (const [p, data] of next) {
      const before = current.get(p);
      const same =
        before !== undefined &&
        (typeof before === "string" && typeof data === "string" ? before === data : sha(toBytes(before)) === sha(toBytes(data)));
      if (!same) {
        await writeFileRaw(id, branch, p, data);
        changed.push(p);
      }
    }
    for (const p of current.keys()) {
      if (!next.has(p)) {
        const { abs } = resolveInTree(id, branch, p);
        await fs.rm(abs, { force: true });
        await pruneEmptyDirs(treeDir(id, branch), path.dirname(abs));
        changed.push(p);
      }
    }
    if (changed.length) await touch(id);
    return changed.sort();
  });
}

function toBytes(d: string | Uint8Array): Uint8Array {
  return typeof d === "string" ? new TextEncoder().encode(d) : d;
}

// ------------------------------------------------------------ snapshots

async function manifestOf(id: string, branch: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const e of await walkTree(treeDir(id, branch))) {
    if (e.size > MAX_FILE_BYTES) continue;
    files[e.rel] = await putBlob(new Uint8Array(await fs.readFile(e.abs)));
  }
  return files;
}

export async function listSnapshots(id: string, branch?: string): Promise<SnapshotInfo[]> {
  const dir = path.join(projectDir(id), "snapshots");
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const infos: SnapshotInfo[] = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const m = await readJson<SnapshotManifest>(path.join(dir, n));
    if (branch && m.branch !== branch) continue;
    const { files: _f, ...info } = m;
    void _f;
    infos.push(info);
  }
  return infos.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSnapshot(id: string, snapshotId: string): Promise<SnapshotManifest> {
  validId(snapshotId);
  try {
    return await readJson<SnapshotManifest>(path.join(projectDir(id), "snapshots", `${snapshotId}.json`));
  } catch {
    throw new StoreError("Snapshot not found", 404);
  }
}

/** Records the branch's current state. Returns the previous snapshot unchanged if nothing differs. */
export async function createSnapshot(
  id: string,
  branch: string,
  opts: { label: string; reason: SnapshotInfo["reason"]; runId?: string; force?: boolean },
): Promise<SnapshotInfo> {
  const files = await manifestOf(id, branch);
  const [latest] = await listSnapshots(id, branch);
  if (latest && !opts.force) {
    const prev = await getSnapshot(id, latest.id);
    if (sameManifest(prev.files, files)) return latest;
  }
  const snap: SnapshotManifest = {
    id: newId("s"),
    branch,
    createdAt: Date.now(),
    label: opts.label.slice(0, 200),
    reason: opts.reason,
    parent: latest?.id,
    fileCount: Object.keys(files).length,
    runId: opts.runId,
    files,
  };
  await writeJson(path.join(projectDir(id), "snapshots", `${snap.id}.json`), snap);
  const { files: _f, ...info } = snap;
  void _f;
  return info;
}

function sameManifest(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export async function snapshotFileMap(id: string, snapshotId: string): Promise<FileMap> {
  const snap = await getSnapshot(id, snapshotId);
  const map: FileMap = new Map();
  for (const [p, h] of Object.entries(snap.files)) {
    const bytes = await getBlob(h);
    map.set(p, looksBinary(p, bytes) ? bytes : new TextDecoder().decode(bytes));
  }
  return map;
}

/** Restores a snapshot onto a branch. The current state is snapshotted first, so restore is undoable. */
export async function restoreSnapshot(id: string, branch: string, snapshotId: string): Promise<{ before: SnapshotInfo; changed: string[] }> {
  const target = await snapshotFileMap(id, snapshotId);
  const before = await createSnapshot(id, branch, { label: "Before restore", reason: "before-restore" });
  const changed = await applyFileMap(id, branch, target);
  return { before, changed };
}

/** Current file hashes of a branch, for diffing against snapshots. */
export async function currentManifest(id: string, branch: string): Promise<Record<string, string>> {
  return manifestOf(id, branch);
}

// ------------------------------------------------------------ branches

export async function listBranches(id: string): Promise<BranchInfo[]> {
  const dir = path.join(projectDir(id), "branches");
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out: BranchInfo[] = [];
  for (const n of names) {
    const info = await readJson<BranchInfo>(path.join(dir, n, "branch.json"), { name: n, createdAt: 0 });
    out.push(info);
  }
  return out.sort((a, b) => (a.name === "main" ? -1 : b.name === "main" ? 1 : a.createdAt - b.createdAt));
}

export async function createBranch(
  id: string,
  name: string,
  from: { branch?: string; snapshot?: string },
  extra: Pick<BranchInfo, "label" | "forgeBatch"> = {},
): Promise<BranchInfo> {
  validBranchName(name);
  const exists = await fs.access(treeDir(id, name)).then(() => true, () => false);
  if (exists) throw new StoreError(`Branch ${name} already exists`, 409);
  const files = from.snapshot ? await snapshotFileMap(id, from.snapshot) : await readTree(id, from.branch ?? "main");
  await fs.mkdir(treeDir(id, name), { recursive: true });
  for (const [p, d] of files) await writeFileRaw(id, name, p, d);
  const info: BranchInfo = { name, createdAt: Date.now(), createdFrom: from, ...extra };
  await writeJson(path.join(projectDir(id), "branches", name, "branch.json"), info);
  await createSnapshot(id, name, { label: `Branched from ${from.snapshot ? `snapshot ${from.snapshot}` : from.branch}`, reason: "branch", force: true });
  return info;
}

export async function deleteBranch(id: string, name: string): Promise<void> {
  if (name === "main") throw new StoreError("The main branch cannot be deleted", 400);
  const meta = await getProject(id);
  if (meta.activeBranch === name) await updateProject(id, { activeBranch: "main" });
  await fs.rm(path.join(projectDir(id), "branches", validBranchName(name)), { recursive: true, force: true });
}

// ------------------------------------------------------------ memory & chat

export async function getMemory(id: string): Promise<ProjectMemory> {
  return { ...EMPTY_MEMORY, ...(await readJson<ProjectMemory>(path.join(projectDir(id), "memory.json"), EMPTY_MEMORY)) };
}

export async function setMemory(id: string, memory: ProjectMemory): Promise<ProjectMemory> {
  const clean: ProjectMemory = {
    goals: memory.goals.slice(0, 50).map((s) => String(s).slice(0, 500)),
    architecture: memory.architecture.slice(0, 80).map((s) => String(s).slice(0, 500)),
    decisions: memory.decisions.slice(-200).map((d) => ({ at: Number(d.at) || Date.now(), text: String(d.text).slice(0, 500) })),
    knownBugs: memory.knownBugs.slice(0, 80).map((s) => String(s).slice(0, 500)),
    designSystem: memory.designSystem.slice(0, 80).map((s) => String(s).slice(0, 500)),
    preferences: memory.preferences.slice(0, 80).map((s) => String(s).slice(0, 500)),
    notes: memory.notes.slice(0, 80).map((s) => String(s).slice(0, 500)),
  };
  await writeJson(path.join(projectDir(id), "memory.json"), clean);
  return clean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  runId?: string;
}

export async function getChat(id: string, branch: string): Promise<ChatMessage[]> {
  return readJson<ChatMessage[]>(path.join(projectDir(id), "chat", `${validBranchName(branch)}.json`), []);
}

export async function appendChat(id: string, branch: string, msg: Omit<ChatMessage, "id" | "at">): Promise<ChatMessage> {
  const file = path.join(projectDir(id), "chat", `${validBranchName(branch)}.json`);
  const list = await readJson<ChatMessage[]>(file, []);
  const full: ChatMessage = { ...msg, id: newId("m"), at: Date.now() };
  list.push(full);
  await writeJson(file, list.slice(-400));
  return full;
}

export async function saveRunRecord(id: string, runId: string, record: unknown): Promise<void> {
  await writeJson(path.join(projectDir(id), "runs", `${validId(runId)}.json`), record);
}

export async function listRunRecords(id: string, limit = 20): Promise<unknown[]> {
  const dir = path.join(projectDir(id), "runs");
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  const recs = await Promise.all(names.map((n) => readJson<{ startedAt?: number }>(path.join(dir, n)).catch(() => undefined)));
  return recs
    .filter((r): r is { startedAt?: number } => !!r)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    .slice(0, limit);
}
