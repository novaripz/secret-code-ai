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
// contains its own buttons (the ⋯ menu), and a button inside a button is
// invalid HTML that browsers repair by breaking the layout.
//
// THE MENU, AND THE THREE WAYS INTO IT
//
// Right-click opens it. So does a long press, because a phone has no second
// button. So does the ⋯ button on every row, which is always drawn rather than
// revealed on hover — hover does not exist on a touch screen, and a control
// that only appears when a mouse is near it is a control half the school
// cannot see. Shift+F10 and the Menu key open it from the keyboard, and the
// entries that matter most also answer to their own keys on the focused row
// (F2, Delete, Ctrl D) and appear in the command palette. Nothing in the menu
// is only in the menu.

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { FileNode, Project } from "@/types";
import { getChildren } from "@/lib/fileSystem";
import { useStudioStore } from "@/store/useStudioStore";
import { ContextMenu, useLongPress, type ContextMenuRequest } from "@/components/build/ContextMenu";
import { buildEmptyMenu, buildFileMenu, buildFolderMenu, type MenuActionId } from "@/components/build/fileMenu";
import { useFileActions } from "@/components/build/useFileActions";
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  ChevronRightIcon,
  PlusFileIcon,
  PlusFolderIcon,
} from "@/components/icons";
import { UndoIcon } from "@/components/build/icons";

/** What a row hands upward when it wants a menu: the node, plus the bits of state only the row knows. */
interface MenuTarget {
  node: FileNode;
  expanded: boolean;
  collapse: () => void;
}

