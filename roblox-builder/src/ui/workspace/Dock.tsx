"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import { Suspense, useRef, useState, type DragEvent } from "react";
import { cx, Spinner } from "../common/ui";
import { useLayout, type DockId } from "./layout";
import { PANELS, panelAvailable } from "./panels";
import { useWorkspace } from "./store";

const DRAG_TYPE = "application/x-rb-panel";

function PanelBody({ id }: { id: string }) {
  const def = PANELS[id];
  if (!def) return null;
  const C = def.component;
  return (
    <Suspense fallback={<div className="grid h-full place-items-center"><Spinner className="size-5 text-fg-3" /></div>}>
      <C />
    </Suspense>
  );
}

export function DockView({ dock }: { dock: DockId }) {
  const { layout, setActive, toggle, move, close } = useLayout();
  const kind = useWorkspace((s) => s.meta?.kind);
  const state = layout[dock];
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const panels = state.panels.filter((p) => PANELS[p] && panelAvailable(p, kind));
  const active = panels.includes(state.active ?? "") ? state.active! : panels[0];
  const vertical = dock === "left" || dock === "right";

  const onDrop = (e: DragEvent) => {
    const panel = e.dataTransfer.getData(DRAG_TYPE);
    setDropIndex(null);
    if (!panel) return;
    e.preventDefault();
    const idx = dropIndex ?? state.panels.length;
    move(panel, dock, idx);
  };

  const indexAt = (clientX: number) => {
    const tabs = strip.current ? [...strip.current.querySelectorAll<HTMLElement>("[data-tab]")] : [];
    for (let i = 0; i < tabs.length; i++) {
      const r = tabs[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return state.panels.indexOf(tabs[i].dataset.tab!);
    }
    return state.panels.length;
  };

  if (state.collapsed && dock !== "center") {
    if (vertical) {
      return (
        <div
          className="flex w-10 shrink-0 flex-col items-center gap-1 border-line bg-panel py-2"
          style={{ borderRightWidth: dock === "left" ? 1 : 0, borderLeftWidth: dock === "right" ? 1 : 0 }}
          onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()}
          onDrop={onDrop}
        >
          {panels.map((p) => {
            const Icon = PANELS[p].icon;
            return (
              <button key={p} className="btn btn-ghost size-8 justify-center p-0" title={PANELS[p].title} onClick={() => setActive(dock, p)}>
                <Icon className="size-4" />
              </button>
            );
          })}
          <div className="flex-1" />
          <button className="btn btn-ghost size-8 justify-center p-0" onClick={() => toggle(dock, true)} title="Expand">
            {dock === "left" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
      );
    }
    return (
      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-line bg-panel px-2" onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault()} onDrop={onDrop}>
        {panels.map((p) => (
          <button key={p} className="btn btn-ghost h-6 px-2 text-xs" onClick={() => setActive(dock, p)}>
            {PANELS[p].title}
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn btn-ghost size-6 justify-center p-0" onClick={() => toggle(dock, true)} title="Expand">
          <ChevronUp className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <section
      className={cx("flex min-h-0 min-w-0 flex-col bg-panel", dock === "center" && "flex-1")}
      style={vertical ? { width: state.size } : dock === "bottom" ? { height: state.size } : undefined}
      aria-label={`${dock} dock`}
    >
      <div
        ref={strip}
        className="relative flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-1.5 [scrollbar-width:none]"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDropIndex(indexAt(e.clientX));
        }}
        onDragLeave={() => setDropIndex(null)}
        onDrop={onDrop}
      >
        {panels.map((p) => {
          const def = PANELS[p];
          const Icon = def.icon;
          const isActive = p === active;
          const showDrop = dropIndex !== null && state.panels.indexOf(p) === dropIndex;
          return (
            <div key={p} data-tab={p} className="relative flex items-center">
              {showDrop && <span className="absolute -left-0.5 top-1 h-5 w-0.5 rounded bg-accent" />}
              <button
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, p);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => setActive(dock, p)}
                onAuxClick={(e) => e.button === 1 && close(p)}
                title={`${def.title} — drag to another dock to move it`}
                className={cx(
                  "group flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                  isActive ? "bg-raise text-fg" : "text-fg-3 hover:bg-raise/60 hover:text-fg-2",
                )}
              >
                <Icon className={cx("size-3.5", isActive && "text-accent")} />
                {def.title}
                <PanelBadge id={p} />
                <X
                  className="ml-0.5 size-3 opacity-0 hover:text-fg group-hover:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(p);
                  }}
                />
              </button>
            </div>
          );
        })}
        {dropIndex !== null && dropIndex >= state.panels.length && <span className="h-5 w-0.5 rounded bg-accent" />}
        <div className="flex-1" />
        {dock !== "center" && (
          <button className="btn btn-ghost size-6 shrink-0 justify-center p-0" onClick={() => toggle(dock, false)} title="Collapse">
            {dock === "left" ? <ChevronLeft className="size-3.5" /> : dock === "right" ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">{active ? <PanelBody id={active} /> : <div className="grid h-full place-items-center text-xs text-fg-3">Drop a panel here</div>}</div>
    </section>
  );
}

function PanelBadge({ id }: { id: string }) {
  const report = useWorkspace((s) => s.report);
  const dirty = useWorkspace((s) => Object.keys(s.buffers).length);
  const approvals = useWorkspace((s) => (s.activeRunId ? s.runs[s.activeRunId]?.pendingApprovals.length ?? 0 : 0));
  if (id === "checks" && report) {
    if (report.summary.error) return <span className="rounded-full bg-err/15 px-1.5 text-[10px] text-err">{report.summary.error}</span>;
    if (report.summary.warning) return <span className="rounded-full bg-warn/15 px-1.5 text-[10px] text-warn">{report.summary.warning}</span>;
    return <span className="text-[10px] text-ok">✓</span>;
  }
  if (id === "editor" && dirty) return <span className="size-1.5 rounded-full bg-accent" />;
  if (id === "agent" && approvals) return <span className="rounded-full bg-warn/20 px-1.5 text-[10px] text-warn">{approvals}</span>;
  return null;
}

export function Resizer({ dock }: { dock: DockId }) {
  const { layout, resize } = useLayout();
  const vertical = dock === "bottom";
  const state = layout[dock];
  if (state.collapsed) return null;
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = vertical ? e.clientY : e.clientX;
    const initial = state.size;
    const move = (ev: PointerEvent) => {
      const pos = vertical ? ev.clientY : ev.clientX;
      const delta = pos - start;
      resize(dock, dock === "left" ? initial + delta : initial - delta);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      role="separator"
      onPointerDown={onPointerDown}
      onDoubleClick={() => resize(dock, vertical ? 230 : dock === "left" ? 272 : 440)}
      className={cx(
        "group relative z-10 shrink-0 bg-line transition-colors hover:bg-accent/60",
        vertical ? "h-px cursor-row-resize before:absolute before:inset-x-0 before:-top-1.5 before:h-3" : "w-px cursor-col-resize before:absolute before:inset-y-0 before:-left-1.5 before:w-3",
      )}
    />
  );
}
