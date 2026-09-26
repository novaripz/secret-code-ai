"use client";

import { Copy, Eye, EyeOff, Frame, Image as ImageIcon, LayoutTemplate, MousePointerClick, Plus, Redo2, ScanLine, ScrollText, Trash2, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isA } from "@/core/roblox/classes";
import { flattenBoxes, layoutGui, type LayoutBox } from "@/core/roblox/gui";
import { nodeToModelJson } from "@/core/roblox/hierarchyEdit";
import { dottedPath, indexTree, type RNode } from "@/core/roblox/instance";
import type { RValue } from "@/core/roblox/values";
import { api } from "../api";
import { ClassIcon } from "../common/classIcon";
import { DEVICES } from "../common/DeviceFrame";
import { GuiBoxes } from "../common/GuiRenderer";
import { PropertyGrid } from "../common/PropertyEditor";
import { cx, EmptyState, Segmented, toast, useDialog } from "../common/ui";
import { useWorkspace } from "../workspace/store";
import { applyOps } from "./HierarchyPanel";

const ELEMENTS: { cls: string; icon: typeof Frame; props: Record<string, unknown>; children?: unknown[] }[] = [
  { cls: "Frame", icon: Frame, props: { Size: [[0, 240], [0, 160]], BackgroundColor3: [0.11, 0.12, 0.16], BorderSizePixel: 0 }, children: [{ Name: "Corner", ClassName: "UICorner", Properties: { CornerRadius: [0, 12] } }] },
  { cls: "TextLabel", icon: Type, props: { Size: [[0, 200], [0, 40]], BackgroundTransparency: 1, Text: "Label", TextColor3: [1, 1, 1], TextSize: 20, FontFace: { Font: { family: "rbxasset://fonts/families/BuilderSans.json", weight: "SemiBold", style: "Normal" } } } },
  {
    cls: "TextButton",
    icon: MousePointerClick,
    props: { Size: [[0, 160], [0, 44]], BackgroundColor3: [0.42, 0.33, 1], BorderSizePixel: 0, Text: "Button", TextColor3: [1, 1, 1], TextSize: 18, AutoButtonColor: true, FontFace: { Font: { family: "rbxasset://fonts/families/BuilderSans.json", weight: "Bold", style: "Normal" } } },
    children: [{ Name: "Corner", ClassName: "UICorner", Properties: { CornerRadius: [0, 10] } }],
  },
  { cls: "ImageLabel", icon: ImageIcon, props: { Size: [[0, 96], [0, 96]], BackgroundTransparency: 1, Image: "" } },
  { cls: "ScrollingFrame", icon: ScrollText, props: { Size: [[0, 300], [0, 220]], BackgroundTransparency: 0.2, BackgroundColor3: [0.08, 0.09, 0.12], BorderSizePixel: 0, ScrollBarThickness: 6, AutomaticCanvasSize: "Y", CanvasSize: [[0, 0], [0, 0]] } },
  { cls: "TextBox", icon: Type, props: { Size: [[0, 220], [0, 40]], BackgroundColor3: [0.1, 0.11, 0.15], BorderSizePixel: 0, Text: "", PlaceholderText: "Type here", TextColor3: [1, 1, 1], TextSize: 16 } },
];

