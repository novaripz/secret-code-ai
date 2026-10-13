"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useStudioStore } from "@/store/useStudioStore";
import { isDarkTheme, useProfileStore } from "@/store/useProfileStore";
import { exportProjectToZip, importProjectFromZipDetailed } from "@/lib/zip";
import { saveProject } from "@/lib/storage";
import { useDialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/primitives";
import { PandaMark } from "@/components/Panda";
import {
  AlertIcon,
  ChatIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  DownloadIcon,
  KeyboardIcon,
  MoonIcon,
  MoreVerticalIcon,
  ResetIcon,
  SearchIcon,
  SettingsIcon,
  SlidersIcon,
  SpinnerIcon,
  SunIcon,
  UploadIcon,
} from "@/components/icons";
import { WORKSPACE_EVENTS, emit, modKey } from "@/components/build/events";
import { useWorkspaceLayout } from "@/components/build/useWorkspaceLayout";
import { useNow } from "@/components/build/useNow";
import { safeFileName, saveBlob } from "@/components/build/download";

// The workspace's top bar: where you are, whether your work is safe, and the
// few things that act on the whole project.
//
// There is no Save button any more. The project saves itself a moment after
// every change, and a Save button beside an autosave says "you might need to
// press this", which is the opposite of true. What the student needs instead
// is to SEE that it saved — so the status says Saving… and then Saved, and if
// a save ever fails it says that, in red, with a button to try again.

export function TopBar() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const project = useStudioStore((s) => s.project);
  const saveState = useStudioStore((s) => s.saveState);
  const lastSavedAt = useStudioStore((s) => s.lastSavedAt);
  const persist = useStudioStore((s) => s.persist);
  const renameProject = useStudioStore((s) => s.renameProject);
  const theme = useProfileStore((s) => s.theme);
  const toggleTheme = useProfileStore((s) => s.toggleTheme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialog = useDialog();
  const dark = isDarkTheme(theme);
  const mod = modKey();

  async function handleExport() {
    if (!project) return;
    saveBlob(await exportProjectToZip(project), `${safeFileName(project.name)}.zip`);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { project: imported, skipped } = await importProjectFromZipDetailed(file);
      await saveProject(imported);
      if (skipped.length > 0) {
        await dialog.alert({ title: t("topbar.importSkipped"), description: skipped.join("\n") });
      }
      // To the imported project's own address. Swapping the project in place
      // left the old project's URL in the bar, so a reload — or the Back
      // button — opened the wrong project.
      router.push(`/project/${imported.id}`);
    } catch (err) {
      await dialog.alert({
        title: t("studio.openFailed"),
        description: err instanceof Error ? err.message : t("studio.notAProject"),
      });
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-0)] px-2 sm:px-3">
      <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleImportFile} />

      <div className="flex min-w-0 flex-1 items-center gap-1 md:flex-none md:basis-[38%]">
        <Link
          href="/build"
          title={t("studio.backToProjects")}
          aria-label={t("studio.backToProjects")}
          className="tap-sq flex shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <PandaMark className="h-7 w-7" />
          <span className="hidden text-[13.5px] font-[var(--weight-ui)] lg:inline">{t("studio.projects")}</span>
        </Link>
        {project && (
          <>
            <ChevronRightIcon aria-hidden className="hidden h-4 w-4 shrink-0 text-[var(--text-faint)] sm:block" />
            <ProjectName key={project.id} name={project.name} onRename={renameProject} label={t("studio.renameProject")} />
            <SaveStatus
              state={saveState}
              savedTitle={lastSavedAt ? t("studio.savedAt", { time: new Date(lastSavedAt).toLocaleTimeString(locale) }) : t("topbar.savedTitle")}
              onRetry={() => void persist()}
            />
          </>
        )}
      </div>

      {/* The command centre: the palette, as a search field a student can see.
          Ctrl/Cmd-K is printed on it, which is how a shortcut gets learned. */}
      <div className="hidden min-w-0 flex-1 justify-center md:flex">
        <button
          type="button"
          onClick={() => emit(WORKSPACE_EVENTS.openPalette)}
          className="flex h-8 w-full max-w-[26rem] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-3 text-[13px] text-[var(--text-faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-dim)]"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t("topbar.search")}</span>
          <Kbd>{mod} K</Kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-0.5 md:basis-[38%]">
        <button
          type="button"
          onClick={() => emit(WORKSPACE_EVENTS.openPalette)}
          aria-label={t("topbar.search")}
          title={t("topbar.search")}
          className="icon-btn tap-sq md:hidden"
        >
          <SearchIcon />
        </button>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={!project}
          title={t("studio.exportTitle")}
          className="btn btn-ghost btn-sm hidden sm:inline-flex"
        >
          <DownloadIcon />
          <span className="hidden lg:inline">{t("studio.export")}</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t(dark ? "theme.switchToLight" : "theme.switchToDark")}
          title={t(dark ? "theme.switchToLight" : "theme.switchToDark")}
          className="icon-btn tap-sq"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <MoreMenu
          label={t("topbar.more")}
          items={[
            { label: t("topbar.importZip"), icon: <UploadIcon />, run: () => fileInputRef.current?.click() },
            { label: t("topbar.exportZip"), icon: <DownloadIcon />, run: () => void handleExport() },
            { separator: true, label: t("topbar.shortcuts"), icon: <KeyboardIcon />, keys: "?", run: () => emit(WORKSPACE_EVENTS.openShortcuts) },
            { label: t("topbar.editorSettings"), icon: <SlidersIcon />, keys: `${mod} ,`, run: () => emit(WORKSPACE_EVENTS.openSettings) },
            { label: t("topbar.resetLayout"), icon: <ResetIcon />, run: () => useWorkspaceLayout.getState().reset() },
            { separator: true, label: t("studio.openChat"), icon: <ChatIcon />, href: "/" },
            { label: t("nav.settings"), icon: <SettingsIcon />, href: "/settings" },
          ]}
        />
      </div>
    </header>
  );
}

