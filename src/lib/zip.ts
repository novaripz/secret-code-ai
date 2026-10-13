import JSZip from "jszip";
import { createEmptyProject } from "@/lib/fileSystem";
import { createFile, createFolder } from "@/lib/fileSystem";
import { listAllFiles, getChildren } from "@/lib/fileSystem";
import type { Project } from "@/types";
import {
  MAX_ASSET_BYTES,
  MAX_PROJECT_ASSET_BYTES,
  assetByteSize,
  assetMimeType,
  humanSize,
  isAssetNode,
} from "@/lib/assets";

/**
 * The whole project as a zip, or one folder of it when `folder` is given — in
 * which case paths inside the zip are relative to that folder, so "download
 * the images folder" unzips to the pictures rather than to images/images/.
 */
export async function exportProjectToZip(project: Project, folder = ""): Promise<Blob> {
  const zip = new JSZip();
  const prefix = folder ? `${folder}/` : "";
  const inside = (path: string) => !prefix || path.startsWith(prefix);
  const relative = (path: string) => path.slice(prefix.length);
  for (const file of listAllFiles(project)) {
    if (!inside(file.path)) continue;
    // An asset goes into the zip as the BYTES it represents, not as the data
    // URL it is stored as. A student who exports their game and opens
    // index.html from the folder has to get a picture, not a text file full of
    // base64 — the export is the one moment the project stops being a browser
    // database and becomes real files on a real disk.
    if (isAssetNode(file)) {
      const base64 = (file.content ?? "").slice((file.content ?? "").indexOf(",") + 1);
      zip.file(relative(file.path), base64, { base64: true });
    } else {
      zip.file(relative(file.path), file.content ?? "");
    }
  }
  // Preserve empty folders too.
  function walkFolders(folderId: string) {
    for (const child of getChildren(project, folderId)) {
      if (child.kind === "folder") {
        if (getChildren(project, child.id).length === 0 && inside(child.path)) {
          zip.folder(relative(child.path));
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

/**
 * Things an operating system writes into a zip that were never part of the
 * project. macOS adds a `__MACOSX/` shadow folder full of `._name` resource
 * forks and a `.DS_Store` in every folder; Windows adds `Thumbs.db` and
 * `desktop.ini`. Imported as files they cluttered the tree with names a
 * student had never seen and could not explain.
 */
export function isZipJunk(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.includes("__MACOSX")) return true;
  const name = segments[segments.length - 1];
  return name === ".DS_Store" || name === "Thumbs.db" || name === "desktop.ini" || name.startsWith("._");
}

/**
 * The one folder every entry sits inside, if there is one.
 *
 * Zipping a folder (which is what "Compress" and "Send to > Compressed folder"
 * both do) wraps the whole project in it, so `my-game.zip` arrived as a project
 * whose only entry was a folder called `my-game` — and the preview found no
 * index.html, because it was one level down. Stripping that wrapper is what
 * makes the obvious way of zipping a project the one that works.
 */
export function wrappingFolder(paths: string[]): string | null {
  const real = paths.filter((p) => !isZipJunk(p));
  if (real.length === 0) return null;
  const first = real[0].split("/")[0];
  // Every entry must be the folder itself or something under it, and at least
  // one thing must be under it — a zip holding a single loose file is not
  // wrapped in anything.
  const allInside = real.every((p) => p === first || p.startsWith(`${first}/`));
  const anyBelow = real.some((p) => p.startsWith(`${first}/`) && p.length > first.length + 1);
  return allInside && anyBelow ? first : null;
}

export interface ZipImport {
  project: Project;
  /** One line per file that was left out, with the reason, for the student. */
  skipped: string[];
}

export async function importProjectFromZip(zipFile: File, projectName?: string): Promise<Project> {
  return (await importProjectFromZipDetailed(zipFile, projectName)).project;
}

export async function importProjectFromZipDetailed(zipFile: File, projectName?: string): Promise<ZipImport> {
  const zip = await JSZip.loadAsync(zipFile);
  const project = createEmptyProject(projectName || zipFile.name.replace(/\.zip$/i, ""));
  const skipped: string[] = [];

  const entries = Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name));
  const wrapper = wrappingFolder(entries.map((e) => e.name.replace(/\/$/, "")));
  // The same limits the explorer enforces on a drop. Without them a zip was a
  // way around every cap there is: one archive could put a 40MB video into a
  // browser database on a laptop thirty students share.
  let assetBudget = MAX_PROJECT_ASSET_BYTES;

  for (const entry of entries) {
    let path = entry.name.replace(/\/$/, "");
    if (!path || isZipJunk(path)) continue;
    if (wrapper) {
      if (path === wrapper) continue;
      path = path.slice(wrapper.length + 1);
    }
    if (entry.dir) {
      try {
        createFolder(project, path);
      } catch {
        // already exists via ensureFolderPath from a file — ignore
      }
      continue;
    }
    try {
      await importEntry(entry, path);
    } catch (err) {
      // One unreadable or oddly named file costs that file, not the import.
      skipped.push(`${path} — ${err instanceof Error ? err.message : "it could not be read"}`);
    }
  }
  return { project, skipped };

  async function importEntry(entry: JSZip.JSZipObject, path: string): Promise<void> {
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
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const bytes = assetByteSize(dataUrl);
      if (bytes > MAX_ASSET_BYTES) {
        skipped.push(`${path} — ${humanSize(bytes)} is over the ${humanSize(MAX_ASSET_BYTES)} limit for one file.`);
        return;
      }
      if (bytes > assetBudget) {
        skipped.push(`${path} — the project had no room left for more pictures and sounds.`);
        return;
      }
      createFile(project, path, dataUrl, mimeType);
      assetBudget -= bytes;
      return;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (BINARY_EXT.has(ext)) {
      // Still a stub, but now only for binaries Panda genuinely cannot hold or
      // show -- a PDF, a nested zip. Read as text these become mojibake; kept
      // as an empty file the name survives, which at least tells the student
      // what was in the folder they imported.
      createFile(project, path, "");
      return;
    }
    const content = await entry.async("string");
    createFile(project, path, content);
  }
}
