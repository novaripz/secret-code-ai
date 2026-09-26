"use client";

import { Check, ExternalLink, Flame, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BranchInfo } from "@/core/project/types";
import { layoutGui } from "@/core/roblox/gui";
import { buildDataModel } from "@/core/roblox/rojo";
import { isRobloxKind } from "@/core/roblox/template";
import { api } from "../api";
import { DeviceFrame } from "../common/DeviceFrame";
import { GuiBoxes } from "../common/GuiRenderer";
import { cx, Spinner, StatusIcon, toast, useDialog } from "../common/ui";
import { isRunning, useWorkspace } from "../workspace/store";

function VariantPreview({ branch }: { branch: BranchInfo }) {
  const { projectId, meta, runs, pastRuns } = useWorkspace();
  const [files, setFiles] = useState<Map<string, string | Uint8Array> | null>(null);
  const run = Object.values(runs).find((r) => r.summary?.branch === branch.name);
  const done = !run || !isRunning(run);
  const liveVersion = run?.changedFiles.size ?? 0;
  useEffect(() => {
    let cancelled = false;
    api.bundle(projectId, branch.name).then(({ files }) => {
      if (cancelled) return;
      const m = new Map<string, string | Uint8Array>();
      for (const [p, f] of Object.entries(files)) m.set(p, f.text ?? new Uint8Array(0));
      setFiles(m);
    });
    return () => {
      cancelled = true;
    };
    // Refresh as the variant's run writes files, and once more when it finishes.
  }, [projectId, branch.name, liveVersion, done, pastRuns.length]);
  if (!meta) return null;
  if (!isRobloxKind(meta.kind)) {
    return <iframe title={branch.name} src={`/api/projects/${projectId}/preview/~${encodeURIComponent(branch.name)}/index.html?v=${liveVersion}`} sandbox="allow-scripts" className="pointer-events-none h-full w-full bg-white" />;
  }
  if (!files) return <div className="skeleton h-full w-full" />;
  const b = buildDataModel(files);
  const gui = b.root.children.find((c) => c.className === "StarterGui")?.children.find((g) => g.className === "ScreenGui");
  if (!gui) return <div className="grid h-full place-items-center text-xs text-fg-3">No ScreenGui yet</div>;
  const box = layoutGui(gui, { w: 1280, h: 720 });
  return (
    <DeviceFrame w={1280} h={720} className="bg-gradient-to-br from-slate-600 to-slate-800">
      <GuiBoxes box={box} />
    </DeviceFrame>
  );
}