const COMPONENTS: { cls: string; props: Record<string, unknown> }[] = [
  { cls: "UICorner", props: { CornerRadius: [0, 10] } },
  { cls: "UIStroke", props: { Color: [1, 1, 1], Transparency: 0.8, Thickness: 1.5 } },
  { cls: "UIPadding", props: { PaddingTop: [0, 12], PaddingBottom: [0, 12], PaddingLeft: [0, 12], PaddingRight: [0, 12] } },
  { cls: "UIListLayout", props: { FillDirection: "Vertical", Padding: [0, 8], SortOrder: "LayoutOrder", HorizontalAlignment: "Center" } },
  { cls: "UIGridLayout", props: { CellSize: [[0, 100], [0, 100]], CellPadding: [[0, 8], [0, 8]], SortOrder: "LayoutOrder" } },
  { cls: "UIGradient", props: { Color: { ColorSequence: { keypoints: [{ time: 0, color: [1, 1, 1] }, { time: 1, color: [0.6, 0.6, 0.7] }] } }, Rotation: 90 } },
  { cls: "UIAspectRatioConstraint", props: { AspectRatio: 1 } },
  { cls: "UISizeConstraint", props: { MinSize: [0, 0], MaxSize: [600, 600] } },
  { cls: "UITextSizeConstraint", props: { MinTextSize: 10, MaxTextSize: 28 } },
];

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
interface Drag {
  id: string;
  handle: Handle;
  startX: number;
  startY: number;
  pos: [number, number, number, number];
  size: [number, number, number, number];
  anchor: [number, number];
  box: LayoutBox;
  parentBox?: LayoutBox;
}

const udim2 = (v: RValue | undefined, d: [number, number, number, number]) => (v?.t === "UDim2" ? ([...v.v] as [number, number, number, number]) : d);
const r2 = (n: number) => Math.round(n * 1000) / 1000;

function cloneWith(root: RNode, id: string, props: Record<string, RValue>): RNode {
  const go = (n: RNode): RNode => ({ ...n, properties: n.id === id ? { ...n.properties, ...props } : n.properties, children: n.children.map(go) });
  return go(root);
}

