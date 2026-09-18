import JSZip from "jszip";
import { createEmptyProject } from "@/lib/fileSystem";
import { createFile, createFolder } from "@/lib/fileSystem";
import { listAllFiles, getChildren } from "@/lib/fileSystem";
import type { Project } from "@/types";
import { assetMimeType, isAssetNode } from "@/lib/assets";

export async function exportProjectToZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  for (const file of listAllFiles(project)) {
    // An asset goes into the zip as the BYTES it represents, not as the data
    // URL it is stored as. A student who exports their game and opens
    // index.html from the folder has to get a picture, not a text file full of
    // base64 — the export is the one moment the project stops being a browser
    // database and becomes real files on a real disk.
    if (isAssetNode(file)) {
      const base64 = (file.content ?? "").slice((file.content ?? "").indexOf(",") + 1);
      zip.file(file.path, base64, { base64: true });
    } else {
      zip.file(file.path, file.content ?? "");
    }
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

/**
 * Binaries Panda cannot represent at all. The image/audio/video/font
 * extensions that used to be listed here now live in lib/assets.ts and are
 * imported for real; what is left is the set with nowhere to go.
 */
const BINARY_EXT = new Set(["pdf", "zip", "exe", "dmg", "class", "jar"]);

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
    // An asset comes back as bytes and is re-wrapped as a data URL, so a
    // project that round-trips through a zip keeps its pictures.
    //
    // This used to be the opposite. Every binary extension was imported as an
    // EMPTY file -- "this is a text-code environment" -- which was true when it
    // was written and stopped being true when assets became real. The symptom
    // was quiet and nasty: export a working game, import it again, and every
    // image is a zero-byte file with the right name, so the tree looks correct
    // and the page renders broken.
    const mimeType = assetMimeType(path);
    if (mimeType) {
      const base64 = await entry.async("base64");
      createFile(project, path, `data:${mimeType};base64,${base64}`, mimeType);
      continue;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (BINARY_EXT.has(ext)) {
      // Still a stub, but now only for binaries Panda genuinely cannot hold or
      // show -- a PDF, a nested zip. Read as text these become mojibake; kept
      // as an empty file the name survives, which at least tells the student
      // what was in the folder they imported.
      createFile(project, path, "");
      continue;
    }
    const content = await entry.async("string");
    createFile(project, path, content);
  }
  return project;
}
