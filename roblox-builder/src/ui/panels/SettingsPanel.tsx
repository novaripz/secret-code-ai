"use client";

import { Bot, Check, Plus, Save, Server, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectMemory } from "@/core/project/types";
import { api } from "../api";
import { cx, Spinner, StatusIcon, toast } from "../common/ui";
import { useWorkspace } from "../workspace/store";

const SECTIONS: { key: Exclude<keyof ProjectMemory, "decisions">; title: string; hint: string }[] = [
  { key: "goals", title: "Goals", hint: "What this project is for" },
  { key: "architecture", title: "Architecture", hint: "Systems, modules and how they talk" },
  { key: "designSystem", title: "Design system", hint: "Colours, fonts, radii, spacing" },
  { key: "preferences", title: "Preferences", hint: "How you like things done" },
  { key: "knownBugs", title: "Known bugs", hint: "Open problems to remember" },
  { key: "notes", title: "Notes", hint: "Anything else" },
];

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="group flex items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-raise">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-3" />
          <span className="flex-1 leading-relaxed text-fg-2">{it}</span>
          <button className="opacity-0 group-hover:opacity-100" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X className="size-3 text-fg-3 hover:text-err" />
          </button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <input
          className="input h-7 text-xs"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <button className="btn h-7 px-2" disabled={!draft.trim()} onClick={() => { onChange([...items, draft.trim()]); setDraft(""); }}>
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const { projectId, meta, status, refreshMeta } = useWorkspace();
  const [memory, setMemory] = useState<ProjectMemory>();
  const [dirty, setDirty] = useState(false);
  const [desc, setDesc] = useState(meta?.description ?? "");
  const [prevDesc, setPrevDesc] = useState(meta?.description);
  if (meta?.description !== prevDesc) {
    setPrevDesc(meta?.description);
    setDesc(meta?.description ?? "");
  }

  useEffect(() => {
    api.memory(projectId).then((r) => setMemory(r.memory));
  }, [projectId]);

  if (!meta || !memory) return <div className="grid h-full place-items-center"><Spinner className="size-5 text-fg-3" /></div>;
  const update = (m: ProjectMemory) => {
    setMemory(m);
    setDirty(true);
  };
  const saveMemory = async () => {
    const r = await api.setMemory(projectId, memory).catch((e) => toast.error(e.message));
    if (r) {
      setMemory(r.memory);
      setDirty(false);
      toast.ok("Memory saved; the agent will use it from the next request");
    }
  };
  const setting = async (patch: Parameters<typeof api.updateProject>[1]) => {
    await api.updateProject(projectId, patch).catch((e) => toast.error(e.message));
    await refreshMeta();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Bot className="size-4 text-accent" />
            <h2 className="text-sm font-semibold">Project memory</h2>
            <span className="text-xs text-fg-3">The agent reads this at the start of every request and keeps it updated.</span>
            <div className="flex-1" />
            <button className="btn btn-primary h-7" disabled={!dirty} onClick={saveMemory}>
              <Save className="size-3.5" /> Save
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <div key={s.key} className="rounded-xl bg-panel-2 p-3 hairline">
                <div className="mb-2 text-xs font-medium">
                  {s.title} <span className="font-normal text-fg-3">· {s.hint}</span>
                </div>
                <ListEditor items={memory[s.key]} placeholder={`Add to ${s.title.toLowerCase()}`} onChange={(v) => update({ ...memory, [s.key]: v })} />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-panel-2 p-3 hairline">
            <div className="mb-2 text-xs font-medium">Decisions log</div>
            {memory.decisions.length === 0 && <div className="text-xs text-fg-3">The agent records its decisions and reasons here.</div>}
            {[...memory.decisions].reverse().slice(0, 40).map((d, i) => (
              <div key={i} className="flex gap-3 border-b border-line/60 py-1.5 text-xs last:border-0">
                <span className="w-16 shrink-0 text-fg-3">{new Date(d.at).toLocaleDateString()}</span>
                <span className="text-fg-2">{d.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-panel-2 p-4 hairline">
            <div className="mb-3 text-sm font-semibold">Project</div>
            <label className="text-[11px] text-fg-3">
              Description
              <textarea className="input mt-1 h-20 resize-none py-2" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== meta.description && setting({ description: desc })} />
            </label>
            <label className="mt-3 flex items-start gap-2.5 text-xs">
              <input type="checkbox" className="mt-0.5" checked={!!meta.settings.autoApproveDestructive} onChange={(e) => setting({ settings: { autoApproveDestructive: e.target.checked } })} />
              <span>
                <span className="font-medium">Let the agent delete and restore without asking</span>
                <span className="block text-fg-3">Autopilot always runs unattended. With this on, guided mode does too. Every run is snapshotted, so changes stay undoable.</span>
              </span>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-fg-3">
                3D export units
                <select className="input mt-1" value={meta.settings.assetUnits ?? "studs"} onChange={(e) => setting({ settings: { assetUnits: e.target.value as "studs" } })}>
                  <option value="studs">Studs (1:1)</option>
                  <option value="meters">Meters (1 stud = 0.28 m)</option>
                </select>
              </label>
              <div className="text-[11px] text-fg-3">
                3D export formats
                <div className="mt-1.5 flex gap-2">
                  {(["glb", "gltf", "obj"] as const).map((f) => {
                    const on = (meta.settings.assetFormats ?? ["glb"]).includes(f);
                    return (
                      <button
                        key={f}
                        className={cx("chip", on && "bg-accent/15 text-fg")}
                        onClick={() => {
                          const cur = meta.settings.assetFormats ?? ["glb"];
                          const next = on ? cur.filter((x) => x !== f) : [...cur, f];
                          if (next.length) setting({ settings: { assetFormats: next } });
                        }}
                      >
                        {on && <Check className="size-3" />} {f.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-panel-2 p-4 hairline">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Server className="size-4" /> Server status
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <StatusIcon status={status?.ai.configured ? "pass" : "warn"} className="size-3.5" />
                <span className="flex-1">AI provider</span>
                <span className="text-fg-3">{status?.ai.active ? `${status.ai.active.label} · ${status.ai.active.model}` : "not configured"}</span>
              </div>
              {!status?.ai.configured && <div className="rounded-lg bg-warn/10 p-2 text-[11px] leading-relaxed text-warn">{status?.ai.hint}</div>}
              <div className="flex items-center gap-2">
                <StatusIcon status={status?.commands ? "pass" : "skip"} className="size-3.5" />
                <span className="flex-1">Command execution</span>
                <span className="text-fg-3">{status?.commands ? "enabled" : "disabled"}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={status?.browser ? "pass" : "skip"} className="size-3.5" />
                <span className="flex-1">Headless browser for web tests</span>
                <span className="text-fg-3">{status?.browser ? "available" : "missing"}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={status?.robloxCloud ? "pass" : "skip"} className="size-3.5" />
                <span className="flex-1">Roblox Open Cloud</span>
                <span className="text-fg-3">{status?.robloxCloud ? "configured" : "no API key"}</span>
              </div>
              <div className="pt-1 panel-title">Toolchain</div>
              {Object.entries(status?.tools ?? {}).map(([tool, ok]) => (
                <div key={tool} className="flex items-center gap-2">
                  <StatusIcon status={ok ? "pass" : "skip"} className="size-3.5" />
                  <span className="flex-1 font-mono">{tool}</span>
                  <span className="text-fg-3">{ok ? "installed" : "not installed (built-in checks used instead)"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
