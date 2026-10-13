"use client";

// The file tree, and the thing a student's hand reaches for most. Every row is
// reachable and operable from the keyboard (arrows to move, Enter to open,
// left/right to fold a folder), a file with unsaved edits says so with a dot
// rather than saving silently and hoping, and the row you are on is marked for
// focus as well as for selection — those are different questions and a tree
// that answers only the second one strands anyone not using a mouse.
//
// Rows stay div-with-role rather than real buttons because each one already
// contains its own buttons (the ⋯ menu), and a button inside a button is
// invalid HTML that browsers repair by breaking the layout.
//
// THE MENU, AND THE THREE WAYS INTO IT
//
// Right-click opens it. So does a long press, because a phone has no second
// button. So does the ⋯ button on every row, which is always drawn rather than
// revealed on hover — hover does not exist on a touch screen. Shift+F10 and the
// Menu key open it from the keyboard, and the entries that matter most also
// answer to their own keys on the focused row (F2, Delete, Ctrl D) and appear
// in the command palette. Nothing in the menu is only in the menu.
//
// MOVING THINGS
//
// A row can be dragged onto a folder to move it there, or onto the empty space
// below the tree to move it to the top level. A folder held under a dragged
// row for a moment opens, so a deep move is one drag rather than three. Moves
// go through the same rules as a rename — a folder can never be dropped into
// itself — and a refusal is explained.

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { FileNode, Project } from "@/types";
import { getChildren, isInsideItself } from "@/lib/fileSystem";
import { parentPath } from "@/lib/paths";
import { useStudioStore } from "@/store/useStudioStore";
import { ContextMenu, useLongPress, type ContextMenuRequest } from "@/components/build/ContextMenu";
import { buildEmptyMenu, buildFileMenu, buildFolderMenu, type MenuActionId } from "@/components/build/fileMenu";
import { useFileActions } from "@/components/build/useFileActions";
import { FileTypeIcon } from "@/components/build/fileIcons";
import { PaneHeader } from "@/components/build/Pane";
import { WORKSPACE_EVENTS } from "@/components/build/events";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreIcon,
  PlusFileIcon,
  PlusFolderIcon,
  UndoIcon,
  UploadIcon,
} from "@/components/icons";
import { ChevronsDownUp } from "lucide-react";

/** The drag payload's type: our own, so a row is never mistaken for a file from the desktop. */
const ROW_TYPE = "application/x-panda-path";

/** What a row hands upward when it wants a menu: the node, plus the bits of state only the row knows. */
interface MenuTarget {
  node: FileNode;
  expanded: boolean;
}

interface TreeContext {
  project: Project;
  activePath: string | null;
  renamingPath: string | null;
  setRenamingPath: (path: string | null) => void;
  isOpen: (node: FileNode, depth: number) => boolean;
  setOpen: (path: string, open: boolean) => void;
  onMenu: (target: MenuTarget, x: number, y: number, fromTouch?: boolean) => void;
  dragging: string | null;
  setDragging: (path: string | null) => void;
}

/** Every folder above a path, nearest last: "a/b/c.js" → ["a", "a/b"]. */
function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