export default function ForgePanel() {
  const { projectId, branches, branch: current, runs, pastRuns, attachRun, refreshMeta, switchBranch, meta, status } = useWorkspace();
  const dialog = useDialog();
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(3);
  const [custom, setCustom] = useState(false);
  const [directions, setDirections] = useState<{ label: string; brief: string }[]>([
    { label: "", brief: "" },
    { label: "", brief: "" },
    { label: "", brief: "" },
  ]);
  const [busy, setBusy] = useState(false);

  const batches = useMemo(() => {
    const m = new Map<string, BranchInfo[]>();
    for (const b of branches) if (b.forgeBatch) m.set(b.forgeBatch, [...(m.get(b.forgeBatch) ?? []), b]);
    return [...m.entries()].sort((a, b) => (b[1][0]?.createdAt ?? 0) - (a[1][0]?.createdAt ?? 0));
  }, [branches]);

  const statusOf = (name: string) => {
    const live = Object.values(runs).find((r) => r.summary?.branch === name);
    if (live) return { running: isRunning(live), phase: live.phase, status: live.summary?.status, checks: live.summary?.checks };
    const past = pastRuns.find((r) => r.branch === name);
    return { running: past?.status === "running", phase: past?.phase, status: past?.status, checks: past?.checks };
  };

  const forge = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const dirs = custom ? directions.slice(0, count).filter((d) => d.label.trim() && d.brief.trim()) : undefined;
      if (custom && dirs!.length !== count) {
        toast.error("Fill in a name and brief for every direction, or let the AI propose them");
        return;
      }
      const r = await api.forge({ projectId, prompt: prompt.trim(), count, directions: dirs });
      await refreshMeta();
      const { runs: all } = await api.runs(projectId);
      for (const v of r.variants) {
        const s = all.find((x) => x.runId === v.runId);
        if (s) attachRun(s);
      }
      toast.ok(`Forging ${r.variants.length} versions in parallel`);
      setPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const adopt = async (b: BranchInfo) => {
    const base = b.createdFrom?.branch ?? "main";
    if (!(await dialog.confirm(`Use “${b.label ?? b.name}”?`, `${base} becomes this version. A restore point is saved first.`, { confirmLabel: "Adopt version" }))) return;
    await api.adopt(projectId, b.name, base);
    if (current !== base) await switchBranch(base);
    else await useWorkspace.getState().refreshFiles();
    toast.ok(`Adopted ${b.label ?? b.name} into ${base}`);
  };

  const discard = async (b: BranchInfo) => {
    if (!(await dialog.confirm(`Discard “${b.label ?? b.name}”?`, "Deletes this version's branch.", { confirmLabel: "Discard", danger: true }))) return;
    await api.deleteBranch(projectId, b.name);
    if (current === b.name) await switchBranch(b.createdFrom?.branch ?? "main");
    else await refreshMeta();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-5">
        <div className="rounded-2xl bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-violet-500/10 p-4 hairline">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Flame className="size-4 text-orange-400" /> Forge
            <span className="text-xs font-normal text-fg-3">Several distinct versions, built in parallel on their own branches</span>
          </div>
          <textarea
            className="input h-20 resize-none py-2 leading-relaxed"
            placeholder={meta?.kind === "web-app" ? "A pricing page with three tiers…" : "A main menu with play, shop and settings…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-fg-3">Versions</span>
            {[2, 3, 4, 5].map((n) => (
              <button key={n} className={cx("btn h-7 w-8 justify-center p-0", count === n && "bg-accent/20 text-fg")} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
            <label className="ml-2 flex items-center gap-1.5 text-xs text-fg-2">
              <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> I&apos;ll choose the directions
            </label>
            <div className="flex-1" />
            <button className="btn btn-primary h-8" disabled={!prompt.trim() || busy || !status?.ai.configured} onClick={forge}>
              {busy ? <Spinner /> : <Flame className="size-3.5" />} Forge {count}
            </button>
          </div>
          {custom && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="rounded-xl bg-bg-2/70 p-2 hairline">
                  <input
                    className="input mb-1 h-7"
                    placeholder={`Direction ${i + 1} name`}
                    value={directions[i]?.label ?? ""}
                    onChange={(e) => setDirections((d) => Object.assign([...d], { [i]: { ...(d[i] ?? { brief: "" }), label: e.target.value } }))}
                  />
                  <input
                    className="input h-7"
                    placeholder="What makes it different"
                    value={directions[i]?.brief ?? ""}
                    onChange={(e) => setDirections((d) => Object.assign([...d], { [i]: { ...(d[i] ?? { label: "" }), brief: e.target.value } }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {batches.length === 0 && <div className="mt-8 text-center text-sm text-fg-3">No forged versions yet.</div>}
        {batches.map(([batch, list]) => (
          <div key={batch} className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-fg-3">
              <Flame className="size-3.5" /> Batch {batch} · from {list[0].createdFrom?.branch ?? "main"}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((b) => {
                const s = statusOf(b.name);
                return (
                  <div key={b.name} className={cx("overflow-hidden rounded-2xl bg-panel-2 hairline", current === b.name && "ring-1 ring-accent")}>
                    <div className="relative aspect-video overflow-hidden bg-bg-2">
                      <VariantPreview branch={b} />
                      {s.running && (
                        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/50 px-3 py-1.5 text-[11px] text-white backdrop-blur">
                          <Spinner className="size-3" /> <span className="capitalize">{s.phase}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={s.running ? "running" : s.status === "completed" ? "pass" : s.status === "failed" ? "fail" : "skip"} className="size-3.5" />
                        <span className="flex-1 truncate text-sm font-medium">{b.label ?? b.name}</span>
                        {s.checks && (
                          <span className="font-mono text-[10px] text-fg-3">
                            ✕{s.checks.errors} ⚠{s.checks.warnings}
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        <button className="btn h-7 flex-1 justify-center text-xs" onClick={() => switchBranch(b.name)} disabled={current === b.name}>
                          <ExternalLink className="size-3" /> {current === b.name ? "Current" : "Open"}
                        </button>
                        <button className="btn h-7 flex-1 justify-center text-xs" onClick={() => adopt(b)} disabled={s.running}>
                          <Check className="size-3" /> Adopt
                        </button>
                        <button className="btn h-7 justify-center px-2 text-xs" onClick={() => discard(b)} title="Discard">
                          <Trash2 className="size-3 text-err" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

