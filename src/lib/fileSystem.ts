import { nanoid } from "nanoid";
import type { FileNode, Project } from "@/types";
import { assertSafePath, fileName, joinPath, parentPath } from "./paths";

export function createEmptyProject(name: string): Project {
  const now = Date.now();
  const rootId = "root";
  const root: FileNode = {
    id: rootId,
    name: "",
    kind: "folder",
    path: "",
    parentId: null,
    createdAt: now,
    updatedAt: now,
  };
  return {
    id: nanoid(12),
    name,
    createdAt: now,
    updatedAt: now,
    rootId,
    files: { [rootId]: root },
  };
}

/** Returns children of a folder id, sorted folders-first then alphabetically. */
export function getChildren(project: Project, folderId: string): FileNode[] {
  return Object.values(project.files)
    .filter((f) => f.parentId === folderId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function findByPath(project: Project, path: string): FileNode | undefined {
  const normalized = path.trim();
  return Object.values(project.files).find((f) => f.path === normalized);
}

function ensureUniqueName(project: Project, parentId: string, name: string, kind: "file" | "folder"): void {
  const siblings = getChildren(project, parentId);
  if (siblings.some((s) => s.name === name && s.kind === kind)) {
    throw new Error(`"${name}" already exists in this folder.`);
  }
}

/** Ensures every folder segment in a path exists, creating them as needed. Returns the immediate parent folder id. */
export function ensureFolderPath(project: Project, folderPath: string): string {
  if (!folderPath) return project.rootId;
  const segments = folderPath.split("/").filter(Boolean);
  let parentId = project.rootId;
  let currentPath = "";
  for (const seg of segments) {
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;
    let existing = Object.values(project.files).find(
      (f) => f.path === currentPath && f.kind === "folder"
    );
    if (!existing) {
      const now = Date.now();
      existing = {
        id: nanoid(12),
        name: seg,
        kind: "folder",
        path: currentPath,
        parentId,
        createdAt: now,
        updatedAt: now,
      };
      project.files[existing.id] = existing;
    }
    parentId = existing.id;
  }
  return parentId;
}

export function createFile(project: Project, path: string, content = ""): FileNode {
  const safePath = assertSafePath(path);
  if (findByPath(project, safePath)) {
    throw new Error(`File already exists: "${safePath}"`);
  }
  const parentId = ensureFolderPath(project, parentPath(safePath));
  const name = fileName(safePath);
  ensureUniqueName(project, parentId, name, "file");
  const now = Date.now();
  const node: FileNode = {
    id: nanoid(12),
    name,
    kind: "file",
    path: safePath,
    parentId,
    content,
    createdAt: now,
    updatedAt: now,
  };
  project.files[node.id] = node;
  project.updatedAt = now;
  return node;
}

export function createFolder(project: Project, path: string): FileNode {
  const safePath = assertSafePath(path);
  if (findByPath(project, safePath)) {
    throw new Error(`Folder already exists: "${safePath}"`);
  }
  const parentId = ensureFolderPath(project, parentPath(safePath));
  const name = fileName(safePath);
  ensureUniqueName(project, parentId, name, "folder");
  const now = Date.now();
  const node: FileNode = {
    id: nanoid(12),
    name,
    kind: "folder",
    path: safePath,
    parentId,
    createdAt: now,
    updatedAt: now,
  };
  project.files[node.id] = node;
  project.updatedAt = now;
  return node;
}

export function updateFileContent(project: Project, path: string, content: string): FileNode {
  const node = findByPath(project, path);
  if (!node || node.kind !== "file") {
    throw new Error(`File not found: "${path}"`);
  }
  node.content = content;
  node.updatedAt = Date.now();
  project.updatedAt = node.updatedAt;
  return node;
}

/** Recursively collects a node and all descendants. */
function collectSubtree(project: Project, id: string): FileNode[] {
  const node = project.files[id];
  if (!node) return [];
  if (node.kind === "file") return [node];
  const children = Object.values(project.files).filter((f) => f.parentId === id);
  return [node, ...children.flatMap((c) => collectSubtree(project, c.id))];
}

export function deleteNode(project: Project, path: string): void {
  const node = findByPath(project, path);
  if (!node) throw new Error(`Not found: "${path}"`);
  if (node.id === project.rootId) throw new Error("Cannot delete project root.");
  const subtree = collectSubtree(project, node.id);
  for (const n of subtree) delete project.files[n.id];
  project.updatedAt = Date.now();
}

function retargetSubtreePaths(project: Project, node: FileNode, newPath: string, newName: string): void {
  const oldPath = node.path;
  node.path = newPath;
  node.name = newName;
  node.updatedAt = Date.now();
  if (node.kind === "folder") {
    const children = Object.values(project.files).filter((f) => f.parentId === node.id);
    for (const child of children) {
      const rel = child.path.slice(oldPath.length); // includes leading slash
      retargetSubtreePaths(project, child, `${newPath}${rel}`, child.name);
    }
  }
}

export function renameNode(project: Project, path: string, newPath: string): FileNode {
  const node = findByPath(project, path);
  if (!node) throw new Error(`Not found: "${path}"`);
  const safeNewPath = assertSafePath(newPath);
  if (findByPath(project, safeNewPath)) {
    throw new Error(`Target already exists: "${safeNewPath}"`);
  }
  const newParentPath = parentPath(safeNewPath);
  const newParentId = ensureFolderPath(project, newParentPath);
  const newName = fileName(safeNewPath);
  ensureUniqueName(project, newParentId, newName, node.kind);
  node.parentId = newParentId;
  retargetSubtreePaths(project, node, safeNewPath, newName);
  project.updatedAt = Date.now();
  return node;
}

/** Full path list of a folder id up to root, e.g. for breadcrumbs. */
export function pathSegments(project: Project, id: string): FileNode[] {
  const out: FileNode[] = [];
  let current: FileNode | undefined = project.files[id];
  while (current && current.id !== project.rootId) {
    out.unshift(current);
    current = current.parentId ? project.files[current.parentId] : undefined;
  }
  return out;
}

export function listAllFiles(project: Project): FileNode[] {
  return Object.values(project.files).filter((f) => f.kind === "file");
}

export function projectFileTreeText(project: Project): string {
  const lines: string[] = [];
  function walk(folderId: string, depth: number) {
    for (const child of getChildren(project, folderId)) {
      lines.push(`${"  ".repeat(depth)}${child.kind === "folder" ? "📁" : "📄"} ${child.name}`);
      if (child.kind === "folder") walk(child.id, depth + 1);
    }
  }
  walk(project.rootId, 0);
  return lines.join("\n") || "(empty project)";
}

export { joinPath };
