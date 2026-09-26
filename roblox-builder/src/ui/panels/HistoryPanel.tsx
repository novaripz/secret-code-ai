"use client";

import { Bot, Camera, GitBranch, GitCompare, History, RotateCcw, Save, Undo2, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunSummary } from "@/core/agent/events";
import type { SnapshotInfo } from "@/core/project/types";
import type { FileChange, Hunk } from "@/core/versions/diff";
import { api } from "../api";
import { cx, EmptyState, Segmented, Spinner, StatusIcon, timeAgo, toast, useDialog } from "../common/ui";
import { useWorkspace } from "../workspace/store";
import { fileIcon } from "./FilesPanel";

interface Compare {
  from: string;
  to: string; // snapshot id or "current"
  title: string;
}

function reasonIcon(r: SnapshotInfo["reason"]) {
  if (r === "agent-start" || r === "agent-end") return <Bot className="size-3.5 text-accent" />;
  if (r === "repair") return <Wrench className="size-3.5 text-accent-2" />;
  if (r === "before-restore") return <RotateCcw className="size-3.5 text-warn" />;
  if (r === "branch") return <GitBranch className="size-3.5 text-accent-2" />;
  return <Camera className="size-3.5 text-fg-3" />;
}

function DiffView({ compare }: { compare: Compare }) {
  const { projectId, branch, refreshFiles, validate } = useWorkspace();
  const dialog = useDialog();
  const [changes, setChanges] = useState<FileChange[] | null>(null);
  const [file, setFile] = useState<string>();

  useEffect(() => {
    api.diff(projectId, branch, compare.from, compare.to).then((r) => {
      setChanges(r.changes);
      if (r.changes[0]) setFile(r.changes[0].path);
    }).catch((e) => toast.error(e.message));
  }, [compare, projectId, branch]);

  const restoreFile = async (path: string) => {
    // Restore the "from" side of this file into the working tree.
    if (!(await dialog.confirm(`Restore ${path}?`, `Replaces the current ${path} with its version from the older side of this comparison.`, { confirmLabel: "Restore file" }))) return;
    await api.restoreSnapshot(projectId, branch, compare.from, [path]);
    await refreshFiles();
    validate();
    toast.ok(`Restored ${path}`);
  };

  if (!changes) return <div className="grid h-full place-items-center"><Spinner className="size-5 text-fg-3" /></div>;
  if (!changes.length) return <EmptyState icon={<GitCompare className="size-5" />} title="No differences">{compare.title}</EmptyState>;
  const add = changes.reduce((a, c) => a + c.additions, 0);
  const del = changes.reduce((a, c) => a + c.deletions, 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
        <GitCompare className="size-3.5 text-accent" />
        <span className="truncate font-medium">{compare.title}</span>
        <span className="text-fg-3">
          {changes.length} files · <span className="text-ok">+{add}</span> <span className="text-err">−{del}</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 overflow-y-auto border-r border-line p-1">
          {changes.map((c) => (
            <button key={c.path} onClick={() => setFile(c.path)} className={cx("flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs", file === c.path ? "bg-accent/15" : "hover:bg-raise")}>
              <span className={cx("w-3 font-mono font-bold", c.status === "added" ? "text-ok" : c.status === "removed" ? "text-err" : "text-warn")}>{c.status[0].toUpperCase()}</span>
              {fileIcon(c.path, "size-3")}
              <span className="min-w-0 flex-1 truncate" title={c.path}>
                {c.path.split("/").pop()}
              </span>
              {!c.binary && (
                <span className="font-mono text-[10px]">
                  <span className="text-ok">+{c.additions}</span> <span className="text-err">−{c.deletions}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-auto">
          {file && (
            <div className="sticky top-0 z-10 flex h-8 items-center gap-2 border-b border-line bg-panel px-3 text-xs">
              <span className="truncate font-mono">{file}</span>
              <div className="flex-1" />
              {compare.to === "current" && (
                <button className="btn h-6 text-xs" onClick={() => restoreFile(file)}>
                  <Undo2 className="size-3" /> Revert this file
                </button>
              )}
            </div>
          )}
          {file && <FileHunks key={`${compare.from}-${compare.to}-${file}`} compare={compare} file={file} />}
        </div>
      </div>
    </div>
  );
}

function FileHunks({ compare, file }: { compare: Compare; file: string }) {
  const { projectId, branch } = useWorkspace();
  const [hunks, setHunks] = useState<Hunk[] | null | undefined>();
  useEffect(() => {
    api.diff(projectId, branch, compare.from, compare.to, file).then((r) => setHunks(r.hunks ?? null)).catch(() => setHunks(null));
  }, [file, compare, projectId, branch]);
  if (hunks === undefined) return <div className="p-4"><Spinner className="text-fg-3" /></div>;
  if (hunks === null) return <div className="p-4 text-xs text-fg-3">Binary file; no line diff.</div>;
  return (
            <div className="font-mono text-[12px] leading-[1.55]">
              {hunks.map((h, i) => (
                <div key={i}>
                  <div className="bg-accent/10 px-3 py-0.5 text-[11px] text-accent">
                    @@ −{h.aStart} +{h.bStart} @@
                  </div>
                  {h.lines.map((l, j) => (
                    <div key={j} className={cx("flex", l.kind === "add" ? "bg-ok/10" : l.kind === "remove" ? "bg-err/10" : "")}>
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-fg-3/70">{l.a ?? ""}</span>
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-fg-3/70">{l.b ?? ""}</span>
                      <span className={cx("w-4 shrink-0 select-none", l.kind === "add" ? "text-ok" : l.kind === "remove" ? "text-err" : "text-fg-3")}>{l.kind === "add" ? "+" : l.kind === "remove" ? "−" : " "}</span>
                      <span className="whitespace-pre text-fg-2">{l.line}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
  );
}

export default function HistoryPanel() {
  const { projectId, branch, branches, pastRuns, refreshFiles, validate, switchBranch, refreshMeta } = useWorkspace();
  const dialog = useDialog();
  const [tab, setTab] = useState<"snapshots" | "runs" | "branches">("snapshots");
  const [snaps, setSnaps] = useState<SnapshotInfo[] | null>(null);
  const [compare, setCompare] = useState<Compare>();

  const load = useCallback(() => {
    api.snapshots(projectId, branch).then((r) => setSnaps(r.snapshots)).catch((e) => toast.error(e.message));
  }, [projectId, branch]);
  useEffect(load, [load, pastRuns]);

  useEffect(() => {
    const focus = () => {
      try {
        const raw = sessionStorage.getItem("rb-history-focus");
        if (!raw) return;
        sessionStorage.removeItem("rb-history-focus");
        const f = JSON.parse(raw) as { from: string; to?: string };
        setTab("runs");
        setCompare({ from: f.from, to: f.to ?? "current", title: "Changes made by the agent run" });
      } catch {
        /* ignore */
      }
    };
    focus();
    window.addEventListener("rb-history-focus", focus);
    return () => window.removeEventListener("rb-history-focus", focus);
  }, []);

  const runs = useMemo(() => pastRuns.filter((r) => r.branch === branch), [pastRuns, branch]);

  const restore = async (s: SnapshotInfo) => {
    if (!(await dialog.confirm(`Restore “${s.label}”?`, "The branch goes back to exactly this state. The current state is snapshotted first, so this is undoable.", { confirmLabel: "Restore" }))) return;
    await api.restoreSnapshot(projectId, branch, s.id);
    await refreshFiles();
    validate();
    load();
    toast.ok("Restored");
  };

  const branchFrom = async (s: SnapshotInfo) => {
    const name = await dialog.prompt("Branch from this snapshot", { placeholder: "try-alternative", confirmLabel: "Create branch" });
    if (!name) return;
    await api.createBranch(projectId, { name, fromSnapshot: s.id }).catch((e) => toast.error(e.message));
    await refreshMeta();
    toast.ok(`Created ${name}`);
  };

  const undoRun = async (r: RunSummary) => {
    if (!r.startSnapshot) return;
    if (!(await dialog.confirm("Undo this run?", `Restores ${branch} to its state before “${r.prompt.slice(0, 80)}”. Undoable from Snapshots.`, { confirmLabel: "Undo run" }))) return;
    await api.restoreSnapshot(projectId, branch, r.startSnapshot);
    await refreshFiles();
    validate();
    load();
  };

  const snapshotNow = async () => {
    const label = await dialog.prompt("Save a restore point", { placeholder: "Working shop UI", confirmLabel: "Save" });
    if (!label) return;
    await api.createSnapshot(projectId, branch, label);
    load();
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-80 shrink-0 flex-col border-r border-line">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
          <Segmented value={tab} onChange={setTab} options={[{ value: "snapshots", label: "Snapshots" }, { value: "runs", label: "Agent runs" }, { value: "branches", label: "Branches" }]} />
          <div className="flex-1" />
          <button className="btn btn-ghost size-7 justify-center p-0" onClick={snapshotNow} title="Save a restore point">
            <Save className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {tab === "snapshots" &&
            (snaps === null ? (
              <Spinner className="m-3 text-fg-3" />
            ) : (
              snaps.map((s, i) => (
                <div key={s.id} className={cx("group rounded-lg p-2", compare?.from === s.id ? "bg-accent/10" : "hover:bg-raise/60")}>
                  <button className="flex w-full items-start gap-2 text-left" onClick={() => setCompare({ from: s.id, to: "current", title: `“${s.label}” → current` })}>
                    <span className="mt-0.5">{reasonIcon(s.reason)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{s.label}</span>
                      <span className="text-[11px] text-fg-3">
                        {timeAgo(s.createdAt)} · {s.fileCount} files
                      </span>
                    </span>
                  </button>
                  <div className="mt-1.5 hidden gap-1 pl-5 group-hover:flex">
                    <button className="btn h-6 text-[11px]" onClick={() => restore(s)}>
                      <RotateCcw className="size-3" /> Restore
                    </button>
                    {snaps[i + 1] && (
                      <button className="btn h-6 text-[11px]" onClick={() => setCompare({ from: snaps[i + 1].id, to: s.id, title: `“${snaps[i + 1].label}” → “${s.label}”` })}>
                        <GitCompare className="size-3" /> vs previous
                      </button>
                    )}
                    <button className="btn h-6 text-[11px]" onClick={() => branchFrom(s)}>
                      <GitBranch className="size-3" /> Branch
                    </button>
                  </div>
                </div>
              ))
            ))}
          {tab === "runs" &&
            (runs.length === 0 ? (
              <div className="p-3 text-xs text-fg-3">No agent runs on this branch yet.</div>
            ) : (
              runs.map((r) => (
                <div key={r.runId} className="group rounded-lg p-2 hover:bg-raise/60">
                  <button
                    className="flex w-full items-start gap-2 text-left"
                    onClick={() => r.startSnapshot && setCompare({ from: r.startSnapshot, to: r.endSnapshot ?? "current", title: `Run: ${r.prompt.slice(0, 60)}` })}
                  >
                    <StatusIcon status={r.status === "completed" ? "pass" : r.status === "failed" ? "fail" : r.status === "running" ? "running" : "skip"} className="mt-0.5 size-3.5" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs font-medium">{r.prompt}</span>
                      <span className="text-[11px] text-fg-3">
                        {timeAgo(r.startedAt)} · {r.mode} · {r.changedFiles?.length ?? 0} files
                        {r.checks ? ` · ✕${r.checks.errors} ⚠${r.checks.warnings}` : ""}
                      </span>
                    </span>
                  </button>
                  {r.startSnapshot && (
                    <div className="mt-1.5 hidden gap-1 pl-5 group-hover:flex">
                      <button className="btn h-6 text-[11px]" onClick={() => undoRun(r)}>
                        <Undo2 className="size-3" /> Undo run
                      </button>
                    </div>
                  )}
                </div>
              ))
            ))}
          {tab === "branches" &&
            branches.map((b) => (
              <div key={b.name} className={cx("rounded-lg p-2", b.name === branch ? "bg-accent/10" : "hover:bg-raise/60")}>
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-accent-2" />
                  <span className="flex-1 truncate text-xs font-medium">{b.name}</span>
                  {b.name === branch ? (
                    <span className="chip">current</span>
                  ) : (
                    <>
                      <button className="btn h-6 text-[11px]" onClick={() => switchBranch(b.name)}>
                        Open
                      </button>
                      <button
                        className="btn h-6 text-[11px]"
                        onClick={async () => {
                          if (!(await dialog.confirm(`Bring ${b.name} into ${branch}?`, `${branch} becomes a copy of ${b.name}. A restore point is saved first.`, { confirmLabel: "Adopt" }))) return;
                          await api.adopt(projectId, b.name, branch);
                          await refreshFiles();
                          validate();
                          load();
                          toast.ok(`Adopted ${b.name}`);
                        }}
                      >
                        Adopt
                      </button>
                    </>
                  )}
                </div>
                {b.label && <div className="mt-0.5 pl-5 text-[11px] text-fg-3">{b.label}</div>}
                <div className="pl-5 text-[11px] text-fg-3">{b.createdAt ? timeAgo(b.createdAt) : ""}</div>
              </div>
            ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">{compare ? <DiffView key={`${compare.from}-${compare.to}`} compare={compare} /> : <EmptyState icon={<History className="size-5" />} title="Pick a snapshot or run">Compare any restore point with the current files, review exactly what an agent run changed, restore whole snapshots or single files, and branch from any point.</EmptyState>}</div>
    </div>
  );
}
