"use client";

import { ArrowLeft, ChevronDown, ClipboardCheck, Command as CommandIcon, FlaskConical, GitBranch, LayoutPanelLeft, Moon, Plus, Save, Sun, Trash2, Undo2, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PHASES } from "@/core/agent/events";
import { countNodes } from "@/core/roblox/instance";
import { isRobloxKind } from "@/core/roblox/template";
import { api } from "../api";
import { cx, DialogProvider, KindIcon, Spinner, StatusIcon, toast, Toaster, useDialog, useThemeToggle } from "../common/ui";
import { CommandPalette, type Command } from "./CommandPalette";
import { DockView, Resizer } from "./Dock";
import { useLayout } from "./layout";
import { isRunning, useActiveRun, useWorkspace } from "./store";

function PhasePill() {
  const run = useActiveRun();
  const running = isRunning(run);
  if (!run) return null;
  const status = run.summary?.status;
  const idx = PHASES.indexOf(run.phase);
  return (
    <button
      onClick={() => useLayout.getState().open("agent")}
      className={cx("hidden h-8 items-center gap-2 rounded-full px-3 text-xs hairline md:flex", running ? "bg-accent/10" : "bg-raise")}
      title="Build timeline"
    >
      {running ? <Spinner className="size-3.5 text-accent" /> : <StatusIcon status={status === "completed" ? "pass" : status === "failed" ? "fail" : "skip"} className="size-3.5" />}
      <span className="font-medium capitalize">{running ? run.phase : status}</span>
      <span className="flex gap-0.5">
        {PHASES.slice(0, -1).map((p, i) => (
          <span key={p} className={cx("h-1 w-3 rounded-full", i < idx || (!running && status === "completed") ? "bg-accent" : i === idx && running ? "bg-accent animate-pulse-soft" : "bg-line-2")} />
        ))}
      </span>
    </button>
  );
}