function TreeNode({ node, depth, ctx }: { node: FileNode; depth: number; ctx: TreeContext }) {
  const { t } = useI18n();
  const { project, activePath, renamingPath, setRenamingPath, onMenu, dragging, setDragging } = ctx;
  const open = node.kind === "folder" && ctx.isOpen(node, depth);

  // The half-typed name during an inline rename, and why the last attempt was
  // refused — said under the field rather than swallowed. Inline rename used
  // to fail silently on a duplicate name, and the student retyped it three
  // times before giving up.
  const [draft, setDraft] = useState<{ path: string; value: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const openFile = useStudioStore((s) => s.openFile);
  const renamePath = useStudioStore((s) => s.renamePath);
  const actions = useFileActions();

  const renaming = renamingPath === node.path;
  const draftName = draft && draft.path === node.path ? draft.value : node.name;
  const children = node.kind === "folder" ? getChildren(project, node.id) : [];
  const isActive = node.kind === "file" && node.path === activePath;
  // "Unsaved" here means the autosave has not written it yet. It is a second
  // or so, but a second in which a student can close the tab.
  const isDirty = useStudioStore((s) => s.tabs.some((tab) => tab.path === node.path && tab.dirty));

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  function openMenuAt(x: number, y: number, fromTouch = false) {
    onMenu({ node, expanded: open }, x, y, fromTouch);
  }

  /** The keyboard's way in, used when there is no pointer to take a coordinate from. */
  function openMenuFromRow() {
    const box = rowRef.current?.getBoundingClientRect();
    openMenuAt((box?.left ?? 0) + 24, box?.bottom ?? 0);
  }

  const longPress = useLongPress((x, y) => openMenuAt(x, y, true));

  function cancelRename() {
    setDraft(null);
    setRenameError(null);
    setRenamingPath(null);
  }

  function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === node.name) {
      cancelRename();
      return;
    }
    const parent = parentPath(node.path);
    try {
      renamePath(node.path, parent ? `${parent}/${trimmed}` : trimmed);
      cancelRename();
    } catch (err) {
      // The field stays open with the reason under it, so the student can fix
      // the one character that was wrong instead of starting again.
      setRenameError(err instanceof Error ? err.message : String(err));
    }
  }

  /** The row-level shortcuts, identical on files and folders so there is one thing to remember. */
  function onRowKeyDown(e: React.KeyboardEvent) {
    if (e.key === "F2") {
      e.preventDefault();
      setRenamingPath(node.path);
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

  // DRAGGING: this row as the thing moved, and (for a folder) as where it goes.
  const canDropHere =
    node.kind === "folder" && dragging !== null && !isInsideItself(dragging, node.path) && parentPath(dragging) !== node.path;

  const dragProps = {
    draggable: !renaming,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(ROW_TYPE, node.path);
      e.dataTransfer.setData("text/plain", node.path);
      e.dataTransfer.effectAllowed = "move";
      setDragging(node.path);
    },
    onDragEnd: () => setDragging(null),
  };

  const dropProps =
    node.kind === "folder"
      ? {
          onDragOver: (e: React.DragEvent) => {
            const fromDesktop = e.dataTransfer.types.includes("Files");
            if (!canDropHere && !fromDesktop) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = fromDesktop ? "copy" : "move";
            if (!dropHover) {
              setDropHover(true);
              // Held over a closed folder: open it, so the drop can go deeper.
              if (!open && !hoverTimer.current) {
                hoverTimer.current = setTimeout(() => {
                  hoverTimer.current = null;
                  ctx.setOpen(node.path, true);
                }, 650);
              }
            }
          },
          onDragLeave: (e: React.DragEvent) => {
            // Moving between the row's own icon and label is not leaving it.
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDropHover(false);
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
          },
          onDrop: (e: React.DragEvent) => {
            setDropHover(false);
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
            const moved = e.dataTransfer.getData(ROW_TYPE);
            if (moved) {
              e.preventDefault();
              e.stopPropagation();
              setDragging(null);
              ctx.setOpen(node.path, true);
              void actions.move(moved, node.path);
            } else if (e.dataTransfer.files?.length) {
              e.preventDefault();
              e.stopPropagation();
              ctx.setOpen(node.path, true);
              void actions.addAssets(e.dataTransfer.files, node.path);
            }
          },
        }
      : {};

  const nameField = (
    <span className="relative min-w-0 flex-1">
      <input
        autoFocus
        className="input !h-7 !rounded-md !px-1.5 text-sm"
        value={draftName}
        aria-label={t("explorer.renameLabel", { name: node.name })}
        aria-invalid={renameError ? true : undefined}
        onChange={(e) => {
          setDraft({ path: node.path, value: e.target.value });
          setRenameError(null);
        }}
        onFocus={(e) => {
          // The name is selected without its extension, so typing replaces
          // "script" and keeps ".js" — the part students forget to retype.
          const dot = e.currentTarget.value.lastIndexOf(".");
          if (node.kind === "file" && dot > 0) e.currentTarget.setSelectionRange(0, dot);
          else e.currentTarget.select();
        }}
        onBlur={() => (renameError ? cancelRename() : commitRename())}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") cancelRename();
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {renameError && (
        <span role="alert" className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-[12px] leading-snug text-[var(--danger)] shadow-[var(--shadow-2)]">
          {renameError}
        </span>
      )}
    </span>
  );

  const moreButton = (
    <button
      type="button"
      title={t("explorer.moreFor", { name: node.name })}
      aria-label={t("explorer.moreFor", { name: node.name })}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation();
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenuAt(box.left, box.bottom);
      }}
      className="tap-sq tap-pad inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-faint)] opacity-60 hover:bg-[var(--surface-3)] hover:text-[var(--text)] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
    >
      <MoreIcon className="h-4 w-4" />
    </button>
  );

  const rowBase =
    "group relative flex min-h-8 cursor-pointer select-none items-center gap-1.5 rounded-md pr-1 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]";
  const indent = { paddingLeft: depth * 14 + 6 };
  const dragged = dragging === node.path ? "opacity-50" : "";

  if (node.kind === "folder") {
    return (
      <div role="none">
        <div
          ref={rowRef}
          data-tree-row
          data-path={node.path}
          role="treeitem"
          aria-level={depth + 1}
          tabIndex={0}
          aria-expanded={open}
          aria-selected={false}
          aria-label={t("studio.folderLabel", { name: node.name })}
          className={`${rowBase} ${dragged} text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] ${
            dropHover && canDropHere ? "ide-drop-target" : ""
          }`}
          style={indent}
          onClick={() => {
            if (longPress.consumedClick()) return;
            ctx.setOpen(node.path, !open);
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
              ctx.setOpen(node.path, !open);
            } else if (e.key === "ArrowRight" && !open) {
              e.preventDefault();
              ctx.setOpen(node.path, true);
            } else if (e.key === "ArrowLeft" && open) {
              e.preventDefault();
              ctx.setOpen(node.path, false);
            } else {
              onRowKeyDown(e);
            }
          }}
          {...dragProps}
          {...dropProps}
        >
          <ChevronRightIcon
            className={`h-3.5 w-3.5 shrink-0 text-[var(--text-faint)] transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          />
          {open ? (
            <FolderOpenIcon className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />
          ) : (
            <FolderIcon className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />
          )}
          {renaming ? (
            nameField
          ) : (
            <span
              className="min-w-0 flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenamingPath(node.path);
              }}
            >
              {node.name}
            </span>
          )}
          {!renaming && moreButton}
        </div>
        {open && (
          <div role="group">
            {children.map((child) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} ctx={ctx} />
            ))}
            {children.length === 0 && (
              <p className="py-1 text-[12px] italic text-[var(--text-faint)]" style={{ paddingLeft: (depth + 1) * 14 + 28 }}>
                {t("explorer.emptyFolder")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      data-tree-row
      data-path={node.path}
      role="treeitem"
      aria-level={depth + 1}
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      aria-selected={isActive}
      aria-label={isDirty ? t("studio.unsavedLabel", { name: node.name }) : node.name}
      className={`${rowBase} ${dragged} ${
        isActive
          ? "bg-[var(--accent-soft)] font-[var(--weight-ui)] text-[var(--text)]"
          : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
      style={{ paddingLeft: depth * 14 + 26 }}
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
      {...dragProps}
    >
      {/* The active file gets a spine down its left edge: the tint alone is
          easy to lose against a busy theme. */}
      {isActive && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[var(--accent)]" />}
      <FileTypeIcon path={node.path} className="h-4 w-4" />
      {renaming ? (
        nameField
      ) : (
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setRenamingPath(node.path);
          }}
        >
          {node.name}
        </span>
      )}
      {isDirty && !renaming && (
        <span aria-hidden title={t("studio.unsaved")} className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-text)]" />
      )}
      {!renaming && moreButton}
    </div>
  );
}