/**
 * The project's name, renamed where it stands. Enter or leaving the field
 * keeps the new name; Escape puts the old one back — it used to keep the
 * half-typed one, because Escape blurred the field and blurring saved.
 */
function ProjectName({ name, onRename, label }: { name: string; onRename: (name: string) => void; label: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          cancelled.current = false;
          setEditing(true);
        }}
        title={label}
        className="tap min-w-0 truncate rounded-[var(--radius-sm)] px-2 py-1 text-[14px] font-[var(--weight-strong)] text-[var(--text)] hover:bg-[var(--surface-2)]"
      >
        {name}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      aria-label={label}
      maxLength={80}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (!cancelled.current) onRename(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="input !h-8 min-w-0 max-w-[16rem] !px-2 !text-[14px]"
    />
  );
}

function SaveStatus({ state, savedTitle, onRetry }: { state: string; savedTitle: string; onRetry: () => void }) {
  const { t } = useI18n();
  // Re-rendered every half minute so the tooltip's time and the label agree.
  useNow();
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="badge badge-danger tap ml-1 shrink-0 !h-6 cursor-pointer" title={t("topbar.retrySave")}>
        <AlertIcon />
        <span className="hidden sm:inline">{t("topbar.saveFailed")}</span>
      </button>
    );
  }
  const busy = state === "saving" || state === "unsaved";
  return (
    <span
      role="status"
      aria-live="polite"
      title={busy ? t("topbar.saving") : savedTitle}
      className={`ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] ${
        busy ? "text-[var(--text-faint)]" : "text-[var(--success)]"
      }`}
    >
      {busy ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <CircleCheckIcon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{busy ? t("topbar.saving") : t("topbar.saved")}</span>
    </span>
  );
}

interface MoreItem {
  label: string;
  icon: React.ReactNode;
  keys?: string;
  separator?: boolean;
  run?: () => void;
  href?: string;
}

function MoreMenu({ label, items }: { label: string; items: MoreItem[] }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => boxRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="icon-btn tap-sq"
      >
        <MoreVerticalIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="menu absolute right-0 top-full z-[60] mt-1.5 w-64"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const all = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
            const i = all.indexOf(document.activeElement as HTMLElement);
            all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
          }}
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separator && <div aria-hidden className="my-1 h-px bg-[var(--line)]" />}
              {item.href ? (
                <Link role="menuitem" href={item.href} className="menu-item tap" onClick={() => setOpen(false)}>
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item tap"
                  onClick={() => {
                    setOpen(false);
                    item.run?.();
                  }}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.keys && <span className="ide-mono text-[11px] text-[var(--text-faint)]">{item.keys}</span>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