function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function TreeNode({
  project,
  node,
  depth,
  activePath,
  renamingPath,
  onRenaming,
  collapseNonce,
  onMenu,
}: {
  project: Project;
  node: FileNode;
  depth: number;
  activePath: string | null;
  renamingPath: string | null;
  onRenaming: (path: string | null) => void;
  /** Bumped by "Collapse all". A counter rather than a boolean, so the second collapse-all also lands. */
  collapseNonce: number;
  onMenu: (target: MenuTarget, x: number, y: number) => void;
}) {
  const { t } = useI18n();
  // Open state is stamped with the collapse-all counter it was set under.
  // "Collapse all" then works by making every folder's stamp stale, which is
  // one state change at the top instead of an effect in every row reacting to
  // a prop — and an effect that calls setState on render is exactly what React
  // now (rightly) refuses.
  const [openState, setOpenState] = useState({ open: depth < 1, nonce: 0 });
  const open = openState.nonce === collapseNonce && openState.open;
  const setOpen = (next: boolean | ((current: boolean) => boolean)) =>
    setOpenState({ open: typeof next === "function" ? next(open) : next, nonce: collapseNonce });

  // The half-typed name during an inline rename, remembered against the row it
  // belongs to so that starting a rename picks up the current name without an
  // effect having to copy it across.
  const [draft, setDraft] = useState<{ path: string; value: string } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const openFile = useStudioStore((s) => s.openFile);
  const renamePath = useStudioStore((s) => s.renamePath);
  const actions = useFileActions();

  const renaming = renamingPath === node.path;
  const draftName = draft && draft.path === node.path ? draft.value : node.name;
  const children = node.kind === "folder" ? getChildren(project, node.id) : [];
  const isActive = node.kind === "file" && node.path === activePath;
  // "Unsaved" here means the autosave timer has not fired yet. It is a second
  // or so, but a second in which a student can close the tab.
  const isDirty = useStudioStore((s) => s.tabs.some((t) => t.path === node.path && t.dirty));

  function openMenuAt(x: number, y: number) {
    onMenu({ node, expanded: open, collapse: () => setOpen(false) }, x, y);
  }

  /** The keyboard's way in, used when there is no pointer to take a coordinate from. */
  function openMenuFromRow() {
    const box = rowRef.current?.getBoundingClientRect();
    openMenuAt((box?.left ?? 0) + 24, (box?.bottom ?? 0));
  }

  const longPress = useLongPress(openMenuAt);

  function commitRename() {
    onRenaming(null);
    const trimmed = draftName.trim();
    setDraft(null);
    if (!trimmed || trimmed === node.name) return;
    const parent = node.path.split("/").slice(0, -1).join("/");
    try {
      renamePath(node.path, parent ? `${parent}/${trimmed}` : trimmed);
    } catch {
      // The full explanation belongs to the menu's rename, which uses the
      // dialog; inline renaming just declines and leaves the name as it was
      // rather than throwing a modal over a half-typed word.
    }
  }

  /** The row-level shortcuts, identical on files and folders so there is one thing to remember. */
  function onRowKeyDown(e: React.KeyboardEvent) {
    if (e.key === "F2") {
      e.preventDefault();
      onRenaming(node.path);
    } else if (e.key === "Delete") {
      e.preventDefault();
      void actions.remove(node.path);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      void actions.duplicate(node.path);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      openMenuFromRow();
    }
  }

  const nameField = (
    <input
      autoFocus
      className="bg-[var(--surface-2)] text-[var(--text)] text-sm px-1 rounded w-full outline-none ring-2 ring-[var(--accent)]"
      value={draftName}
      aria-label={`New name for ${node.name}`}
      onChange={(e) => setDraft({ path: node.path, value: e.target.value })}
      onBlur={commitRename}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") {
          setDraft(null);
          onRenaming(null);
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );

  const moreButton = (
    <button
      type="button"
      title={`More actions for ${node.name}`}
      aria-label={`More actions for ${node.name}`}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation();
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenuAt(box.left, box.bottom);
      }}
      className="tap-sq tap-pad inline-flex shrink-0 items-center justify-center rounded p-0.5 text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
    >
      <MoreIcon className="w-4 h-4" />
    </button>
  );

  if (node.kind === "folder") {
    return (
      <div>
        <div
          ref={rowRef}
          data-tree-row
          data-path={node.path}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={t("studio.folderLabel", { name: node.name })}
          className="group flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer select-none text-sm text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
          style={{ paddingLeft: depth * 12 + 6 }}
          onClick={() => {
            if (longPress.consumedClick()) return;
            setOpen((o) => !o);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenuAt(e.clientX, e.clientY);
          }}
          onTouchStart={longPress.onTouchStart}
          onTouchMove={longPress.onTouchMove}
          onTouchEnd={longPress.onTouchEnd}
          onTouchCancel={longPress.onTouchCancel}
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
            } else {
              onRowKeyDown(e);
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
            nameField
          ) : (
            <span className="truncate flex-1" onDoubleClick={(e) => { e.stopPropagation(); onRenaming(node.path); }}>
              {node.name}
            </span>
          )}
          {moreButton}
        </div>
        {open && children.map((child) => (
          <TreeNode
            key={child.id}
            project={project}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            renamingPath={renamingPath}
            onRenaming={onRenaming}
            collapseNonce={collapseNonce}
            onMenu={onMenu}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      data-tree-row
      data-path={node.path}
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
      onClick={() => {
        if (longPress.consumedClick()) return;
        openFile(node.path);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenuAt(e.clientX, e.clientY);
      }}
      onTouchStart={longPress.onTouchStart}
      onTouchMove={longPress.onTouchMove}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFile(node.path);
        } else {
          onRowKeyDown(e);
        }
      }}
    >
      {/* The active file gets a spine down its left edge: the tint alone is
          easy to lose against a busy theme, and some of the new ones are. */}
      {isActive && <span aria-hidden className="absolute left-0 h-5 w-0.5 rounded-r bg-[var(--accent)]" />}
      <FileIcon className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
      {renaming ? (
        nameField
      ) : (
        <span className="truncate flex-1" onDoubleClick={(e) => { e.stopPropagation(); onRenaming(node.path); }}>
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
      {moreButton}
    </div>
  );
}