export default function UIEditorPanel() {
  const { build, selectedInstance, selectInstance, files, projectId, branch, refreshFiles } = useWorkspace();
  const dialog = useDialog();
  const [guiId, setGuiId] = useState<string>();
  const [device, setDevice] = useState<string>("laptop");
  const [snap, setSnap] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [draft, setDraft] = useState<{ id: string; props: Record<string, RValue> } | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [undo, setUndo] = useState<string[]>([]);
  const [redo, setRedo] = useState<string[]>([]);
  const drag = useRef<Drag | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const d = DEVICES.find((x) => x.id === device)!;

  const guis = useMemo(() => build?.root.children.find((c) => c.className === "StarterGui")?.children.filter((g) => g.className === "ScreenGui") ?? [], [build]);
  useEffect(() => {
    const pick = () => {
      const id = sessionStorage.getItem("rb-ui-editor-gui");
      if (id) {
        setGuiId(id);
        sessionStorage.removeItem("rb-ui-editor-gui");
      }
    };
    pick();
    window.addEventListener("rb-ui-editor-gui", pick);
    return () => window.removeEventListener("rb-ui-editor-gui", pick);
  }, []);
  const gui = guis.find((g) => g.id === guiId) ?? guis[0];
  const index = useMemo(() => (gui ? indexTree(gui) : undefined), [gui]);
  const guiFile = gui?.origin?.file;
  const shown = useMemo(() => (gui && draft ? cloneWith(gui, draft.id, draft.props) : gui), [gui, draft]);
  const layout = useMemo(() => (shown ? layoutGui(shown, { w: d.w, h: d.h }) : undefined), [shown, d.w, d.h]);
  const flat = useMemo(() => (layout ? flattenBoxes(layout) : []), [layout]);
  const selected = selectedInstance && index?.byId.get(selectedInstance);
  const selBox = flat.find((b) => b.node.id === selectedInstance);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(0.05, Math.min((el.clientWidth - 48) / d.w, (el.clientHeight - 48) / d.h, 1.5))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.w, d.h, gui]);

  /** Every edit records the file's previous text so it can be undone. */
  const commit = useCallback(
    async (ops: unknown[]) => {
      if (guiFile) {
        const before = files.get(guiFile)?.text;
        if (before !== undefined) {
          setUndo((u) => [...u.slice(-49), before]);
          setRedo([]);
        }
      }
      const r = await applyOps(ops);
      setDraft(null);
      return r;
    },
    [files, guiFile],
  );

  const restoreText = async (text: string, from: "undo" | "redo") => {
    if (!guiFile) return;
    const current = files.get(guiFile)?.text ?? "";
    await api.writeFile(projectId, branch, guiFile, text);
    if (from === "undo") setRedo((r) => [...r, current]);
    else setUndo((u) => [...u, current]);
    await refreshFiles();
  };

  const onPointerDown = (e: React.PointerEvent, handle: Handle) => {
    if (!selBox || !selected) return;
    e.stopPropagation();
    e.preventDefault();
    if (handle === "move" && selBox.laidOut) {
      toast.info("This element is positioned by a UIListLayout/UIGridLayout. Change its LayoutOrder instead.");
      return;
    }
    const parentBox = flat.find((b) => b.children.includes(selBox));
    drag.current = {
      id: selected.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      pos: udim2(selected.properties.Position, [0, 0, 0, 0]),
      size: udim2(selected.properties.Size, [0, 100, 0, 100]),
      anchor: selected.properties.AnchorPoint?.t === "Vector2" ? selected.properties.AnchorPoint.v : [0, 0],
      box: selBox,
      parentBox,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    let dx = (e.clientX - g.startX) / scale;
    let dy = (e.clientY - g.startY) / scale;
    if (snap && !e.altKey) {
      dx = Math.round(dx / 4) * 4;
      dy = Math.round(dy / 4) * 4;
    }
    const pos = [...g.pos] as [number, number, number, number];
    const size = [...g.size] as [number, number, number, number];
    const h = g.handle;
    const guideState: { x?: number; y?: number } = {};
    if (h === "move") {
      pos[1] += dx;
      pos[3] += dy;
      // Snap the element's centre to its parent's centre.
      if (snap && g.parentBox) {
        const cx = g.box.x + dx + g.box.w / 2;
        const pcx = g.parentBox.x + g.parentBox.w / 2;
        if (Math.abs(cx - pcx) < 6) {
          pos[1] += pcx - cx;
          guideState.x = pcx;
        }
        const cy = g.box.y + dy + g.box.h / 2;
        const pcy = g.parentBox.y + g.parentBox.h / 2;
        if (Math.abs(cy - pcy) < 6) {
          pos[3] += pcy - cy;
          guideState.y = pcy;
        }
      }
    } else {
      const east = h.includes("e"), west = h.includes("w"), north = h.includes("n"), south = h.includes("s");
      if (east) size[1] += dx;
      if (west) size[1] -= dx;
      if (south) size[3] += dy;
      if (north) size[3] -= dy;
      // Keep the opposite edge still, whatever the AnchorPoint.
      if (east) pos[1] += dx * g.anchor[0];
      if (west) pos[1] += dx * (1 - g.anchor[0]);
      if (south) pos[3] += dy * g.anchor[1];
      if (north) pos[3] += dy * (1 - g.anchor[1]);
      size[1] = Math.max(size[1], -size[0] * (g.parentBox?.w ?? d.w) + 4);
      size[3] = Math.max(size[3], -size[2] * (g.parentBox?.h ?? d.h) + 4);
    }
    setGuides(guideState);
    setDraft({ id: g.id, props: { Position: { t: "UDim2", v: pos.map(r2) as [number, number, number, number] }, Size: { t: "UDim2", v: size.map(r2) as [number, number, number, number] } } });
  };

  const onPointerUp = async () => {
    const g = drag.current;
    drag.current = null;
    setGuides({});
    if (!g || !draft) return;
    const props: Record<string, unknown> = {};
    const pos = draft.props.Position as Extract<RValue, { t: "UDim2" }>;
    const size = draft.props.Size as Extract<RValue, { t: "UDim2" }>;
    if (pos.v.some((v, i) => v !== g.pos[i])) props.Position = [[pos.v[0], Math.round(pos.v[1])], [pos.v[2], Math.round(pos.v[3])]];
    if (size.v.some((v, i) => v !== g.size[i])) props.Size = [[size.v[0], Math.round(size.v[1])], [size.v[2], Math.round(size.v[3])]];
    if (!Object.keys(props).length) {
      setDraft(null);
      return;
    }
    await commit([{ op: "set", path: dottedPath(g.id), properties: props }]);
  };

  const nudge = useCallback(
    async (dx: number, dy: number) => {
      if (!selected || !isA(selected.className, "GuiObject") || selBox?.laidOut) return;
      const p = udim2(selected.properties.Position, [0, 0, 0, 0]);
      await commit([{ op: "set", path: dottedPath(selected.id), properties: { Position: [[p[0], p[1] + dx], [p[2], p[3] + dy]] } }]);
    },
    [selected, selBox, commit],
  );

  const removeSelected = useCallback(async () => {
    if (!selected || selected.id === gui?.id) return;
    await commit([{ op: "remove", path: dottedPath(selected.id) }]);
    selectInstance(undefined);
  }, [selected, gui, commit, selectInstance]);

  const duplicate = useCallback(async () => {
    if (!selected || selected.id === gui?.id) return;
    const model = nodeToModelJson(selected);
    const parentId = selected.id.split("/").slice(0, -1).join("/");
    const p = udim2(selected.properties.Position, [0, 0, 0, 0]);
    const name = `${selected.name}Copy`;
    await commit([{ op: "add", parent: dottedPath(parentId), className: selected.className, name, properties: { ...model.Properties, Position: [[p[0], p[1] + 16], [p[2], p[3] + 16]] }, children: model.Children }]);
    selectInstance(`${parentId}/${name}`);
  }, [selected, gui, commit, selectInstance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canvas.current?.closest("section")?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          const t = redo[redo.length - 1];
          if (t !== undefined) {
            setRedo((r) => r.slice(0, -1));
            restoreText(t, "redo");
          }
        } else {
          const t = undo[undo.length - 1];
          if (t !== undefined) {
            setUndo((u) => u.slice(0, -1));
            restoreText(t, "undo");
          }
        }
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected && canvas.current) {
          e.preventDefault();
          removeSelected();
        }
      } else if (e.key.startsWith("Arrow") && selected) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addElement = async (el: (typeof ELEMENTS)[number]) => {
    if (!gui) return;
    const parent = selected && isA(selected.className, "GuiObject") && ["Frame", "ScrollingFrame", "CanvasGroup"].includes(selected.className) ? selected : gui;
    const base = el.cls.replace(/^Text|^Image/, "") || el.cls;
    let name = base;
    for (let i = 2; parent.children.some((c) => c.name === name); i++) name = `${base}${i}`;
    const props = { ...el.props, Position: [[0.5, 0], [0.5, 0]], AnchorPoint: [0.5, 0.5] };
    const r = await commit([{ op: "add", parent: dottedPath(parent.id), className: el.cls, name, properties: props, children: el.children }]);
    if (r) selectInstance(`${parent.id}/${name}`);
  };

  const addComponent = async (c: (typeof COMPONENTS)[number]) => {
    if (!selected || !isA(selected.className, "GuiObject")) {
      toast.info("Select a GUI element first");
      return;
    }
    if (selected.children.some((x) => x.className === c.cls)) {
      toast.info(`${selected.name} already has a ${c.cls}`);
      return;
    }
    await commit([{ op: "add", parent: dottedPath(selected.id), className: c.cls, name: c.cls.replace(/^UI/, ""), properties: c.props }]);
  };

  const toScale = async () => {
    if (!selected || !selBox) return;
    const parentBox = flat.find((b) => b.children.includes(selBox));
    const pw = parentBox?.w ?? d.w;
    const ph = parentBox?.h ?? d.h;
    const [ax, ay] = selected.properties.AnchorPoint?.t === "Vector2" ? selected.properties.AnchorPoint.v : [0, 0];
    const px = (selBox.x + ax * selBox.w - (parentBox?.x ?? 0)) / pw;
    const py = (selBox.y + ay * selBox.h - (parentBox?.y ?? 0)) / ph;
    await commit([
      {
        op: "set",
        path: dottedPath(selected.id),
        properties: { Position: [[r2(px), 0], [r2(py), 0]], Size: [[r2(selBox.w / pw), 0], [r2(selBox.h / ph), 0]] },
      },
    ]);
    toast.ok("Converted to scale: it now resizes with the screen");
  };

  const newGui = async () => {
    const name = await dialog.prompt("New ScreenGui", { placeholder: "MainMenu", confirmLabel: "Create" });
    if (!name) return;
    await commit([{ op: "add", parent: "StarterGui", className: "ScreenGui", name, properties: { ResetOnSpawn: false, ZIndexBehavior: "Sibling" } }]);
    setGuiId(`game/StarterGui/${name}`);
  };

  if (!build) return <EmptyState title="No Roblox project" />;
  if (!gui) {
    return (
      <EmptyState icon={<LayoutTemplate className="size-5" />} title="No ScreenGuis yet" action={<button className="btn btn-primary" onClick={newGui}><Plus className="size-3.5" /> New ScreenGui</button>}>
        Create one, or ask the agent to design your UI.
      </EmptyState>
    );
  }

  const layers = (n: RNode, depth: number): React.ReactNode => (
    <div key={n.id}>
      <button
        className={cx("flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[12px]", selectedInstance === n.id ? "bg-accent/15 text-fg" : "text-fg-2 hover:bg-raise")}
        style={{ paddingLeft: depth * 10 + 6 }}
        onClick={() => selectInstance(n.id)}
      >
        <ClassIcon className={n.className} />
        <span className="truncate">{n.name}</span>
        {n.properties.Visible?.t === "bool" && !n.properties.Visible.v && <EyeOff className="ml-auto size-3 text-fg-3" />}
      </button>
      {n.children.map((c) => layers(c, depth + 1))}
    </div>
  );

  const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handlePos: Record<string, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };

  return (
    <div className="flex h-full">
      <div className="flex w-48 shrink-0 flex-col border-r border-line">
        <div className="flex h-9 items-center gap-1 border-b border-line px-2">
          <select className="input h-7 min-w-0 flex-1 text-xs" value={gui.id} onChange={(e) => setGuiId(e.target.value)}>
            {guis.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost size-7 justify-center p-0" onClick={newGui} title="New ScreenGui">
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">{layers(gui, 0)}</div>
        <div className="border-t border-line p-2">
          <div className="mb-1.5 panel-title">Insert</div>
          <div className="grid grid-cols-3 gap-1">
            {ELEMENTS.map((el) => {
              const Icon = el.icon;
              return (
                <button key={el.cls} className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] text-fg-2 hover:bg-raise" onClick={() => addElement(el)} title={`Add ${el.cls}`}>
                  <Icon className="size-4" />
                  {el.cls.replace("Label", "").replace("Frame", "Frame")}
                </button>
              );
            })}
          </div>
          <select className="input mt-2 h-7 text-xs" value="" onChange={(e) => { const c = COMPONENTS.find((x) => x.cls === e.target.value); if (c) addComponent(c); }}>
            <option value="">+ Add modifier to selection…</option>
            {COMPONENTS.map((c) => (
              <option key={c.cls} value={c.cls}>
                {c.cls}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line px-2 [scrollbar-width:none]">
          <Segmented value={device} onChange={setDevice} options={DEVICES.map((x) => ({ value: x.id, label: x.label, title: `${x.w}×${x.h}` }))} />
          <button className={cx("btn btn-ghost h-7 px-2 text-xs", snap && "text-accent")} onClick={() => setSnap(!snap)} title="Snap to 4px and parent centre (hold Alt to bypass)">
            <ScanLine className="size-3.5" /> Snap
          </button>
          <button className={cx("btn btn-ghost size-7 justify-center p-0", showHidden && "text-accent")} onClick={() => setShowHidden(!showHidden)} title="Show hidden elements">
            <Eye className="size-3.5" />
          </button>
          <div className="flex-1" />
          <button className="btn btn-ghost size-7 justify-center p-0" disabled={!undo.length} onClick={() => { const t = undo[undo.length - 1]; setUndo((u) => u.slice(0, -1)); restoreText(t, "undo"); }} title="Undo (⌘Z)">
            <Undo2 className="size-3.5" />
          </button>
          <button className="btn btn-ghost size-7 justify-center p-0" disabled={!redo.length} onClick={() => { const t = redo[redo.length - 1]; setRedo((r) => r.slice(0, -1)); restoreText(t, "redo"); }} title="Redo (⌘⇧Z)">
            <Redo2 className="size-3.5" />
          </button>
          <button className="btn btn-ghost size-7 justify-center p-0" disabled={!selected || selected.id === gui.id} onClick={duplicate} title="Duplicate (⌘D)">
            <Copy className="size-3.5" />
          </button>
          <button className="btn btn-ghost size-7 justify-center p-0" disabled={!selected || selected.id === gui.id} onClick={removeSelected} title="Delete">
            <Trash2 className="size-3.5 text-err" />
          </button>
        </div>
        <div ref={host} className="relative min-h-0 flex-1 overflow-hidden bg-bg-2 grid-bg" onPointerDown={() => selectInstance(gui.id)}>
          <div className="absolute left-1/2 top-1/2" style={{ width: d.w * scale, height: d.h * scale, transform: "translate(-50%, -50%)" }}>
            <div
              ref={canvas}
              className="absolute left-0 top-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 shadow-2xl ring-1 ring-white/10"
              style={{ width: d.w, height: d.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {layout && <GuiBoxes box={layout} selectedId={selectedInstance} onSelect={(id) => selectInstance(id)} showHidden={showHidden} />}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[58px] border-b border-dashed border-white/15" title="Roblox top bar inset" />
              {guides.x !== undefined && <div className="pointer-events-none absolute inset-y-0 w-px bg-pink-400" style={{ left: guides.x }} />}
              {guides.y !== undefined && <div className="pointer-events-none absolute inset-x-0 h-px bg-pink-400" style={{ top: guides.y }} />}
              {selBox && selected && selBox.node.id !== gui.id && isA(selected.className, "GuiObject") && (
                <div className="absolute" style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h, transform: selBox.rotation ? `rotate(${selBox.rotation}deg)` : undefined }}>
                  <div
                    className={cx("absolute inset-0 outline outline-2 outline-accent", selBox.laidOut ? "cursor-default" : "cursor-move")}
                    style={{ outlineWidth: 2 / scale }}
                    onPointerDown={(e) => onPointerDown(e, "move")}
                  />
                  {handles.map((h) => (
                    <div
                      key={h}
                      onPointerDown={(e) => onPointerDown(e, h)}
                      className="absolute rounded-sm border-accent bg-white"
                      style={{
                        width: 9 / scale,
                        height: 9 / scale,
                        borderWidth: 1.5 / scale,
                        left: `calc(${handlePos[h][0] * 100}% - ${4.5 / scale}px)`,
                        top: `calc(${handlePos[h][1] * 100}% - ${4.5 / scale}px)`,
                        cursor: `${h}-resize`,
                      }}
                    />
                  ))}
                  <div className="absolute left-0 whitespace-nowrap rounded bg-accent px-1.5 font-mono text-white" style={{ top: -18 / scale, fontSize: 10 / scale, lineHeight: `${16 / scale}px` }}>
                    {selected.name} · {Math.round(selBox.w)}×{Math.round(selBox.h)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-64 shrink-0 overflow-y-auto border-l border-line p-3">
        {selected ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <ClassIcon className={selected.className} cls="size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{selected.name}</div>
                <div className="text-[11px] text-fg-3">{selected.className}</div>
              </div>
            </div>
            {isA(selected.className, "GuiObject") && selBox && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                <button className="btn h-7 text-xs" onClick={toScale} title="Use scale-based Position and Size so it adapts to every screen">
                  Make responsive
                </button>
                {selBox.laidOut && <span className="chip">Laid out by parent</span>}
              </div>
            )}
            <PropertyGrid node={selected} onChange={(prop, value) => commit([{ op: "set", path: dottedPath(selected.id), properties: { [prop]: value } }])} />
          </>
        ) : (
          <div className="text-xs text-fg-3">Select an element on the canvas or in the layers list.</div>
        )}
      </div>
    </div>
  );
}
