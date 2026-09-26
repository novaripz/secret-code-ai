"use client";

import { Box, Grid3x3, Maximize } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isA } from "@/core/roblox/classes";
import { dottedPath, indexTree, walk, type RNode } from "@/core/roblox/instance";
import { Scene3D } from "../common/Scene3D";
import { cx, EmptyState } from "../common/ui";
import { useWorkspace } from "../workspace/store";

export default function ViewportPanel() {
  const { build, fileMap, files, selectedInstance, selectInstance } = useWorkspace();
  const [source, setSource] = useState<string>("workspace");
  const [grid, setGrid] = useState(true);
  const [stats, setStats] = useState<{ parts: number; triangles: number; size: [number, number, number] }>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const pick = () => {
      const f = sessionStorage.getItem("rb-viewport-file");
      if (f) {
        setSource(`file:${f}`);
        sessionStorage.removeItem("rb-viewport-file");
      }
    };
    pick();
    window.addEventListener("rb-viewport-file", pick);
    return () => window.removeEventListener("rb-viewport-file", pick);
  }, []);

  const models = useMemo(() => {
    const out: RNode[] = [];
    if (!build) return out;
    walk(build.root, (n) => {
      if ((n.className === "Model" || n.className === "Folder") && n.id.split("/").length <= 5 && /Assets|ServerStorage|Workspace/.test(n.id)) {
        let hasPart = false;
        walk(n, (c) => {
          if (isA(c.className, "BasePart")) hasPart = true;
        });
        if (hasPart) out.push(n);
      }
    });
    return out;
  }, [build]);
  const meshFiles = useMemo(() => [...files.keys()].filter((p) => p.endsWith(".glb")), [files]);

  const index = useMemo(() => (build ? indexTree(build.root) : undefined), [build]);
  // Selecting a model elsewhere shows it here.
  const [prevSel, setPrevSel] = useState(selectedInstance);
  if (selectedInstance !== prevSel) {
    setPrevSel(selectedInstance);
    const n = selectedInstance ? index?.byId.get(selectedInstance) : undefined;
    if (n && models.some((m) => m.id === n.id)) setSource(`inst:${n.id}`);
  }

  const root = source === "workspace" ? build?.root.children.find((c) => c.className === "Workspace") : source.startsWith("inst:") ? index?.byId.get(source.slice(5)) : undefined;
  const glb = source.startsWith("file:") ? (fileMap.get(source.slice(5)) as Uint8Array | undefined) : undefined;
  const selected = selectedInstance ? index?.byId.get(selectedInstance) : undefined;

  if (!build && !meshFiles.length) return <EmptyState icon={<Box className="size-5" />} title="Nothing to show in 3D">Parts, models and GLB files appear here.</EmptyState>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
        <select className="input h-7 w-auto max-w-72 text-xs" value={source} onChange={(e) => { setSource(e.target.value); setNonce((n) => n + 1); }}>
          {build && <option value="workspace">Workspace</option>}
          {models.length > 0 && (
            <optgroup label="Roblox models">
              {models.map((m) => (
                <option key={m.id} value={`inst:${m.id}`}>
                  {dottedPath(m.id)}
                </option>
              ))}
            </optgroup>
          )}
          {meshFiles.length > 0 && (
            <optgroup label="GLB exports">
              {meshFiles.map((f) => (
                <option key={f} value={`file:${f}`}>
                  {f}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button className={cx("btn btn-ghost size-7 justify-center p-0", grid && "text-accent")} onClick={() => setGrid(!grid)} title="Grid (1 cell = 4 studs)">
          <Grid3x3 className="size-3.5" />
        </button>
        <button className="btn btn-ghost size-7 justify-center p-0" onClick={() => setNonce((n) => n + 1)} title="Reframe">
          <Maximize className="size-3.5" />
        </button>
        <div className="flex-1" />
        {stats && (
          <span className="font-mono text-[11px] text-fg-3">
            {stats.parts} {glb ? "meshes" : "parts"} · {Math.round(stats.triangles).toLocaleString()} tris · {stats.size.join(" × ")} studs
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <Scene3D key={`${source}-${nonce}`} root={root} glb={glb} showGrid={grid} selectedId={selectedInstance} onSelect={(id) => id && selectInstance(id)} onStats={setStats} />
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/45 px-2 py-1 text-[11px] text-white/80 backdrop-blur">
          Drag to orbit · right-drag to pan · scroll to zoom · double-click to select
        </div>
        {selected && isA(selected.className, "BasePart") && (
          <div className="glass absolute right-2 top-2 w-56 rounded-xl p-3 text-xs">
            <div className="font-medium">{selected.name}</div>
            <div className="text-fg-3">{selected.className}</div>
            {selected.properties.Size?.t === "Vector3" && <div className="mt-1 font-mono text-[11px] text-fg-2">Size {selected.properties.Size.v.join(" × ")}</div>}
            {selected.properties.Material?.t === "Enum" && <div className="font-mono text-[11px] text-fg-2">{selected.properties.Material.v}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
