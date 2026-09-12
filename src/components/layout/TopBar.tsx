"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { exportProjectToZip, importProjectFromZip } from "@/lib/zip";
import { saveProject } from "@/lib/storage";
import { useDialog } from "@/components/ui/Dialog";
import { useProfileStore } from "@/store/useProfileStore";
import {
  SaveIcon,
  DownloadIcon,
  UploadIcon,
  ChatIcon,
  SettingsIcon,
  MoonIcon,
  SunIcon,
} from "@/components/icons";

export function TopBar() {
  const { t, locale } = useI18n();
  const project = useStudioStore((s) => s.project);
  const setProject = useStudioStore((s) => s.setProject);
  const saving = useStudioStore((s) => s.saving);
  const lastSavedAt = useStudioStore((s) => s.lastSavedAt);
  const persist = useStudioStore((s) => s.persist);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialog = useDialog();
  const theme = useProfileStore((s) => s.theme);
  const toggleTheme = useProfileStore((s) => s.toggleTheme);
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
      await dialog.alert({
        title: t("studio.openFailed"),
        description: err instanceof Error ? err.message : t("studio.notAProject"),
      });
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
        <Link
          href="/build"
          title={t("studio.backToProjects")}
          className="flex items-center gap-2 shrink-0 text-[var(--text)] hover:opacity-80"
        >
          <span className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-sm font-bold text-[var(--accent-contrast)]">
            S
          </span>
          <span className="text-sm font-semibold hidden sm:inline">{t("studio.projects")}</span>
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
                title={t("studio.renameProject")}
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
            {saving
              ? t("studio.saving")
              : lastSavedAt
                ? t("studio.savedAt", { time: new Date(lastSavedAt).toLocaleTimeString(locale) })
                : ""}
          </span>
        )}
        <Link
          href="/"
          title={t("studio.openChat")}
          className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)]"
        >
          <ChatIcon className="w-4 h-4" />
        </Link>
        <Link
          href="/settings"
          title={t("nav.settings")}
          className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)]"
        >
          <SettingsIcon className="w-4 h-4" />
        </Link>
        <button
          onClick={toggleTheme}
          title={t(theme === "dark" ? "theme.switchToLight" : "theme.switchToDark")}
          className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)]"
        >
          {theme === "dark" ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
        </button>
        <span className="w-px h-5 bg-[var(--line)] mx-1" />
        <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleImportFile} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)]"
          title={t("studio.importTitle")}
        >
          <UploadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">{t("studio.import")}</span>
        </button>
        <button
          onClick={handleExport}
          disabled={!project}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-dim)] disabled:opacity-30"
          title={t("studio.exportTitle")}
        >
          <DownloadIcon className="w-4 h-4" />
          <span className="hidden sm:inline">{t("studio.export")}</span>
        </button>
        <button
          onClick={() => persist()}
          disabled={!project}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] font-medium disabled:opacity-30"
          title={t("studio.saveNow")}
        >
          <SaveIcon className="w-4 h-4" />
          <span className="hidden sm:inline">{t("action.save")}</span>
        </button>
      </div>
    </header>
  );
}