export function FileExplorer({
  project,
  activePath,
  onClose,
}: {
  project: Project;
  activePath: string | null;
  /** When given, the header carries a close button. */
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const treeRef = useRef<HTMLDivElement>(null);
  const actions = useFileActions();
  const lastDeleted = useStudioStore((s) => s.lastDeleted);
  const rootChildren = getChildren(project, project.rootId);

  const [menu, setMenu] = useState<ContextMenuRequest | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [rootDrop, setRootDrop] = useState(false);
  // Folders the student opened or closed themselves. Anything not in here
  // follows the default: top-level folders open, and every folder on the way
  // to the open file open, so the file you are editing is always findable.
  const [choices, setChoices] = useState<Map<string, boolean>>(() => new Map());
  const assetInputRef = useRef<HTMLInputElement>(null);
  // Counted rather than boolean: dragenter/dragleave fire for every child
  // element the pointer crosses, so a plain flag flickers off the moment the
  // cursor moves between two rows inside the same drop zone.
  const [desktopDragDepth, setDesktopDragDepth] = useState(0);

  const activeAncestors = useMemo(() => new Set(activePath ? ancestors(activePath) : []), [activePath]);

  const ctx: TreeContext = {
    project,
    activePath,
    renamingPath,
    setRenamingPath,
    isOpen: (node, depth) => choices.get(node.path) ?? (depth === 0 || activeAncestors.has(node.path)),
    setOpen: (path, open) =>
      setChoices((prev) => {
        const next = new Map(prev);
        next.set(path, open);
        return next;
      }),
    onMenu: openNodeMenu,
    dragging,
    setDragging,
  };

  function collapseAll() {
    const next = new Map<string, boolean>();
    for (const node of Object.values(project.files)) if (node.kind === "folder" && node.path) next.set(node.path, false);
    setChoices(next);
  }

  // "Show this folder in my files", from the editor's breadcrumbs: every folder
  // on the way is opened, and the row is scrolled to and focused.
  useEffect(() => {
    function onReveal(e: Event) {
      const path = (e as CustomEvent<{ path: string }>).detail?.path;
      if (!path) return;
      setChoices((prev) => {
        const next = new Map(prev);
        for (const folder of [...ancestors(path), path]) next.set(folder, true);
        return next;
      });
      requestAnimationFrame(() => {
        const row = treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
        row?.scrollIntoView({ block: "nearest" });
        row?.focus();
      });
    }
    window.addEventListener(WORKSPACE_EVENTS.revealInTree, onReveal);
    return () => window.removeEventListener(WORKSPACE_EVENTS.revealInTree, onReveal);
  }, []);

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
        if (target) ctx.setOpen(target.node.path, false);
        break;
      case "collapseAll":
        collapseAll();
        break;
    }
  }

  function openNodeMenu(target: MenuTarget, x: number, y: number, fromTouch = false) {
    setMenu({
      x,
      y,
      fromTouch,
      subject: target.node.name,
      items: target.node.kind === "folder" ? buildFolderMenu({ expanded: target.expanded }) : buildFileMenu(),
      onRun: (id) => run(id, target),
    });
  }

  function openEmptyMenu(x: number, y: number, fromTouch = false) {
    setMenu({
      x,
      y,
      fromTouch,
      subject: project.name,
      items: buildEmptyMenu(),
      // No target: "new file" here means the top level of the project.
      onRun: (id) => run(id, null),
    });
  }

  const emptyLongPress = useLongPress((x, y) => openEmptyMenu(x, y, true));

  /**
   * A touch that started on a row belongs to that row. Touch events bubble, so
   * without this a long press on a file ran the row's timer AND the empty-space
   * timer, and the second one to fire replaced the file's menu with the
   * project's — the menu opened, and it was the wrong menu.
   */
  function onEmptyTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest("[data-tree-row]")) return;
    emptyLongPress.onTouchStart(e);
  }

  const canDropAtRoot = dragging !== null && parentPath(dragging) !== "";

  return (
    <div
      className="relative flex h-full flex-col bg-[var(--surface-0)]"
      // Dropping files from the computer anywhere in the panel adds them. The
      // whole panel rather than a dedicated strip, because a student dragging
      // a picture aims at "the files" and not at a target they must discover.
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDesktopDragDepth((d) => d + 1);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types.includes("Files")) setDesktopDragDepth((d) => Math.max(0, d - 1));
      }}
      onDrop={(e) => {
        setDesktopDragDepth(0);
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        void actions.addAssets(e.dataTransfer.files);
      }}
    >
      <input
        ref={assetInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void actions.addAssets(e.target.files ?? []);
          // Cleared so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />
      <PaneHeader
        title={t("explorer.title")}
        onClose={onClose}
        closeLabel={t("explorer.close")}
        actions={
          <>
            <HeaderButton label={t("studio.newFile")} onClick={() => void actions.create("file", "")}>
              <PlusFileIcon />
            </HeaderButton>
            <HeaderButton label={t("studio.newFolder")} onClick={() => void actions.create("folder", "")}>
              <PlusFolderIcon />
            </HeaderButton>
            <HeaderButton label={t("explorer.addFiles")} onClick={() => assetInputRef.current?.click()}>
              <UploadIcon />
            </HeaderButton>
            <HeaderButton label={t("explorer.collapseAll")} onClick={collapseAll}>
              <ChevronsDownUp aria-hidden="true" strokeWidth={1.85} />
            </HeaderButton>
          </>
        }
      />

      {/* Arrow keys move between rows here rather than inside each row, because
          a row cannot know what comes after it in a tree it does not own. */}
      <div
        ref={treeRef}
        role="tree"
        aria-label={t("explorer.title")}
        className={`min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 ${rootDrop && canDropAtRoot ? "ide-drop-target rounded-md" : ""}`}
        onContextMenu={(e) => {
          // Only reached when the click missed every row, because rows stop the
          // event: this is the "empty space" menu.
          e.preventDefault();
          openEmptyMenu(e.clientX, e.clientY);
        }}
        onTouchStart={onEmptyTouchStart}
        onTouchMove={emptyLongPress.onTouchMove}
        onTouchEnd={emptyLongPress.onTouchEnd}
        onTouchCancel={emptyLongPress.onTouchCancel}
        // Dropping a row on empty space moves it to the top level.
        onDragOver={(e) => {
          if (!canDropAtRoot || !e.dataTransfer.types.includes(ROW_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!rootDrop) setRootDrop(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setRootDrop(false);
        }}
        onDrop={(e) => {
          setRootDrop(false);
          const moved = e.dataTransfer.getData(ROW_TYPE);
          if (!moved) return;
          e.preventDefault();
          e.stopPropagation();
          setDragging(null);
          void actions.move(moved, "");
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const rows = Array.from(treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? []);
          const index = rows.indexOf(document.activeElement as HTMLElement);
          if (index === -1) return;
          e.preventDefault();
          rows[index + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
        }}
      >
        {rootChildren.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]">
              <FolderOpenIcon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-[var(--weight-strong)] text-[var(--text)]">{t("explorer.emptyTitle")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-dim)]">{t("studio.noFiles")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void actions.create("file", "")}>
                <PlusFileIcon /> {t("studio.newFile")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => assetInputRef.current?.click()}>
                <UploadIcon /> {t("explorer.addShort")}
              </button>
            </div>
          </div>
        ) : (
          rootChildren.map((child) => <TreeNode key={child.id} node={child} depth={0} ctx={ctx} />)
        )}
        {dragging && canDropAtRoot && (
          <p className="mt-2 rounded-md border border-dashed border-[var(--line-strong)] px-2 py-2 text-center text-[12px] text-[var(--text-faint)]">
            {t("explorer.dropToTop")}
          </p>
        )}
      </div>

      {/* Dropping files from the computer: a clear target over the whole tree. */}
      {desktopDragDepth > 0 && (
        <div className="pointer-events-none absolute inset-2 top-12 z-10 flex items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent-soft)_85%,transparent)]">
          <p className="flex items-center gap-2 text-sm font-[var(--weight-ui)] text-[var(--accent-text)]">
            <UploadIcon className="h-4 w-4" /> {t("explorer.dropHere")}
          </p>
        </div>
      )}

      {/* THE WAY BACK FROM A DELETE.
          Version history covers most mistakes, but it snapshots on a timer and
          folds nearby snapshots together, so a file made and then deleted in the
          same couple of minutes can fall through it entirely. This bar does not
          depend on any timer having fired, and it is a real button — reachable
          by tab, by thumb, and from the command palette as well. */}
      {lastDeleted && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--surface-1)] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-dim)]">
            {t("explorer.deleted", { name: lastDeleted.path.split("/").pop() ?? lastDeleted.path })}
          </span>
          <button type="button" onClick={() => actions.undoDelete()} className="btn btn-ghost btn-sm shrink-0 text-[var(--accent-text)]">
            <UndoIcon />
            {t("explorer.undo")}
          </button>
        </div>
      )}

      <ContextMenu request={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="icon-btn icon-btn-sm tap-sq tap-pad">
      {children}
    </button>
  );
}
