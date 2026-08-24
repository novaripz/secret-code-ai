"use client";

import { useState } from "react";
import type { FileNode, Project } from "@/types";
import { getChildren, joinPath } from "@/lib/fileSystem";
import { useStudioStore } from "@/store/useStudioStore";
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
  const [open, setOpen] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  const openFile = useStudioStore((s) => s.openFile);
  const addFile = useStudioStore((s) => s.addFile);
  const addFolder = useStudioStore((s) => s.addFolder);
  const removeNode = useStudioStore((s) => s.removeNode);
  const renamePath = useStudioStore((s) => s.renamePath);

  const children = node.kind === "folder" ? getChildren(project, node.id) : [];
  const isActive = node.kind === "file" && node.path === activePath;

  function commitRename() {
    setRenaming(false);
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === node.name) return;
    const newPath = joinPath(node.path.split("/").slice(0, -1).join("/"), trimmed);
    try {
      renamePath(node.path, newPath);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function handleNewFile(e: React.MouseEvent) {
    e.stopPropagation();
    const name = prompt("Name this file (e.g. helpers.js):");
    if (!name) return;
    try {
      addFile(joinPath(node.path, name), "");
      setOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  function handleNewFolder(e: React.MouseEvent) {
    e.stopPropagation();
    const name = prompt("Name this folder:");
    if (!name) return;
    try {
      addFolder(joinPath(node.path, name));
      setOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${node.name}"? You can't undo this.`)) return;
    removeNode(node.path);
  }

  if (node.kind === "folder") {
    return (
      <div>
        <div
          className="group flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer select-none text-sm text-[var(--text-dim)]"
          style={{ paddingLeft: depth * 12 + 6 }}
          onClick={() => setOpen((o) => !o)}
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
            <button title="New file" onClick={handleNewFile} className="p-0.5 hover:bg-[var(--surface-3)] rounded">
              <PlusFileIcon className="w-3.5 h-3.5" />
            </button>
            <button title="New folder" onClick={handleNewFolder} className="p-0.5 hover:bg-[var(--surface-3)] rounded">
              <PlusFolderIcon className="w-3.5 h-3.5" />
            </button>
            <button title="Delete" onClick={handleDelete} className="p-0.5 hover:bg-[var(--surface-3)] rounded text-[var(--danger)]">
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
      className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer select-none text-sm ${
        isActive
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
      style={{ paddingLeft: depth * 12 + 22 }}
      onClick={() => openFile(node.path)}
    >
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
      <button
        title="Delete"
        onClick={handleDelete}
        className="hidden group-hover:block p-0.5 hover:bg-[var(--surface-3)] rounded text-[var(--danger)] shrink-0"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function FileExplorer({ project, activePath }: { project: Project; activePath: string | null }) {
  const addFile = useStudioStore((s) => s.addFile);
  const addFolder = useStudioStore((s) => s.addFolder);
  const rootChildren = getChildren(project, project.rootId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--line)]">
        <span className="text-xs font-semibold tracking-wide text-[var(--text-faint)] uppercase">Your Files</span>
        <div className="flex items-center gap-1">
          <button
            title="New file"
            onClick={() => {
              const name = prompt("Name this file (e.g. index.html):");
              if (name) {
                try {
                  addFile(name, "");
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                }
              }
            }}
            className="p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)]"
          >
            <PlusFileIcon className="w-4 h-4" />
          </button>
          <button
            title="New folder"
            onClick={() => {
              const name = prompt("Name this folder:");
              if (name) {
                try {
                  addFolder(name);
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                }
              }
            }}
            className="p-1 hover:bg-[var(--surface-2)] rounded text-[var(--text-dim)]"
          >
            <PlusFolderIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {rootChildren.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--text-faint)] leading-relaxed">
            No files yet. Make one, bring in a .zip, or just ask for help and I&apos;ll build the first files for you.
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