export function FileExplorer({ project, activePath }: { project: Project; activePath: string | null }) {
  const { t } = useI18n();
  const treeRef = useRef<HTMLDivElement>(null);
  const actions = useFileActions();
  const lastDeleted = useStudioStore((s) => s.lastDeleted);
  const rootChildren = getChildren(project, project.rootId);

  const [menu, setMenu] = useState<ContextMenuRequest | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [collapseNonce, setCollapseNonce] = useState(0);

  /** One runner for every entry, whichever menu it came from. */
  function run(id: MenuActionId, target: MenuTarget | null) {
    const path = target?.node.path ?? "";
    const container = target ? actions.containerFor(path) : "";
    switch (id) {
      case "open":
        if (target?.node.kind === "file") useStudioStore.getState().openFile(path);
        break;
      case "rename":
        // The inline field, not the dialog, when we are in the tree: the
        // student can see the name they are changing in its own row.
        setRenamingPath(path);
        break;
      case "duplicate":
        void actions.duplicate(path);
        break;
      case "delete":
        void actions.remove(path);
        break;
      case "copyPath":
        void actions.copyPath(path);
        break;
      case "copyRelativePath":
        void actions.copyRelativePath(path);
        break;
      case "download":
        void actions.download(path);
        break;
      case "newFile":
        void actions.create("file", container);
        break;
      case "newFolder":
        void actions.create("folder", container);
        break;
      case "collapse":
        target?.collapse();
        break;
      case "collapseAll":
        setCollapseNonce((n) => n + 1);
        break;
    }
  }

  function openNodeMenu(target: MenuTarget, x: number, y: number) {
    setMenu({
      x,
      y,
      subject: target.node.name,
      items:
        target.node.kind === "folder"
          ? buildFolderMenu({ expanded: target.expanded })
          : buildFileMenu(),
      onRun: (id) => run(id, target),
    });
  }

  function openEmptyMenu(x: number, y: number) {
    setMenu({
      x,
      y,
      subject: project.name,
      items: buildEmptyMenu(),
      // No target: "new file" here means the top level of the project.
      onRun: (id) => run(id, null),
    });
  }

  const emptyLongPress = useLongPress(openEmptyMenu);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--line)]">
        <span className="text-xs font-semibold tracking-wide text-[var(--text-faint)] uppercase">{t("studio.yourFiles")}</span>
        <div className="flex items-center gap-1">
          <button
            title={t("studio.newFile")}
            aria-label={t("studio.newFile")}
            onClick={() => void actions.create("file", "")}
            className="tap-sq inline-flex items-center justify-center p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <PlusFileIcon className="w-4 h-4" />
          </button>
          <button
            title={t("studio.newFolder")}
            aria-label={t("studio.newFolder")}
            onClick={() => void actions.create("folder", "")}
            className="tap-sq inline-flex items-center justify-center p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <PlusFolderIcon className="w-4 h-4" />
          </button>
          <button
            title="More file actions"
            aria-label="More file actions"
            aria-haspopup="menu"
            onClick={(e) => {
              const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
              openEmptyMenu(box.left, box.bottom);
            }}
            className="tap-sq inline-flex items-center justify-center p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <MoreIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Arrow keys move between rows here rather than inside each row, because
          a row cannot know what comes after it in a tree it does not own. */}
      <div
        ref={treeRef}
        className="flex-1 overflow-y-auto py-1 px-1"
        onContextMenu={(e) => {
          // Only reached when the click missed every row, because rows stop the
          // event: this is the "empty space" menu.
          e.preventDefault();
          openEmptyMenu(e.clientX, e.clientY);
        }}
        onTouchStart={emptyLongPress.onTouchStart}
        onTouchMove={emptyLongPress.onTouchMove}
        onTouchEnd={emptyLongPress.onTouchEnd}
        onTouchCancel={emptyLongPress.onTouchCancel}
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
            <TreeNode
              key={child.id}
              project={project}
              node={child}
              depth={0}
              activePath={activePath}
              renamingPath={renamingPath}
              onRenaming={setRenamingPath}
              collapseNonce={collapseNonce}
              onMenu={openNodeMenu}
            />
          ))
        )}
      </div>

      {/* THE WAY BACK FROM A DELETE.
          Version history covers most mistakes, but it snapshots on a timer and
          folds nearby snapshots together, so a file made and then deleted in the
          same couple of minutes can fall through it entirely. This bar does not
          depend on any timer having fired, and it is a real button — reachable
          by tab, by thumb, and from the command palette as well. */}
      {lastDeleted && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--surface-1)] px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-dim)]">
            Deleted {lastDeleted.path.split("/").pop()}
          </span>
          <button
            type="button"
            onClick={() => actions.undoDelete()}
            className="tap inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--accent-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <UndoIcon className="h-3.5 w-3.5" />
            Undo
          </button>
        </div>
      )}

      <ContextMenu request={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
