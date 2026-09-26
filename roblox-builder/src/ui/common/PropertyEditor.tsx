"use client";

import { useState } from "react";
import { allProps, type PropType } from "@/core/roblox/classes";
import { ENUMS, FONT_FAMILIES, FONT_WEIGHTS, familyNameFromUrl } from "@/core/roblox/enums";
import type { RNode } from "@/core/roblox/instance";
import { color3FromHex, color3ToHex, orientationFromRotation, rotationFromOrientation, toRojo, type RValue } from "@/core/roblox/values";
import { cx } from "./ui";

/** Rojo JSON for a typed value; null clears the property. */
export type PropChange = (prop: string, rojoValue: unknown | null) => void;

function Num({ value, onCommit, step = 1, className }: { value: number; onCommit: (n: number) => void; step?: number; className?: string }) {
  const [text, setText] = useState(String(round(value)));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(String(round(value)));
  }
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setText(String(round(value)));
  };
  return (
    <input
      className={cx("input h-6 min-w-0 px-1.5 font-mono text-[11px]", className)}
      value={text}
      inputMode="decimal"
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const n = (Number(text) || 0) + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
          setText(String(round(n)));
          onCommit(round(n));
        }
      }}
    />
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function Vec({ values, labels, onCommit, step }: { values: number[]; labels: string[]; onCommit: (v: number[]) => void; step?: number }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
      {values.map((v, i) => (
        <label key={i} className="relative">
          <span className="pointer-events-none absolute left-1.5 top-1 text-[9px] font-semibold text-fg-3">{labels[i]}</span>
          <Num value={v} step={step} className="pl-4" onCommit={(n) => onCommit(values.map((x, j) => (j === i ? n : x)))} />
        </label>
      ))}
    </div>
  );
}

