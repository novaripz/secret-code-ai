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
    const name = prompt("New file name (e.g. utils/helpers.ts):");
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
    const name = prompt("New folder name:");
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
    if (!confirm(`Delete "${node.name}"? This cannot be undone.`)) return;
    removeNode(node.path);
  }

  if (node.kind === "folder") {
    return (
      <div>
        <div
          className="group flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer select-none text-sm text-zinc-300"
          style={{ paddingLeft: depth * 12 + 6 }}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRightIcon className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          {open ? <FolderOpenIcon className="w-4 h-4 shrink-0 text-sky-400" /> : <FolderIcon className="w-4 h-4 shrink-0 text-sky-400" />}
          {renaming ? (
            <input
              autoFocus
              className="bg-zinc-800 text-zinc-100 text-sm px-1 rounded w-full outline-none ring-1 ring-sky-500"
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
            <button title="New file" onClick={handleNewFile} className="p-0.5 hover:bg-white/10 rounded">
              <PlusFileIcon className="w-3.5 h-3.5" />
            </button>
            <button title="New folder" onClick={handleNewFolder} className="p-0.5 hover:bg-white/10 rounded">
              <PlusFolderIcon className="w-3.5 h-3.5" />
            </button>
            <button title="Delete" onClick={handleDelete} className="p-0.5 hover:bg-white/10 rounded text-red-400">
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
      className={`group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer select-none text-sm ${
        isActive ? "bg-sky-500/15 text-sky-200" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      }`}
      style={{ paddingLeft: depth * 12 + 22 }}
      onClick={() => openFile(node.path)}
    >
      <FileIcon className="w-4 h-4 shrink-0 text-zinc-500" />
      {renaming ? (
        <input
          autoFocus
          className="bg-zinc-800 text-zinc-100 text-sm px-1 rounded w-full outline-none ring-1 ring-sky-500"
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
        className="hidden group-hover:block p-0.5 hover:bg-white/10 rounded text-red-400 shrink-0"
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            title="New file"
            onClick={() => {
              const name = prompt("New file name (e.g. index.html):");
              if (name) {
                try {
                  addFile(name, "");
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                }
              }
            }}
            className="p-1 hover:bg-white/10 rounded text-zinc-400"
          >
            <PlusFileIcon className="w-4 h-4" />
          </button>
          <button
            title="New folder"
            onClick={() => {
              const name = prompt("New folder name:");
              if (name) {
                try {
                  addFolder(name);
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                }
              }
            }}
            className="p-1 hover:bg-white/10 rounded text-zinc-400"
          >
            <PlusFolderIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {rootChildren.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            No files yet. Create one, import a zip, or ask the AI to build something.
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
