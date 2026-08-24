"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { exportProjectToZip, importProjectFromZip } from "@/lib/zip";
import { saveProject } from "@/lib/storage";
import { SaveIcon, DownloadIcon, UploadIcon, SettingsIcon } from "@/components/icons";

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
      alert(err instanceof Error ? err.message : "Failed to import zip.");
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
    <header className="h-12 shrink-0 flex items-center justify-between px-3 border-b border-white/5 bg-zinc-950">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-1.5 shrink-0 text-zinc-300 hover:text-white">
          <span className="w-5 h-5 rounded bg-gradient-to-br from-sky-400 to-indigo-500" />
          <span className="text-sm font-semibold hidden sm:inline">Studio</span>
        </Link>
        {project && (
          <>
            <span className="text-zinc-700">/</span>
            {renaming ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => e.key === "Enter" && commitRename()}
                className="bg-white/5 text-sm text-zinc-100 rounded px-2 py-0.5 outline-none ring-1 ring-sky-500 min-w-0"
              />
            ) : (
              <button
                onClick={() => {
                  setName(project.name);
                  setRenaming(true);
                }}
                className="text-sm text-zinc-200 font-medium truncate hover:underline"
                title="Rename project"
              >
                {project.name}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {project && (
          <span className="text-[11px] text-zinc-600 mr-2 hidden md:inline">
            {saving ? "Saving…" : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : ""}
          </span>
        )}
        <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleImportFile} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-white/10 text-zinc-400"
          title="Import project from .zip"
        >
          <UploadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Import</span>
        </button>
        <button
          onClick={handleExport}
          disabled={!project}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-white/10 text-zinc-400 disabled:opacity-30"
          title="Export project as .zip"
        >
          <DownloadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={() => persist()}
          disabled={!project}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-zinc-200 disabled:opacity-30"
          title="Save now"
        >
          <SaveIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Save</span>
        </button>
        <button className="p-1.5 rounded-md hover:bg-white/10 text-zinc-500" title="Settings">
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
