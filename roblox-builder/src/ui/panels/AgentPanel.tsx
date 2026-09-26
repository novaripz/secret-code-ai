"use client";

import {
  ArrowUp,
  Bot,
  Brain,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  FileCode2,
  Flame,
  GitCompare,
  Hammer,
  ListChecks,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
  Undo2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PHASES, type RunMode } from "@/core/agent/events";
import { dottedPath } from "@/core/roblox/instance";
import { api } from "../api";
import { Markdown } from "../common/Markdown";
import { cx, Segmented, Spinner, StatusIcon, timeAgo, toast, useDialog } from "../common/ui";
import { useLayout } from "../workspace/layout";
import { isRunning, useWorkspace } from "../workspace/store";
import type { RunView, TimelineItem } from "../workspace/timeline";

const PHASE_LABEL: Record<string, string> = {
  planning: "Plan",
  generating: "Generate",
  installing: "Install",
  coding: "Code",
  testing: "Test",
  debugging: "Debug",
  optimizing: "Optimize",
  validating: "Validate",
  complete: "Done",
};

function PhaseTracker({ view }: { view: RunView }) {
  const running = isRunning(view);
  const status = view.summary?.status;
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2.5 pt-1 [scrollbar-width:none]">
      {PHASES.map((p, i) => {
        const seen = view.phasesSeen.includes(p);
        const current = view.phase === p && running;
        const done = (seen && !current) || (status === "completed" && p === "complete");
        return (
          <div key={p} className="flex items-center gap-1">
            {i > 0 && <span className={cx("h-px w-2.5", seen ? "bg-accent/60" : "bg-line-2")} />}
            <span
              className={cx(
                "flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium transition-all",
                current ? "bg-accent/15 text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_50%,transparent)]" : done ? "text-fg-2" : "text-fg-3/60",
              )}
            >
              {current ? <Spinner className="size-3 text-accent" /> : done ? <Check className="size-3 text-accent" /> : <span className="size-1.5 rounded-full bg-current opacity-50" />}
              {PHASE_LABEL[p]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlanList({ view }: { view: RunView }) {
  const [open, setOpen] = useState(true);
  if (!view.plan.length) return null;
  const done = view.plan.filter((s) => s.status === "done").length;
  return (
    <div className="mx-3 mb-2 rounded-xl bg-bg-2/70 hairline">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-xs" onClick={() => setOpen(!open)}>
        <ListChecks className="size-3.5 text-accent" />
        <span className="font-medium">Plan</span>
        <span className="text-fg-3">
          {done}/{view.plan.length}
        </span>
        <span className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-line-2">
          <span className="block h-full rounded-full accent-gradient transition-all" style={{ width: `${(done / view.plan.length) * 100}%` }} />
        </span>
        {open ? <ChevronDown className="size-3.5 text-fg-3" /> : <ChevronRight className="size-3.5 text-fg-3" />}
      </button>
      {open && (
        <ol className="space-y-1 px-3 pb-2.5">
          {view.plan.map((s, i) => (
            <li key={i} className={cx("flex items-start gap-2 text-xs leading-snug", s.status === "done" ? "text-fg-3" : s.status === "active" ? "text-fg" : "text-fg-2")}>
              <span className="mt-0.5">
                {s.status === "done" ? <Check className="size-3 text-ok" /> : s.status === "active" ? <Spinner className="size-3 text-accent" /> : s.status === "skipped" ? <X className="size-3" /> : <span className="block size-3 rounded-full border border-line-2" />}
              </span>
              <span className={cx(s.status === "done" && "line-through decoration-fg-3/40")}>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const TOOL_ICON: Record<string, typeof FileCode2> = {
  run_command: Terminal,
  install_dependency: Terminal,
  run_tests: Play,
  validate_roblox_project: ShieldAlert,
  repair_project: Hammer,
  create_asset: Sparkles,
  preview_project: Camera,
};

function ToolRow({ item }: { item: Extract<TimelineItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[item.name] ?? FileCode2;
  const hasMore = !!(item.detail || item.output);
  const openFile = useWorkspace((s) => s.openFile);
  const path = /^(write file|edit file|read file|delete file|inspect asset|validate asset) (.+)$/.exec(item.summary)?.[2];
  return (
    <div className="group rounded-lg transition-colors hover:bg-raise/50">
      <button className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs" onClick={() => hasMore && setOpen(!open)}>
        <Icon className="size-3.5 shrink-0 text-fg-3" />
        <span className={cx("min-w-0 flex-1 truncate font-mono text-[11.5px]", item.status === "rejected" ? "text-fg-3 line-through" : "text-fg-2")}>{item.summary}</span>
        {item.detail && !open && <span className="hidden max-w-[40%] truncate text-[11px] text-fg-3 sm:inline">{item.detail.split("\n")[0]}</span>}
        {item.durationMs !== undefined && item.durationMs > 400 && <span className="text-[10px] text-fg-3">{(item.durationMs / 1000).toFixed(1)}s</span>}
        <StatusIcon status={item.status === "running" ? "running" : item.status === "done" ? "pass" : item.status === "rejected" ? "skip" : "fail"} className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div className="mx-2 mb-1.5 space-y-1.5">
          {path && (
            <button
              className="text-[11px] text-accent hover:underline"
              onClick={() => {
                openFile(path);
                useLayout.getState().open("editor");
              }}
            >
              Open {path}
            </button>
          )}
          {item.detail && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-bg-2 p-2 font-mono text-[11px] text-fg-2 hairline">{item.detail}</pre>}
          {item.output && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-2 font-mono text-[11px] text-fg-2 hairline">{item.output}</pre>}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ item }: { item: Extract<TimelineItem, { kind: "approval" }> }) {
  const approve = useWorkspace((s) => s.approve);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const resolved = item.resolved !== undefined;
  return (
    <div className={cx("my-1.5 rounded-xl p-3 text-xs hairline", resolved ? "bg-bg-2/60" : "bg-warn/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warn)_40%,transparent)]")}>
      <div className="flex items-start gap-2">
        <ShieldAlert className={cx("mt-0.5 size-4 shrink-0", resolved ? "text-fg-3" : "text-warn")} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg">{resolved ? (item.resolved ? "Approved" : "Rejected") : "Approval needed"}</div>
          <div className="mt-0.5 text-fg-2">{item.description}</div>
          {item.detail && (
            <button className="mt-1 text-[11px] text-fg-3 hover:text-fg-2" onClick={() => setOpen(!open)}>
              {open ? "Hide details" : "Show exactly what will happen"}
            </button>
          )}
          {open && <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-bg-2 p-2 font-mono text-[11px] hairline">{item.detail}</pre>}
        </div>
      </div>
      {!resolved && (
        <div className="mt-2.5 flex justify-end gap-2">
          <button className="btn h-7" disabled={busy} onClick={async () => { setBusy(true); await approve(item.id, false); }}>
            <X className="size-3.5" /> Reject
          </button>
          <button className="btn btn-primary h-7" disabled={busy} onClick={async () => { setBusy(true); await approve(item.id, true); }}>
            <Check className="size-3.5" /> Approve
          </button>
        </div>
      )}
    </div>
  );
}

function FinalCard({ view, item }: { view: RunView; item: Extract<TimelineItem, { kind: "final" }> }) {
  const s = view.summary;
  const { projectId, branch, refreshFiles, validate, runTests } = useWorkspace();
  const dialog = useDialog();
  const ok = item.status === "completed";
  const changed = s?.changedFiles?.length ?? view.changedFiles.size;
  return (
    <div className={cx("my-2 rounded-xl p-3.5 hairline", ok ? "bg-ok/[0.07]" : item.status === "cancelled" ? "bg-bg-2" : "bg-err/[0.07]")}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <StatusIcon status={ok ? "pass" : item.status === "cancelled" ? "skip" : "fail"} />
        {ok ? "Project ready" : item.status === "cancelled" ? "Stopped" : "Run failed"}
        {s?.checks && (
          <span className="ml-auto font-mono text-[11px] text-fg-3">
            ✕ {s.checks.errors} · ⚠ {s.checks.warnings}
          </span>
        )}
      </div>
      {item.text && !ok && <p className="mt-1 text-xs text-fg-2">{item.text}</p>}
      {s?.finalText && <Markdown text={s.finalText} className="mt-2 text-[13px] leading-relaxed text-fg-2" />}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {changed > 0 && s?.startSnapshot && (
          <button
            className="btn h-7"
            onClick={() => {
              sessionStorage.setItem("rb-history-focus", JSON.stringify({ from: s.startSnapshot, to: s.endSnapshot }));
              useLayout.getState().open("history");
              window.dispatchEvent(new Event("rb-history-focus"));
            }}
          >
            <GitCompare className="size-3.5" /> Review {changed} change{changed === 1 ? "" : "s"}
          </button>
        )}
        {changed > 0 && s?.startSnapshot && (
          <button
            className="btn h-7"
            onClick={async () => {
              if (!(await dialog.confirm("Reject these changes?", "Restores the branch to how it was before this run. The current state is saved first, so you can bring it back from History.", { confirmLabel: "Reject changes", danger: true }))) return;
              await api.restoreSnapshot(projectId, branch, s.startSnapshot!);
              await refreshFiles();
              await validate();
              toast.ok("Changes rejected; restored the previous state");
            }}
          >
            <Undo2 className="size-3.5" /> Reject changes
          </button>
        )}
        <button className="btn h-7" onClick={() => { runTests(); useLayout.getState().open("tests"); }}>
          <Play className="size-3.5" /> Run tests
        </button>
        <button className="btn h-7" onClick={() => useLayout.getState().open("preview")}>
          <Camera className="size-3.5" /> Preview
        </button>
      </div>
    </div>
  );
}

function Item({ item, view }: { item: TimelineItem; view: RunView }) {
  const [open, setOpen] = useState(false);
  const build = useWorkspace((s) => s.build);
  switch (item.kind) {
    case "user":
      return (
        <div className="my-3 flex justify-end">
          <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2 text-[13px] leading-relaxed text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_30%,transparent)]">{item.text}</div>
        </div>
      );
    case "text":
      return <Markdown text={item.text} className="my-1.5 px-1 text-[13px] leading-relaxed text-fg-2" />;
    case "reasoning":
      return (
        <div className="my-1">
          <button className="flex items-center gap-1.5 px-1 text-[11px] text-fg-3 hover:text-fg-2" onClick={() => setOpen(!open)}>
            <Brain className={cx("size-3.5", item.streaming && "animate-pulse-soft text-accent")} />
            {item.streaming ? "Thinking…" : "Thought process"}
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          {open && <div className="mt-1 whitespace-pre-wrap border-l-2 border-line-2 pl-3 text-[12px] italic leading-relaxed text-fg-3">{item.text}</div>}
        </div>
      );
    case "tool":
      return <ToolRow item={item} />;
    case "activity":
      return (
        <div className="flex items-center gap-2 px-2 py-1 text-xs">
          <StatusIcon status={item.status === "running" ? "running" : item.status === "done" ? "pass" : "warn"} className="size-3.5" />
          <span className={cx("font-medium", item.status === "error" ? "text-warn" : "text-fg")}>{item.label}</span>
          {item.detail && <span className="min-w-0 truncate text-fg-3">{item.detail}</span>}
        </div>
      );
    case "approval":
      return <ApprovalCard item={item} />;
    case "checks":
      return (
        <div className="my-1.5 rounded-xl bg-bg-2/70 p-2.5 hairline">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
            <ShieldAlert className="size-3.5 text-accent-2" /> Roblox compatibility
            <span className="ml-auto font-mono text-[11px] text-fg-3">
              <span className={item.errors ? "text-err" : ""}>✕ {item.errors}</span> · <span className={item.warnings ? "text-warn" : ""}>⚠ {item.warnings}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {item.groups.map((g) => (
              <div key={g.id} className="flex items-center gap-1.5 text-[11px] text-fg-2">
                <span className={cx("font-mono font-bold", g.status === "pass" ? "text-ok" : g.status === "warn" ? "text-warn" : "text-err")}>{g.status === "pass" ? "✓" : g.status === "warn" ? "⚠" : "✕"}</span>
                <span className="truncate">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "snapshot":
      return <div className="px-2 py-0.5 text-[11px] text-fg-3">◷ Restore point: {item.label}</div>;
    case "error":
      return <div className="my-1 rounded-lg bg-err/10 px-3 py-2 text-xs text-err hairline">{item.message}</div>;
    case "final":
      return <FinalCard view={view} item={item} />;
  }
  void build;
}

function Composer() {
  const { startRun, cancelRun, activeTab, selectedInstance, status, meta } = useWorkspace();
  const view = useWorkspace((s) => (s.activeRunId ? s.runs[s.activeRunId] : undefined));
  const running = isRunning(view);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<RunMode>("chat");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(220, Math.max(64, el.scrollHeight))}px`;
  }, [text]);
  const send = () => {
    if (!text.trim() || running) return;
    startRun(text.trim(), mode);
    setText("");
  };
  return (
    <div className="border-t border-line p-2.5">
      <div className="rounded-xl bg-bg-2 transition-shadow hairline focus-within:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_55%,transparent)]">
        {(activeTab || selectedInstance) && (
          <div className="flex flex-wrap gap-1 px-2.5 pt-2">
            {activeTab && (
              <span className="chip" title="The agent sees what you are looking at">
                <FileCode2 className="size-3" /> {activeTab.split("/").pop()}
              </span>
            )}
            {selectedInstance && <span className="chip">◆ {dottedPath(selectedInstance).split(".").slice(-2).join(".")}</span>}
          </div>
        )}
        <textarea
          id="agent-composer"
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!status?.ai.configured}
          placeholder={
            !status?.ai.configured
              ? "Connect an AI provider to use the agent (see Project → Status)"
              : running
                ? "The agent is working… you can queue your next request after it finishes"
                : meta?.kind === "web-app"
                  ? "Describe a change: add a settings page, fix the layout on mobile…"
                  : "Describe a change: add a shop with 3 upgrades, make the HUD responsive…"
          }
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed placeholder:text-fg-3 focus:outline-none focus-visible:outline-none"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <Segmented<RunMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "chat", label: <><Wand2 className="size-3" /> Guided</>, title: "Asks before destructive actions" },
              { value: "autopilot", label: <><Zap className="size-3" /> Autopilot</>, title: "Plans, builds, tests, fixes and polishes on its own" },
            ]}
          />
          <button className="btn btn-ghost h-6 px-2 text-xs" onClick={() => useLayout.getState().open("forge")} title="Generate several versions">
            <Flame className="size-3" /> Forge
          </button>
          <div className="flex-1" />
          {running ? (
            <button className="btn h-8 text-err" onClick={() => cancelRun()}>
              <CircleStop className="size-4" /> Stop
            </button>
          ) : (
            <button className="btn btn-primary size-8 justify-center p-0" onClick={send} disabled={!text.trim() || !status?.ai.configured} title="Send (⌘Enter)">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentPanel() {
  const { chat, runOrder, runs, activeRunId, branch, status } = useWorkspace();
  const view = activeRunId ? runs[activeRunId] : undefined;
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const sessionRuns = useMemo(() => runOrder.map((id) => runs[id]).filter((r) => r && r.summary?.branch === branch), [runOrder, runs, branch]);
  const sessionRunIds = new Set(sessionRuns.map((r) => r.runId));
  const history = chat.filter((m) => !m.runId || !sessionRunIds.has(m.runId));

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  return (
    <div className="flex h-full flex-col">
      {view && (
        <div className="shrink-0 border-b border-line pt-2">
          <PhaseTracker view={view} />
          <PlanList view={view} />
        </div>
      )}
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {history.length === 0 && sessionRuns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl accent-gradient text-white shadow-lg">
              <Bot className="size-6" />
            </div>
            <div className="text-sm font-medium">Your engineer is ready</div>
            <p className="text-xs leading-relaxed text-fg-3">
              Describe what to build or change. It plans, writes the code, runs the checks, fixes what fails, and shows every step here.
            </p>
            {!status?.ai.configured && <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{status?.ai.hint}</p>}
          </div>
        )}
        {history.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="my-3 flex justify-end">
              <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-raise px-3.5 py-2 text-[13px] leading-relaxed">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="my-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-fg-3">
                <Bot className="size-3" /> {timeAgo(m.at)}
              </div>
              <Markdown text={m.text} className="text-[13px] leading-relaxed text-fg-2" />
            </div>
          ),
        )}
        {sessionRuns.map((r) => (
          <div key={r.runId}>
            {r.items.map((it) => (
              <Item key={it.key} item={it} view={r} />
            ))}
            {isRunning(r) && r.items[r.items.length - 1]?.kind !== "tool" && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-fg-3">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" />
                  <span className="size-1.5 animate-pulse-soft rounded-full bg-accent [animation-delay:0.2s]" />
                  <span className="size-1.5 animate-pulse-soft rounded-full bg-accent [animation-delay:0.4s]" />
                </span>
                {r.phaseDetail ?? `${PHASE_LABEL[r.phase]}…`}
              </div>
            )}
          </div>
        ))}
      </div>
      <Composer />
    </div>
  );
}
