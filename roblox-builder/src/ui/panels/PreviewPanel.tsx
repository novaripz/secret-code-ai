"use client";

import { ExternalLink, Info, Layers, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { layoutGui } from "@/core/roblox/gui";
import { isRobloxKind } from "@/core/roblox/template";
import { DeviceFrame, DEVICES } from "../common/DeviceFrame";
import { GuiBoxes } from "../common/GuiRenderer";
import { Scene3D } from "../common/Scene3D";
import { cx, EmptyState, Segmented } from "../common/ui";
import { useWorkspace } from "../workspace/store";

function RobloxPreview() {
  const { build, selectedInstance, selectInstance } = useWorkspace();
  const [device, setDevice] = useState<string>("laptop");
  const [mode, setMode] = useState<"game" | "ui">("game");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const d = DEVICES.find((x) => x.id === device)!;
  const workspace = build?.root.children.find((c) => c.className === "Workspace");
  const guis = useMemo(() => build?.root.children.find((c) => c.className === "StarterGui")?.children.filter((g) => g.className === "ScreenGui") ?? [], [build]);
  const boxes = useMemo(
    () =>
      guis
        .filter((g) => !hidden.has(g.id) && !(g.properties.Enabled?.t === "bool" && !g.properties.Enabled.v))
        .sort((a, b) => (a.properties.DisplayOrder?.t === "int" ? a.properties.DisplayOrder.v : 0) - (b.properties.DisplayOrder?.t === "int" ? b.properties.DisplayOrder.v : 0))
        .map((g) => layoutGui(g, { w: d.w, h: d.h })),
    [guis, hidden, d.w, d.h],
  );
  if (!build) return <EmptyState title="Nothing to preview yet" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented value={mode} onChange={(v) => setMode(v as "game" | "ui")} options={[{ value: "game", label: "Game view" }, { value: "ui", label: "UI only" }]} />
        <Segmented value={device} onChange={setDevice} options={DEVICES.map((x) => ({ value: x.id, label: x.label, title: `${x.w}×${x.h}` }))} />
        <div className="flex-1" />
        {guis.map((g) => (
          <button
            key={g.id}
            className={cx("chip", hidden.has(g.id) && "opacity-50 line-through")}
            onClick={() =>
              setHidden((s) => {
                const n = new Set(s);
                if (n.has(g.id)) n.delete(g.id);
                else n.add(g.id);
                return n;
              })
            }
            title="Toggle this ScreenGui"
          >
            <Layers className="size-3" /> {g.name}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 bg-bg-2 grid-bg">
        <DeviceFrame w={d.w} h={d.h} className="bg-black shadow-2xl ring-1 ring-white/10">
          {mode === "game" && workspace && (
            <div className="absolute inset-0">
              <Scene3D root={workspace} selectedId={selectedInstance} onSelect={(id) => id && selectInstance(id)} />
            </div>
          )}
          {mode === "ui" && <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />}
          {boxes.map((b) => (
            <div key={b.node.id} className="pointer-events-none absolute inset-0 [&_[data-gui]]:pointer-events-auto">
              <GuiBoxes box={b} selectedId={selectedInstance} onSelect={(id) => selectInstance(id)} />
            </div>
          ))}
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex h-[58px] items-center gap-2 px-4 opacity-70">
            <span className="size-8 rounded-full bg-black/40" />
            <span className="size-8 rounded-full bg-black/40" />
          </div>
        </DeviceFrame>
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/70 backdrop-blur">
          <Info className="size-3" /> Rendered from the project&apos;s real instances. Scripts run in Roblox: export the place to play it in Studio.
        </div>
      </div>
    </div>
  );
}

function WebPreview() {
  const { projectId, branch, filesVersion, files } = useWorkspace();
  const [device, setDevice] = useState<string>("full");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setNonce((n) => n + 1), 300);
    return () => clearTimeout(t);
  }, [filesVersion]);
  const src = `/api/projects/${projectId}/preview/~${encodeURIComponent(branch)}/index.html?v=${nonce}`;
  if (!files.has("index.html")) return <EmptyState title="No index.html">Add an index.html at the project root to preview the app.</EmptyState>;
  const widths: Record<string, number | undefined> = { full: undefined, phone: 390, tablet: 820 };
  const width = widths[device];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented value={device} onChange={setDevice} options={[{ value: "full", label: "Full" }, { value: "tablet", label: "Tablet" }, { value: "phone", label: "Phone" }]} />
        <div className="flex-1" />
        <button className="btn btn-ghost h-7" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="size-3.5" /> Reload
        </button>
        <a className="btn btn-ghost h-7" href={src} target="_blank" rel="noreferrer">
          <ExternalLink className="size-3.5" /> Open
        </a>
      </div>
      <div className="flex min-h-0 flex-1 justify-center bg-bg-2 p-3 grid-bg">
        <iframe
          key={nonce}
          title="Live preview"
          src={src}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          className="h-full rounded-xl bg-white shadow-2xl ring-1 ring-black/10 transition-all"
          style={{ width: width ? `${width}px` : "100%" }}
        />
      </div>
    </div>
  );
}

export default function PreviewPanel() {
  const kind = useWorkspace((s) => s.meta?.kind);
  if (!kind) return null;
  return isRobloxKind(kind) ? <RobloxPreview /> : <WebPreview />;
}
