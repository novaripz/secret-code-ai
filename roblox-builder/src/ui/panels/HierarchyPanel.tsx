"use client";

import { ChevronDown, ChevronRight, FileCode2, LayoutTemplate, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { creatableByCategory, getClass, isA } from "@/core/roblox/classes";
import { dottedPath, indexTree, type RNode } from "@/core/roblox/instance";
import { api } from "../api";
import { ClassIcon } from "../common/classIcon";
import { PropertyGrid } from "../common/PropertyEditor";
import { cx, EmptyState, SeverityGlyph, toast, useDialog } from "../common/ui";
import { useLayout } from "../workspace/layout";
import { useWorkspace } from "../workspace/store";

export async function applyOps(ops: unknown[]) {
  const { projectId, branch, refreshFiles, validate } = useWorkspace.getState();
  try {
    const r = await api.hierarchy(projectId, branch, ops);
    await refreshFiles();
    validate();
    return r;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

function ClassPicker({ onPick, onClose, parentClass }: { onPick: (cls: string) => void; onClose: () => void; parentClass: string }) {
  const [q, setQ] = useState("");
  const groups = creatableByCategory();
  const guiParent = isA(parentClass, "GuiObject") || isA(parentClass, "LayerCollector") || parentClass === "StarterGui";
  const order = guiParent ? ["gui", "gui-component", "gui-root", "script", "value", "remote", "container"] : Object.keys(groups);
  return (
    <div className="glass absolute left-2 right-2 top-9 z-30 max-h-80 overflow-y-auto rounded-xl p-2 animate-rise">
      <input className="input mb-2" placeholder="Search classes…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Escape" && onClose()} />
      {order
        .filter((g) => groups[g])
        .map((g) => {
          const list = groups[g].filter((c) => c.toLowerCase().includes(q.toLowerCase()));
          if (!list.length) return null;
          return (
            <div key={g} className="mb-1.5">
              <div className="px-1 pb-0.5 panel-title">{g}</div>
              <div className="grid grid-cols-2 gap-0.5">
                {list.map((c) => (
                  <button key={c} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-raise" onClick={() => onPick(c)}>
                    <ClassIcon className={c} /> {c}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default function HierarchyPanel() {
  const { build, selectedInstance, selectInstance, openFile, report } = useWorkspace();
  const dialog = useDialog();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState(false);
  const [split, setSplit] = useState(55);
  const container = useRef<HTMLDivElement>(null);
  const index = useMemo(() => (build ? indexTree(build.root) : undefined), [build]);
  const selected = selectedInstance ? index?.byId.get(selectedInstance) : undefined;

  const problemsById = useMemo(() => {
    const m = new Map<string, "error" | "warning">();
    for (const d of report?.diagnostics ?? []) {
      if (!d.instancePath || d.severity === "info") continue;
      if (m.get(d.instancePath) !== "error") m.set(d.instancePath, d.severity as "error" | "warning");
    }
    return m;
  }, [report]);

  // The selection's ancestors are always expanded, so it is never hidden.
  const revealed = useMemo(() => {
    const s = new Set<string>();
    if (selectedInstance && index) for (let p = index.parentOf.get(selectedInstance); p; p = index.parentOf.get(p.id)) s.add(p.id);
    return s;
  }, [selectedInstance, index]);
  useEffect(() => {
    if (!selectedInstance) return;
    const t = setTimeout(() => document.querySelector(`[data-inst="${CSS.escape(selectedInstance)}"]`)?.scrollIntoView({ block: "nearest" }), 30);
    return () => clearTimeout(t);
  }, [selectedInstance]);

  if (!build) return <EmptyState title="No Roblox project">This project has no default.project.json mapping.</EmptyState>;

  const matches = (n: RNode): boolean => !q || n.name.toLowerCase().includes(q.toLowerCase()) || n.className.toLowerCase().includes(q.toLowerCase()) || n.children.some(matches);

  const render = (n: RNode, depth: number): React.ReactNode => {
    if (!matches(n)) return null;
    const open = q ? true : !collapsed.has(n.id) || revealed.has(n.id);
    const problem = problemsById.get(n.id);
    return (
      <div key={n.id}>
        <div
          data-inst={n.id}
          className={cx("group flex h-6 cursor-pointer items-center gap-1 rounded-md pr-2 text-[12.5px]", selectedInstance === n.id ? "bg-accent/15 text-fg" : "text-fg-2 hover:bg-raise")}
          style={{ paddingLeft: depth * 12 + 4 }}
          onClick={() => selectInstance(n.id)}
          onDoubleClick={() => {
            if (n.origin?.file && /\.(luau|lua)$/.test(n.origin.file)) {
              openFile(n.origin.file);
              useLayout.getState().open("editor");
            }
          }}
        >
          <button
            className={cx("grid size-4 place-items-center text-fg-3", !n.children.length && "invisible")}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((s) => {
                const next = new Set(s);
                if (next.has(n.id)) next.delete(n.id);
                else next.add(n.id);
                return next;
              });
            }}
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          <ClassIcon className={n.className} />
          <span className="truncate">{n.name}</span>
          {problem && <SeverityGlyph severity={problem} />}
          <span className="ml-auto hidden text-[10px] text-fg-3 group-hover:inline">{n.className}</span>
        </div>
        {open && n.children.map((c) => render(c, depth + 1))}
      </div>
    );
  };

  const onPropChange = async (prop: string, value: unknown) => {
    if (!selected) return;
    await applyOps([{ op: "set", path: dottedPath(selected.id), properties: { [prop]: value } }]);
  };

  const addChild = async (cls: string) => {
    setPicker(false);
    if (!selected) return;
    const name = await dialog.prompt(`New ${cls}`, { label: `Under ${dottedPath(selected.id)}`, initial: cls, confirmLabel: "Add" });
    if (!name) return;
    const r = await applyOps([{ op: "add", parent: dottedPath(selected.id), className: cls, name }]);
    if (r) {
      selectInstance(`${selected.id}/${name}`);
      toast.ok(r.summary);
    }
  };

  const rename = async () => {
    if (!selected) return;
    const name = await dialog.prompt("Rename instance", { initial: selected.name, confirmLabel: "Rename" });
    if (!name || name === selected.name) return;
    const r = await applyOps([{ op: "rename", path: dottedPath(selected.id), name }]);
    if (r) selectInstance(selected.id.split("/").slice(0, -1).concat(name).join("/"));
  };

  const remove = async () => {
    if (!selected) return;
    if (!(await dialog.confirm(`Delete ${dottedPath(selected.id)}?`, "This removes it from the files that define it. You can restore it from History.", { danger: true, confirmLabel: "Delete" }))) return;
    await applyOps([{ op: "remove", path: dottedPath(selected.id) }]);
    selectInstance(undefined);
  };

  const cls = selected ? getClass(selected.className) : undefined;
  const guiRoot = selected && index ? [selected, ...(function* up(id: string): Generator<RNode> { for (let p = index.parentOf.get(id); p; p = index.parentOf.get(p.id)) yield p; })(selected.id)].find((n) => n.className === "ScreenGui") : undefined;
  const nodeProblems = selected ? (report?.diagnostics ?? []).filter((d) => d.instancePath === selected.id && d.severity !== "info") : [];

  return (
    <div ref={container} className="relative flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-fg-3" />
          <input className="input h-6 pl-7 text-xs" placeholder="Filter instances" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-ghost size-6 justify-center p-0" disabled={!selected || cls?.category === "script"} title="Insert object" onClick={() => setPicker(!picker)}>
          <Plus className="size-3.5" />
        </button>
      </div>
      {picker && selected && <ClassPicker parentClass={selected.className} onPick={addChild} onClose={() => setPicker(false)} />}
      <div className="min-h-0 overflow-y-auto px-1" style={{ height: selected ? `${split}%` : "100%" }}>
        {build.root.children.map((c) => render(c, 0))}
      </div>
      {selected && (
        <>
          <div
            className="h-px shrink-0 cursor-row-resize bg-line hover:bg-accent/60"
            onPointerDown={(e) => {
              const rect = container.current!.getBoundingClientRect();
              const move = (ev: PointerEvent) => setSplit(Math.max(20, Math.min(80, ((ev.clientY - rect.top) / rect.height) * 100)));
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
              e.preventDefault();
            }}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center gap-2">
              <ClassIcon className={selected.className} cls="size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{selected.name}</div>
                <div className="truncate text-[11px] text-fg-3">
                  {selected.className} · {dottedPath(selected.id)}
                </div>
              </div>
              <button className="btn btn-ghost size-6 justify-center p-0" title="Rename" onClick={rename}>
                <Pencil className="size-3.5" />
              </button>
              {!cls?.service && (
                <button className="btn btn-ghost size-6 justify-center p-0" title="Delete" onClick={remove}>
                  <Trash2 className="size-3.5 text-err" />
                </button>
              )}
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selected.origin?.file && (
                <button
                  className="chip hover:text-fg"
                  onClick={() => {
                    openFile(/\.(luau|lua|json)$/.test(selected.origin!.file) ? selected.origin!.file : selected.origin!.file);
                    useLayout.getState().open("editor");
                  }}
                  title="Defined in"
                >
                  <FileCode2 className="size-3" /> {selected.origin.file}
                </button>
              )}
              {guiRoot && (
                <button
                  className="chip hover:text-fg"
                  onClick={() => {
                    sessionStorage.setItem("rb-ui-editor-gui", guiRoot.id);
                    window.dispatchEvent(new Event("rb-ui-editor-gui"));
                    useLayout.getState().open("ui-editor");
                  }}
                >
                  <LayoutTemplate className="size-3" /> Edit visually
                </button>
              )}
            </div>
            {nodeProblems.length > 0 && (
              <div className="mb-3 space-y-1">
                {nodeProblems.map((d, i) => (
                  <div key={i} className={cx("rounded-md px-2 py-1.5 text-[11px] leading-snug", d.severity === "error" ? "bg-err/10 text-err" : "bg-warn/10 text-warn")}>
                    {d.message}
                  </div>
                ))}
              </div>
            )}
            {selected.source !== undefined ? (
              <pre className="max-h-40 overflow-hidden rounded-lg bg-bg-2 p-2 font-mono text-[11px] leading-relaxed text-fg-3 hairline">{selected.source.slice(0, 1200)}</pre>
            ) : cls ? (
              <PropertyGrid node={selected} onChange={onPropChange} />
            ) : (
              <div className="text-xs text-fg-3">No property information for {selected.className}.</div>
            )}
            {Object.keys(selected.attributes).length > 0 && (
              <div className="mt-3">
                <div className="mb-1 panel-title">Attributes</div>
                {Object.entries(selected.attributes).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[11.5px]">
                    <span className="text-fg-2">{k}</span>
                    <span className="font-mono text-fg-3">{"v" in v ? String(v.v) : v.t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