export function ValueEditor({ type, value, onChange }: { type: PropType; value: RValue | undefined; onChange: (json: unknown | null) => void }) {
  const set = (v: RValue) => onChange(toRojo(v));
  switch (type) {
    case "bool": {
      const on = value?.t === "bool" ? value.v : false;
      return (
        <button onClick={() => onChange(!on)} className={cx("relative h-4 w-7 rounded-full transition-colors", on ? "bg-accent" : "bg-line-2")} aria-pressed={on}>
          <span className={cx("absolute top-0.5 size-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
        </button>
      );
    }
    case "string":
    case "Content": {
      const v = value && (value.t === "string" || value.t === "Content") ? value.v : "";
      return <TextField value={v} placeholder={type === "Content" ? "rbxassetid://" : ""} onCommit={(s) => onChange(s)} />;
    }
    case "int":
    case "float":
    case "BrickColor": {
      const v = value && (value.t === "int" || value.t === "float" || value.t === "BrickColor") ? value.v : 0;
      return <Num value={v} step={type === "float" ? 0.1 : 1} onCommit={(n) => onChange(type === "int" ? { Int32: Math.round(n) } : type === "BrickColor" ? { BrickColor: Math.round(n) } : n)} />;
    }
    case "Vector3":
      return <Vec values={value?.t === "Vector3" ? value.v : [0, 0, 0]} labels={["X", "Y", "Z"]} onCommit={(v) => set({ t: "Vector3", v: v as [number, number, number] })} step={0.5} />;
    case "Vector2":
      return <Vec values={value?.t === "Vector2" ? value.v : [0, 0]} labels={["X", "Y"]} onCommit={(v) => set({ t: "Vector2", v: v as [number, number] })} step={0.05} />;
    case "UDim":
      return <Vec values={value?.t === "UDim" ? value.v : [0, 0]} labels={["S", "O"]} onCommit={(v) => set({ t: "UDim", v: v as [number, number] })} />;
    case "UDim2":
      return (
        <div className="space-y-1">
          <Vec values={value?.t === "UDim2" ? [value.v[0], value.v[1]] : [0, 0]} labels={["xS", "xO"]} onCommit={(v) => set({ t: "UDim2", v: [v[0], v[1], value?.t === "UDim2" ? value.v[2] : 0, value?.t === "UDim2" ? value.v[3] : 0] })} step={1} />
          <Vec values={value?.t === "UDim2" ? [value.v[2], value.v[3]] : [0, 0]} labels={["yS", "yO"]} onCommit={(v) => set({ t: "UDim2", v: [value?.t === "UDim2" ? value.v[0] : 0, value?.t === "UDim2" ? value.v[1] : 0, v[0], v[1]] })} step={1} />
        </div>
      );
    case "Color3": {
      const hex = value?.t === "Color3" ? color3ToHex(value.v) : "#ffffff";
      return (
        <div className="flex items-center gap-1.5">
          <label className="relative size-6 shrink-0 overflow-hidden rounded-md hairline" style={{ background: hex }}>
            <input type="color" value={hex} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => set({ t: "Color3", v: color3FromHex(e.target.value) })} />
          </label>
          <TextField value={hex} onCommit={(s) => { try { set({ t: "Color3", v: color3FromHex(s) }); } catch { /* ignore bad input */ } }} mono />
        </div>
      );
    }
    case "Font": {
      const family = value?.t === "Font" ? familyNameFromUrl(value.family) : "BuilderSans";
      const weight = value?.t === "Font" ? value.weight : "Regular";
      const style = value?.t === "Font" ? value.style : "Normal";
      return (
        <div className="grid grid-cols-2 gap-1">
          <select className="input h-6 px-1 text-[11px]" value={family} onChange={(e) => set({ t: "Font", family: FONT_FAMILIES[e.target.value], weight, style })}>
            {Object.keys(FONT_FAMILIES).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select className="input h-6 px-1 text-[11px]" value={weight} onChange={(e) => set({ t: "Font", family: FONT_FAMILIES[family] ?? FONT_FAMILIES.BuilderSans, weight: e.target.value, style })}>
            {Object.keys(FONT_WEIGHTS).map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
      );
    }
    case "CFrame": {
      const pos = value?.t === "CFrame" ? value.pos : [0, 0, 0];
      const rot = value?.t === "CFrame" ? orientationFromRotation(value.rot) : [0, 0, 0];
      return (
        <div className="space-y-1">
          <Vec values={pos} labels={["X", "Y", "Z"]} step={0.5} onCommit={(v) => set({ t: "CFrame", pos: v as [number, number, number], rot: value?.t === "CFrame" ? value.rot : rotationFromOrientation([0, 0, 0]) })} />
          <Vec values={rot} labels={["rX", "rY", "rZ"]} step={5} onCommit={(v) => set({ t: "CFrame", pos: pos as [number, number, number], rot: rotationFromOrientation(v as [number, number, number]) })} />
        </div>
      );
    }
    default: {
      if (type.startsWith("Enum:")) {
        const name = type.slice(5);
        const items = Object.keys(ENUMS[name] ?? {});
        const v = value?.t === "Enum" ? value.v : "";
        return (
          <select className="input h-6 px-1 text-[11px]" value={v} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">(default)</option>
            {items.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        );
      }
      return <span className="truncate font-mono text-[11px] text-fg-3">{value ? JSON.stringify(toRojo(value)).slice(0, 60) : "—"}</span>;
    }
  }
}

function TextField({ value, onCommit, placeholder, mono }: { value: string; onCommit: (s: string) => void; placeholder?: string; mono?: boolean }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  return (
    <input
      className={cx("input h-6 px-1.5 text-[11px]", mono && "font-mono")}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

const GROUP_ORDER = ["Appearance", "Layout", "Text", "Image", "Data", "Behavior", "Other"];

function groupOf(prop: string): string {
  if (/Color|Transparency|Material|Reflectance|Border|Background|Stroke|Gradient|Corner|Brightness|Shadow/.test(prop)) return "Appearance";
  if (/Size|Position|Anchor|Rotation|CFrame|Orientation|ZIndex|LayoutOrder|Padding|Alignment|Direction|Cell|Automatic|Aspect|Canvas|Offset|Scale/.test(prop)) return "Layout";
  if (/Text|Font|Line|RichText|Grapheme/.test(prop)) return "Text";
  if (/Image|Slice|Tile|Resample/.test(prop)) return "Image";
  if (/Value|Source|Id$|Texture|Mesh|Sound/.test(prop)) return "Data";
  if (/Enabled|Visible|Anchored|Can|Active|Locked|Massless|Disabled|RunContext|Interactable|Clips|Modal|Selected/.test(prop)) return "Behavior";
  return "Other";
}

export function PropertyGrid({ node, onChange, filter }: { node: RNode; onChange: PropChange; filter?: string }) {
  const props = allProps(node.className);
  const [showAll, setShowAll] = useState(false);
  const names = Object.keys(props).filter((p) => p !== "Name" && p !== "Archivable" && (!filter || p.toLowerCase().includes(filter.toLowerCase())));
  const visible = showAll || filter ? names : names.filter((p) => node.properties[p] !== undefined);
  const groups = new Map<string, string[]>();
  for (const p of visible) {
    const g = groupOf(p);
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return (
    <div className="space-y-3">
      {GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
        <div key={g}>
          <div className="mb-1 panel-title">{g}</div>
          <div className="space-y-1">
            {groups.get(g)!.map((p) => {
              const isSet = node.properties[p] !== undefined;
              return (
                <div key={p} className="group grid grid-cols-[112px_1fr_14px] items-center gap-2">
                  <span className={cx("truncate text-[11.5px]", isSet ? "text-fg-2" : "text-fg-3")} title={`${p}: ${props[p]}`}>
                    {p}
                  </span>
                  <ValueEditor type={props[p]} value={node.properties[p]} onChange={(v) => onChange(p, v)} />
                  {isSet ? (
                    <button className="text-[10px] text-fg-3 opacity-0 hover:text-err group-hover:opacity-100" title="Reset to Roblox default" onClick={() => onChange(p, null)}>
                      ✕
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!filter && names.length > visible.length && (
        <button className="text-[11px] text-accent hover:underline" onClick={() => setShowAll(true)}>
          Show all {names.length} properties
        </button>
      )}
      {!filter && showAll && (
        <button className="text-[11px] text-fg-3 hover:underline" onClick={() => setShowAll(false)}>
          Only show set properties
        </button>
      )}
    </div>
  );
}