function BranchMenu() {
  const { branches, branch, switchBranch, projectId, refreshMeta } = useWorkspace();
  const [open, setOpen] = useState(false);
  const dialog = useDialog();
  const create = async () => {
    setOpen(false);
    const name = await dialog.prompt("New branch", { label: `Copies the current state of ${branch}`, placeholder: "experiment", confirmLabel: "Create branch" });
    if (!name) return;
    try {
      await api.createBranch(projectId, { name, fromBranch: branch });
      await refreshMeta();
      await switchBranch(name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (name: string) => {
    if (!(await dialog.confirm(`Delete branch ${name}?`, "Its files and snapshots on that branch are deleted.", { danger: true, confirmLabel: "Delete" }))) return;
    await api.deleteBranch(projectId, name);
    if (name === branch) await switchBranch("main");
    else await refreshMeta();
  };
  return (
    <div className="relative">
      <button className="btn h-8" onClick={() => setOpen(!open)}>
        <GitBranch className="size-3.5 text-accent-2" />
        <span className="max-w-40 truncate">{branch}</span>
        <ChevronDown className="size-3 text-fg-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass absolute left-0 top-10 z-50 w-72 rounded-xl p-1 animate-rise">
            <div className="px-2.5 py-1.5 panel-title">Branches</div>
            {branches.map((b) => (
              <div key={b.name} className={cx("group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", b.name === branch ? "bg-accent/10" : "hover:bg-raise")}>
                <button className="min-w-0 flex-1 text-left" onClick={() => { setOpen(false); if (b.name !== branch) switchBranch(b.name); }}>
                  <div className="truncate font-medium">{b.name}</div>
                  {b.label && <div className="truncate text-xs text-fg-3">{b.label}</div>}
                </button>
                {b.name !== "main" && (
                  <button className="opacity-0 group-hover:opacity-70 hover:!opacity-100" onClick={() => remove(b.name)} title="Delete branch">
                    <Trash2 className="size-3.5 text-err" />
                  </button>
                )}
              </div>
            ))}
            <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-fg-2 hover:bg-raise" onClick={create}>
              <Plus className="size-3.5" /> New branch from {branch}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChecksButton() {
  const { report, validating, validate, meta } = useWorkspace();
  if (!meta || !isRobloxKind(meta.kind)) return null;
  return (
    <button
      className="btn h-8"
      onClick={async () => {
        await validate();
        useLayout.getState().open("checks");
      }}
      title="Run the Roblox compatibility check"
    >
      {validating ? <Spinner /> : <ClipboardCheck className="size-3.5" />}
      {report ? (
        <span className="flex items-center gap-2 font-mono text-[11px]">
          <span className={report.summary.error ? "text-err" : "text-fg-3"}>✕ {report.summary.error}</span>
          <span className={report.summary.warning ? "text-warn" : "text-fg-3"}>⚠ {report.summary.warning}</span>
          {!report.summary.error && !report.summary.warning && <span className="text-ok">✓</span>}
        </span>
      ) : (
        "Check"
      )}
    </button>
  );
}

function WorkspaceInner({ projectId }: { projectId: string }) {
  const ws = useWorkspace();
  const layout = useLayout();
  const dialog = useDialog();
  const [theme, toggleTheme] = useThemeToggle();
  const [palette, setPalette] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    layout.hydrate();
    ws.init(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // A build requested from the dashboard starts once the project has loaded.
  useEffect(() => {
    if (!ws.loaded || !ws.meta || started.current) return;
    started.current = true;
    let pending: { prompt: string; mode: "autopilot" | "forge" | "chat"; count: number } | undefined;
    try {
      const raw = sessionStorage.getItem(`rb-start-${projectId}`);
      if (raw) pending = JSON.parse(raw);
      sessionStorage.removeItem(`rb-start-${projectId}`);
    } catch {
      /* nothing queued */
    }
    if (!pending) return;
    if (pending.mode === "forge") {
      layout.open("forge");
      api
        .forge({ projectId, prompt: pending.prompt, count: pending.count })
        .then(async (r) => {
          await ws.refreshMeta();
          const { runs } = await api.runs(projectId);
          for (const v of r.variants) {
            const s = runs.find((x) => x.runId === v.runId);
            if (s) ws.attachRun(s);
          }
          toast.ok(`Forging ${r.variants.length} versions`);
        })
        .catch((e) => toast.error(e.message));
    } else {
      ws.startRun(pending.prompt, pending.mode);
      layout.open(isRobloxKind(ws.meta.kind) ? "preview" : "preview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.loaded]);

  // Preview iframes report console output and errors here.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __rbPreview?: boolean; type?: string; args?: string[] };
      if (!d?.__rbPreview) return;
      if (d.type === "ready") return;
      const level = d.type === "error" ? "error" : d.type === "warn" ? "warn" : d.type === "info" ? "info" : "log";
      useWorkspace.getState().log(level, "preview", (d.args ?? []).join(" "));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const lastRun = useMemo(() => ws.pastRuns.find((r) => r.branch === ws.branch && r.startSnapshot && r.status !== "running"), [ws.pastRuns, ws.branch]);

  const undoLastRun = async () => {
    if (!lastRun?.startSnapshot) return;
    const ok = await dialog.confirm("Undo the last agent run?", <>Restores <b>{ws.branch}</b> to how it was before “{lastRun.prompt.slice(0, 80)}”. The current state is saved first, so this can be undone too.</>, { confirmLabel: "Undo run" });
    if (!ok) return;
    await api.restoreSnapshot(ws.projectId, ws.branch, lastRun.startSnapshot);
    await ws.refreshFiles();
    await ws.validate();
    toast.ok("Restored the pre-run state");
  };

  const commands: Command[] = useMemo(
    () => [
      { id: "validate", label: "Run Roblox compatibility check", group: "Checks", run: () => { ws.validate(); layout.open("checks"); } },
      { id: "repair", label: "Auto-repair compatibility issues", group: "Checks", run: () => ws.repair() },
      { id: "tests", label: "Run tests", group: "Checks", run: () => { ws.runTests(); layout.open("tests"); } },
      { id: "save", label: "Save all files", hint: "⌘S", group: "Files", run: () => ws.save() },
      { id: "snapshot", label: "Create snapshot", group: "History", run: async () => { const label = await dialog.prompt("Snapshot name", { placeholder: "Before big refactor" }); if (label) { await api.createSnapshot(ws.projectId, ws.branch, label); toast.ok("Snapshot saved"); } } },
      { id: "undo-run", label: "Undo last agent run", group: "History", run: undoLastRun },
      { id: "export-place", label: "Download place (.rbxlx)", group: "Export", run: () => window.open(api.exportUrl(ws.projectId, ws.branch, "rbxlx")) },
      { id: "export-zip", label: "Download project (.zip)", group: "Export", run: () => window.open(api.exportUrl(ws.projectId, ws.branch, "zip")) },
      { id: "toggle-left", label: "Toggle left dock", hint: "⌘B", group: "Layout", run: () => layout.toggle("left") },
      { id: "toggle-bottom", label: "Toggle bottom dock", hint: "⌘J", group: "Layout", run: () => layout.toggle("bottom") },
      { id: "toggle-right", label: "Toggle agent dock", hint: "⌘L", group: "Layout", run: () => layout.toggle("right") },
      { id: "reset-layout", label: "Reset layout", group: "Layout", run: () => layout.reset() },
      { id: "theme", label: "Toggle light/dark theme", group: "Appearance", run: toggleTheme },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.projectId, ws.branch, lastRun],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "k" || (k === "p" && e.shiftKey)) {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (k === "s") {
        e.preventDefault();
        useWorkspace.getState().save();
      } else if (k === "b") {
        e.preventDefault();
        useLayout.getState().toggle("left");
      } else if (k === "j") {
        e.preventDefault();
        useLayout.getState().toggle("bottom");
      } else if (k === "l") {
        e.preventDefault();
        useLayout.getState().open("agent");
        setTimeout(() => document.getElementById("agent-composer")?.focus(), 50);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (ws.focusPanel) layout.open(ws.focusPanel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.focusPanel]);

  if (ws.loadError) {
    return (
      <div className="grid h-screen place-items-center p-6 text-center">
        <div>
          <div className="text-lg font-semibold">Could not open this project</div>
          <p className="mt-2 text-sm text-fg-3">{ws.loadError}</p>
          <Link href="/" className="btn mt-5">
            <ArrowLeft className="size-3.5" /> All projects
          </Link>
        </div>
      </div>
    );
  }

  const dirty = Object.keys(ws.buffers).length;
  const instances = ws.build ? countNodes(ws.build.root) : 0;
  const activeRun = ws.activeRunId ? ws.runs[ws.activeRunId] : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2.5">
        <Link href="/" className="btn btn-ghost size-8 justify-center p-0" title="All projects">
          <ArrowLeft className="size-4" />
        </Link>
        {ws.meta ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent">
              <KindIcon kind={ws.meta.kind} className="size-3.5" />
            </span>
            <button
              className="max-w-56 truncate text-sm font-semibold hover:text-accent"
              title="Rename"
              onClick={async () => {
                const name = await dialog.prompt("Rename project", { initial: ws.meta!.name, confirmLabel: "Rename" });
                if (name) {
                  await api.updateProject(ws.projectId, { name });
                  await ws.refreshMeta();
                }
              }}
            >
              {ws.meta.name}
            </button>
          </div>
        ) : (
          <div className="skeleton h-5 w-40 rounded" />
        )}
        <BranchMenu />
        <PhasePill />
        <div className="flex-1" />
        {lastRun && (
          <button className="btn btn-ghost h-8" onClick={undoLastRun} title="Restore the state before the last agent run">
            <Undo2 className="size-3.5" /> <span className="hidden lg:inline">Undo run</span>
          </button>
        )}
        {dirty > 0 && (
          <button className="btn h-8" onClick={() => ws.save()} title="Save all (⌘S)">
            <Save className="size-3.5" /> Save {dirty}
          </button>
        )}
        <ChecksButton />
        {ws.report && ws.report.diagnostics.some((d) => d.fix) && (
          <button className="btn h-8" onClick={() => ws.repair()} title="Apply safe automatic repairs">
            <Wrench className="size-3.5" /> <span className="hidden lg:inline">Repair</span>
          </button>
        )}
        <button className="btn h-8" onClick={() => { ws.runTests(); layout.open("tests"); }} disabled={ws.testing}>
          {ws.testing ? <Spinner /> : <FlaskConical className="size-3.5" />} <span className="hidden lg:inline">Test</span>
        </button>
        <button className="btn h-8 gap-2" onClick={() => setPalette(true)} title="Command palette (⌘K)">
          <CommandIcon className="size-3.5" /> <span className="kbd hidden sm:inline">⌘K</span>
        </button>
        <button className="btn btn-ghost size-8 justify-center p-0" onClick={() => layout.reset()} title="Reset layout">
          <LayoutPanelLeft className="size-4" />
        </button>
        <button className="btn btn-ghost size-8 justify-center p-0" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <DockView dock="left" />
        <Resizer dock="left" />
        <div className="flex min-w-0 flex-1 flex-col">
          <DockView dock="center" />
          <Resizer dock="bottom" />
          <DockView dock="bottom" />
        </div>
        <Resizer dock="right" />
        <DockView dock="right" />
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-fg-3">
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" /> {ws.branch}
        </span>
        <span>{ws.files.size} files</span>
        {ws.build && <span>{instances} instances</span>}
        {ws.report && (
          <span className={ws.report.summary.error ? "text-err" : ws.report.summary.warning ? "text-warn" : "text-ok"}>
            {ws.report.summary.error ? `✕ ${ws.report.summary.error} errors` : ws.report.summary.warning ? `⚠ ${ws.report.summary.warning} warnings` : "✓ Roblox checks pass"}
          </span>
        )}
        <div className="flex-1" />
        {activeRun && (
          <span>
            {Math.round(activeRun.usage.inputTokens / 1000)}k in · {Math.round(activeRun.usage.outputTokens / 1000)}k out
          </span>
        )}
        <span>{ws.status?.ai.active ? `${ws.status.ai.active.label} · ${ws.status.ai.active.model}` : "AI not configured"}</span>
      </footer>
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
      <Toaster />
    </div>
  );
}

export default function Workspace({ projectId }: { projectId: string }) {
  return (
    <DialogProvider>
      <WorkspaceInner projectId={projectId} />
    </DialogProvider>
  );
}
