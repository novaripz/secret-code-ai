import JSZip from "jszip";
import { createEmptyProject } from "@/lib/fileSystem";
import { createFile, createFolder } from "@/lib/fileSystem";
import { listAllFiles, getChildren } from "@/lib/fileSystem";
import type { Project } from "@/types";

export async function exportProjectToZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  for (const file of listAllFiles(project)) {
    zip.file(file.path, file.content ?? "");
  }
  // Preserve empty folders too.
  function walkFolders(folderId: string) {
    for (const child of getChildren(project, folderId)) {
      if (child.kind === "folder") {
        if (getChildren(project, child.id).length === 0) {
          zip.folder(child.path);
        }
        walkFolders(child.id);
      }
    }
  }
  walkFolders(project.rootId);
  return zip.generateAsync({ type: "blob" });
}

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "woff", "woff2", "ttf", "otf", "pdf", "zip", "mp4", "mp3",
]);

export async function importProjectFromZip(zipFile: File, projectName?: string): Promise<Project> {
  const zip = await JSZip.loadAsync(zipFile);
  const project = createEmptyProject(projectName || zipFile.name.replace(/\.zip$/i, ""));

  const entries = Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = entry.name.replace(/\/$/, "");
    if (!path) continue;
    if (entry.dir) {
      try {
        createFolder(project, path);
      } catch {
        // already exists via ensureFolderPath from a file — ignore
      }
      continue;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (BINARY_EXT.has(ext)) {
      // Skip binary assets — this is a text-code environment; note it as a stub so the tree stays intact.
      createFile(project, path, "");
      continue;
    }
    const content = await entry.async("string");
    createFile(project, path, content);
  }
  return project;
}
