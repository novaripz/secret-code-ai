"use client";

import { Box, ChevronDown, ChevronRight, Download, FileCode2, FileImage, FileJson, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { api } from "../api";
import { cx, formatBytes, toast, useDialog } from "../common/ui";
import { useLayout } from "../workspace/layout";
import { useWorkspace } from "../workspace/store";

interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
  size?: number;
}

function buildTree(paths: [string, number][]): TreeNode {
  const root: TreeNode = { name: "", path: "", dir: true, children: [] };
  for (const [p, size] of paths) {
    const segs = p.split("/");
    let cur = root;
    segs.forEach((s, i) => {
      const isFile = i === segs.length - 1;
      const path = segs.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.name === s && c.dir === !isFile);
      if (!next) {
        next = { name: s, path, dir: !isFile, children: [], size: isFile ? size : undefined };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function fileIcon(path: string, className = "size-3.5") {
  if (/\.server\.(luau|lua)$/.test(path)) return <FileCode2 className={cx(className, "text-sky-400")} />;
  if (/\.client\.(luau|lua)$/.test(path)) return <FileCode2 className={cx(className, "text-emerald-400")} />;
  if (/\.(luau|lua)$/.test(path)) return <FileCode2 className={cx(className, "text-violet-400")} />;
  if (/\.model\.json$/.test(path)) return <Box className={cx(className, "text-amber-400")} />;
  if (/\.(json|toml)$/.test(path)) return <FileJson className={cx(className, "text-yellow-500/80")} />;
  if (/\.(glb|gltf|obj|fbx|rbxm|rbxmx)$/.test(path)) return <Box className={cx(className, "text-cyan-400")} />;
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(path)) return <FileImage className={cx(className, "text-pink-400")} />;
  if (/\.(js|ts|tsx|jsx|mjs|css|html)$/.test(path)) return <FileCode2 className={cx(className, "text-orange-400")} />;
  return <FileText className={cx(className, "text-fg-3")} />;
}

export default function FilesPanel() {
  const { files, buffers, projectId, branch, openFile, refreshFiles, activeTab } = useWorkspace();
  const changed = useWorkspace((s) => (s.activeRunId ? s.runs[s.activeRunId]?.changedFiles : undefined));
  const dialog = useDialog();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["assets/source", "assets/textures", "assets/specs"]));
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const tree = useMemo(() => buildTree([...files.entries()].map(([p, f]) => [p, f.size])), [files]);

  const open = (n: TreeNode) => {
    if (/\.(glb|gltf|obj)$/.test(n.path)) {
      sessionStorage.setItem("rb-viewport-file", n.path);
      window.dispatchEvent(new Event("rb-viewport-file"));
      useLayout.getState().open("viewport");
      return;
    }
    if (files.get(n.path)?.binary && !/\.(png|jpe?g|gif|webp)$/.test(n.path)) {
      window.open(api.rawFileUrl(projectId, branch, n.path));
      return;
    }
    openFile(n.path);
    useLayout.getState().open("editor");
  };

  const newFile = async (dir: string) => {
    const name = await dialog.prompt("New file", { label: `In ${dir || "project root"}`, placeholder: "Shop.server.luau", confirmLabel: "Create" });
    if (!name) return;
    const path = [dir, name].filter(Boolean).join("/");
    const initial = /\.(luau|lua)$/.test(name) ? "--!strict\n\n" : /\.model\.json$/.test(name) ? '{\n  "ClassName": "Folder"\n}\n' : "";
    try {
      await api.writeFile(projectId, branch, path, initial);
      await refreshFiles();
      openFile(path);
      useLayout.getState().open("editor");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const newFolder = async (dir: string) => {
    const name = await dialog.prompt("New folder", { label: `In ${dir || "project root"}`, placeholder: "Systems", confirmLabel: "Create" });
    if (!name) return;
    // Folders exist through their files; an init.meta.json makes an empty Rojo folder real.
    await api.writeFile(projectId, branch, [dir, name, "init.meta.json"].filter(Boolean).join("/"), '{\n  "className": "Folder"\n}\n').catch((e) => toast.error(e.message));
    await refreshFiles();
  };

  const rename = async (n: TreeNode) => {
    const to = await dialog.prompt(`Rename ${n.dir ? "folder" : "file"}`, { initial: n.path, confirmLabel: "Rename" });
    if (!to || to === n.path) return;
    await api.renameFile(projectId, branch, n.path, to).catch((e) => toast.error(e.message));
    await refreshFiles();
  };

  const remove = async (n: TreeNode) => {
    const ok = await dialog.confirm(`Delete ${n.path}?`, n.dir ? "Everything inside this folder is deleted. You can restore it from History." : "You can restore it from History.", { danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    await api.deleteFile(projectId, branch, n.path).catch((e) => toast.error(e.message));
    await refreshFiles();
  };

  const uploadFiles = async (list: File[], dir = "") => {
    if (!list.length) return;
    const assets = list.filter((f) => /\.(glb|gltf|obj|mtl|fbx|png|jpe?g|tga|bmp|rbxm|rbxmx|ogg|mp3|wav)$/i.test(f.name));
    const texts = list.filter((f) => !assets.includes(f));
    try {
      if (assets.length) {
        const r = await api.importAssets(projectId, branch, assets);
        const problems = r.results.flatMap((x) => (x.error ? [`${x.name}: ${x.error}`] : (x.diagnostics ?? []).filter((d) => d.severity === "error").map((d) => d.message)));
        if (problems.length) toast.error(problems.join("\n"));
        else toast.ok(`Imported ${assets.length} asset file(s)`);
      }
      for (const f of texts) {
        if (f.size > 2_000_000) {
          toast.error(`${f.name} is too large for a text file`);
          continue;
        }
        await api.writeFile(projectId, branch, [dir, f.name].filter(Boolean).join("/"), await f.text());
      }
      await refreshFiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles([...e.dataTransfer.files]);
  };

  const render = (n: TreeNode, depth: number): React.ReactNode => {
    if (n.dir) {
      const isOpen = !collapsed.has(n.path);
      return (
        <div key={`d:${n.path}`}>
          <button
            className="flex h-6 w-full items-center gap-1 rounded-md pr-2 text-left text-[12.5px] text-fg-2 hover:bg-raise"
            style={{ paddingLeft: depth * 12 + 4 }}
            onClick={() =>
              setCollapsed((s) => {
                const next = new Set(s);
                if (next.has(n.path)) next.delete(n.path);
                else next.add(n.path);
                return next;
              })
            }
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, node: n });
            }}
          >
            {isOpen ? <ChevronDown className="size-3 text-fg-3" /> : <ChevronRight className="size-3 text-fg-3" />}
            {isOpen ? <FolderOpen className="size-3.5 text-accent/80" /> : <Folder className="size-3.5 text-accent/80" />}
            <span className="truncate">{n.name}</span>
          </button>
          {isOpen && n.children.map((c) => render(c, depth + 1))}
        </div>
      );
    }
    const dirty = buffers[n.path] !== undefined;
    const isActive = activeTab === n.path;
    return (
      <button
        key={`f:${n.path}`}
        className={cx("group flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[12.5px]", isActive ? "bg-accent/12 text-fg" : "text-fg-2 hover:bg-raise")}
        style={{ paddingLeft: depth * 12 + 20 }}
        onClick={() => open(n)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, node: n });
        }}
        title={`${n.path} · ${formatBytes(n.size ?? 0)}`}
      >
        {fileIcon(n.path)}
        <span className="min-w-0 flex-1 truncate">{n.name}</span>
        {changed?.has(n.path) && <span className="size-1.5 rounded-full bg-accent-2" title="Changed by the agent in this run" />}
        {dirty && <span className="size-1.5 rounded-full bg-accent" title="Unsaved" />}
      </button>
    );
  };

  return (
    <div
      className={cx("flex h-full flex-col", dragOver && "bg-accent/5 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--accent)_50%,transparent)]")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => setMenu(null)}
    >
      <div className="flex h-8 shrink-0 items-center gap-0.5 px-2">
        <span className="panel-title flex-1">Project files</span>
        <button className="btn btn-ghost size-6 justify-center p-0" title="New file" onClick={() => newFile("")}>
          <FilePlus2 className="size-3.5" />
        </button>
        <button className="btn btn-ghost size-6 justify-center p-0" title="New folder" onClick={() => newFolder("")}>
          <FolderPlus className="size-3.5" />
        </button>
        <button className="btn btn-ghost size-6 justify-center p-0" title="Upload files (or drop them here)" onClick={() => upload.current?.click()}>
          <Upload className="size-3.5" />
        </button>
        <button className="btn btn-ghost size-6 justify-center p-0" title="Refresh" onClick={() => refreshFiles()}>
          <RefreshCw className="size-3.5" />
        </button>
        <input ref={upload} type="file" multiple hidden onChange={(e) => uploadFiles([...(e.target.files ?? [])])} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">{tree.children.map((c) => render(c, 0))}</div>
      {menu && (
        <div className="glass fixed z-50 w-48 rounded-xl p-1 text-[13px] animate-rise" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 200) }} onClick={(e) => e.stopPropagation()}>
          {menu.node.dir ? (
            <>
              <MenuItem icon={<FilePlus2 className="size-3.5" />} onClick={() => { setMenu(null); newFile(menu.node.path); }}>New file here</MenuItem>
              <MenuItem icon={<FolderPlus className="size-3.5" />} onClick={() => { setMenu(null); newFolder(menu.node.path); }}>New folder here</MenuItem>
            </>
          ) : (
            <MenuItem icon={<Download className="size-3.5" />} onClick={() => { setMenu(null); window.open(api.rawFileUrl(projectId, branch, menu.node.path)); }}>Download</MenuItem>
          )}
          <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => { setMenu(null); rename(menu.node); }}>Rename / move</MenuItem>
          <MenuItem icon={<Trash2 className="size-3.5 text-err" />} onClick={() => { setMenu(null); remove(menu.node); }}>Delete</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-raise" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
