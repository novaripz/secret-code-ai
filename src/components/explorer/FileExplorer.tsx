"use client";

// The file tree, and the thing a student's hand reaches for most. Three
// affordances were missing and are added here: every row is reachable and
// operable from the keyboard (arrows to move, Enter to open, left/right to fold
// a folder), a file with unsaved edits says so with a dot rather than saving
// silently and hoping, and the row you are on is marked for focus as well as
// for selection — those are different questions and a tree that answers only
// the second one strands anyone not using a mouse.
//
// Rows stay div-with-role rather than real buttons because each one already
// contains its own buttons (new file, delete) and a button inside a button is
// invalid HTML that browsers repair by breaking the layout.

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { FileNode, Project } from "@/types";
import { getChildren, joinPath } from "@/lib/fileSystem";
import { useStudioStore } from "@/store/useStudioStore";
import { useDialog } from "@/components/ui/Dialog";
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  ChevronRightIcon,
  PlusFileIcon,
  PlusFolderIcon,
  TrashIcon,
} from "@/components/icons";

function TreeNode({
  project,
  node,
  depth,
  activePath,
}: {
  project: Project;
  node: FileNode;
  depth: number;
  activePath: string | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  const openFile = useStudioStore((s) => s.openFile);
  const addFile = useStudioStore((s) => s.addFile);
  const addFolder = useStudioStore((s) => s.addFolder);
  const removeNode = useStudioStore((s) => s.removeNode);
  const renamePath = useStudioStore((s) => s.renamePath);
  const dialog = useDialog();

  const children = node.kind === "folder" ? getChildren(project, node.id) : [];
  const isActive = node.kind === "file" && node.path === activePath;
  // "Unsaved" here means the autosave timer has not fired yet. It is a second
  // or so, but a second in which a student can close the tab.
  const isDirty = useStudioStore((s) => s.tabs.some((t) => t.path === node.path && t.dirty));

  async function reportError(err: unknown) {
    await dialog.alert({
      title: t("studio.didntWork"),
      description: err instanceof Error ? err.message : String(err),
    });
  }

  async function commitRename() {
    setRenaming(false);
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === node.name) return;
    const newPath = joinPath(node.path.split("/").slice(0, -1).join("/"), trimmed);
    try {
      renamePath(node.path, newPath);
    } catch (err) {
      await reportError(err);
    }
  }

  async function handleNewFile(e: React.MouseEvent) {
    e.stopPropagation();
    const name = await dialog.prompt({
      title: t("studio.newFile"),
      description: t("studio.insideFolder", { name: node.name }),
      placeholder: "helpers.js",
      confirmLabel: t("studio.create"),
    });
    if (!name) return;
    try {
      addFile(joinPath(node.path, name), "");
      setOpen(true);
    } catch (err) {
      await reportError(err);
    }
  }

  async function handleNewFolder(e: React.MouseEvent) {
    e.stopPropagation();
    const name = await dialog.prompt({
      title: t("studio.newFolder"),
      description: t("studio.insideFolder", { name: node.name }),
      placeholder: "components",
      confirmLabel: t("studio.create"),
    });
    if (!name) return;
    try {
      addFolder(joinPath(node.path, name));
      setOpen(true);
    } catch (err) {
      await reportError(err);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await dialog.confirm({
      title: t("studio.deleteNode", { name: node.name }),
      description: t(node.kind === "folder" ? "studio.deleteFolderBody" : "studio.deleteFileBody"),
      confirmLabel: t("action.delete"),
      danger: true,
    });
    if (ok) removeNode(node.path);
  }

  if (node.kind === "folder") {
    return (
      <div>
        <div
          data-tree-row
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={t("studio.folderLabel", { name: node.name })}
          className="group flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer select-none text-sm text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
          style={{ paddingLeft: depth * 12 + 6 }}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            } else if (e.key === "ArrowRight" && !open) {
              e.preventDefault();
              setOpen(true);
            } else if (e.key === "ArrowLeft" && open) {
              e.preventDefault();
              setOpen(false);
            }
          }}
        >
          <ChevronRightIcon className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          {open ? (
            <FolderOpenIcon className="w-4 h-4 shrink-0 text-[var(--accent)]" />
          ) : (
            <FolderIcon className="w-4 h-4 shrink-0 text-[var(--accent)]" />
          )}
          {renaming ? (
            <input
              autoFocus
              className="bg-[var(--surface-2)] text-[var(--text)] text-sm px-1 rounded w-full outline-none ring-2 ring-[var(--accent)]"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}>
              {node.name}
            </span>
          )}
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button title={t("studio.newFile")} onClick={handleNewFile} className="tap-sq inline-flex items-center justify-center p-0.5 hover:bg-[var(--surface-3)] rounded">
              <PlusFileIcon className="w-3.5 h-3.5" />
            </button>
            <button title={t("studio.newFolder")} onClick={handleNewFolder} className="tap-sq inline-flex items-center justify-center p-0.5 hover:bg-[var(--surface-3)] rounded">
              <PlusFolderIcon className="w-3.5 h-3.5" />
            </button>
            <button title={t("action.delete")} onClick={handleDelete} className="tap-sq inline-flex items-center justify-center p-0.5 hover:bg-[var(--surface-3)] rounded text-[var(--danger)]">
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {open && children.map((child) => (
          <TreeNode key={child.id} project={project} node={child} depth={depth + 1} activePath={activePath} />
        ))}
      </div>
    );
  }

  return (
    <div
      data-tree-row
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      aria-label={isDirty ? t("studio.unsavedLabel", { name: node.name }) : node.name}
      className={`group relative flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer select-none text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] ${
        isActive
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] font-medium"
          : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
      style={{ paddingLeft: depth * 12 + 22 }}
      onClick={() => openFile(node.path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFile(node.path);
        }
      }}
    >
      {/* The active file gets a spine down its left edge: the tint alone is
          easy to lose against a busy theme, and some of the new ones are. */}
      {isActive && <span aria-hidden className="absolute left-0 h-5 w-0.5 rounded-r bg-[var(--accent)]" />}
      <FileIcon className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
      {renaming ? (
        <input
          autoFocus
          className="bg-[var(--surface-2)] text-[var(--text)] text-sm px-1 rounded w-full outline-none ring-2 ring-[var(--accent)]"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate flex-1" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}>
          {node.name}
        </span>
      )}
      {isDirty && (
        <span
          aria-hidden
          title={t("studio.unsaved")}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
        />
      )}
      <button
        title={t("action.delete")}
        onClick={handleDelete}
        className="tap-sq inline-flex items-center justify-center hidden group-hover:block p-0.5 hover:bg-[var(--surface-3)] rounded text-[var(--danger)] shrink-0"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function FileExplorer({ project, activePath }: { project: Project; activePath: string | null }) {
  const { t } = useI18n();
  const treeRef = useRef<HTMLDivElement>(null);
  const addFile = useStudioStore((s) => s.addFile);
  const addFolder = useStudioStore((s) => s.addFolder);
  const dialog = useDialog();
  const rootChildren = getChildren(project, project.rootId);

  /** Creates a file or folder at the project root, asking for a name in-app. */
  async function createAtRoot(kind: "file" | "folder") {
    const name = await dialog.prompt({
      title: t(kind === "file" ? "studio.newFile" : "studio.newFolder"),
      description: t("studio.atTopLevel"),
      placeholder: kind === "file" ? "index.html" : "images",
      confirmLabel: t("studio.create"),
    });
    if (!name) return;
    try {
      if (kind === "file") addFile(name, "");
      else addFolder(name);
    } catch (err) {
      await dialog.alert({
        title: t("studio.didntWork"),
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--line)]">
        <span className="text-xs font-semibold tracking-wide text-[var(--text-faint)] uppercase">{t("studio.yourFiles")}</span>
        <div className="flex items-center gap-1">
          <button
            title={t("studio.newFile")}
            onClick={() => void createAtRoot("file")}
            className="tap-sq inline-flex items-center justify-center p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)]"
          >
            <PlusFileIcon className="w-4 h-4" />
          </button>
          <button
            title={t("studio.newFolder")}
            onClick={() => void createAtRoot("folder")}
            className="tap-sq inline-flex items-center justify-center p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)]"
          >
            <PlusFolderIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Arrow keys move between rows here rather than inside each row, because
          a row cannot know what comes after it in a tree it does not own. */}
      <div
        ref={treeRef}
        className="flex-1 overflow-y-auto py-1 px-1"
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const rows = Array.from(
            treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? [],
          );
          const index = rows.indexOf(document.activeElement as HTMLElement);
          if (index === -1) return;
          e.preventDefault();
          const next = rows[index + (e.key === "ArrowDown" ? 1 : -1)];
          next?.focus();
        }}
      >
        {rootChildren.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--text-faint)] leading-relaxed">
            {t("studio.noFiles")}
          </div>
        ) : (
          rootChildren.map((child) => (
            <TreeNode key={child.id} project={project} node={child} depth={0} activePath={activePath} />
          ))
        )}
      </div>
    </div>
  );
}
