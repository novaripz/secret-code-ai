"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { exportProjectToZip, importProjectFromZip } from "@/lib/zip";
import { saveProject } from "@/lib/storage";
import { SaveIcon, DownloadIcon, UploadIcon } from "@/components/icons";

export function TopBar() {
  const project = useStudioStore((s) => s.project);
  const setProject = useStudioStore((s) => s.setProject);
  const saving = useStudioStore((s) => s.saving);
  const lastSavedAt = useStudioStore((s) => s.lastSavedAt);
  const persist = useStudioStore((s) => s.persist);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project?.name ?? "");

  async function handleExport() {
    if (!project) return;
    const blob = await exportProjectToZip(project);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "_") || "project"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const imported = await importProjectFromZip(file);
      await saveProject(imported);
      setProject(imported);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't open that file.");
    }
  }

  function commitRename() {
    setRenaming(false);
    if (!project || !name.trim() || name === project.name) return;
    const updated = { ...project, name: name.trim(), updatedAt: Date.now() };
    setProject(updated);
    saveProject(updated);
  }

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-3 border-b border-[var(--line)] bg-[var(--surface-0)]">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-2 shrink-0 text-[var(--text)] hover:opacity-80">
          <span className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold">
            B
          </span>
          <span className="text-sm font-semibold hidden sm:inline">Build</span>
        </Link>
        {project && (
          <>
            <span className="text-[var(--text-faint)]">/</span>
            {renaming ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => e.key === "Enter" && commitRename()}
                className="bg-[var(--surface-2)] text-sm text-[var(--text)] rounded-md px-2 py-1 outline-none ring-2 ring-[var(--accent)] min-w-0"
              />
            ) : (
              <button
                onClick={() => {
                  setName(project.name);
                  setRenaming(true);
                }}
                className="text-sm text-[var(--text)] font-medium truncate hover:underline"
                title="Rename this project"
              >
                {project.name}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {project && (
          <span className="text-[11px] text-[var(--text-faint)] mr-2 hidden md:inline">
            {saving ? "Saving…" : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : ""}
          </span>
        )}
        <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleImportFile} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)]"
          title="Bring in a project from a .zip file"
        >
          <UploadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Import</span>
        </button>
        <button
          onClick={handleExport}
          disabled={!project}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)] disabled:opacity-30"
          title="Download this project as a .zip file"
        >
          <DownloadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={() => persist()}
          disabled={!project}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] font-medium disabled:opacity-30"
          title="Save now"
        >
          <SaveIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>
    </header>
  );
}
