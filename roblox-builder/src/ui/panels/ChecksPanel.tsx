"use client";

import { ChevronDown, ChevronRight, ClipboardCheck, RefreshCw, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import type { Diagnostic } from "@/core/diagnostics";
import { dottedPath } from "@/core/roblox/instance";
import { isRobloxKind } from "@/core/roblox/template";
import { cx, EmptyState, SeverityGlyph, Spinner, StatusIcon } from "../common/ui";
import { useLayout } from "../workspace/layout";
import { useWorkspace } from "../workspace/store";

const GROUP_CATEGORIES: Record<string, Diagnostic["category"][]> = {
  project: ["project"],
  syntax: ["syntax"],
  scripts: ["script", "deprecated", "performance"],
  "client-server": ["client-server"],
  remotes: ["remote", "security"],
  hierarchy: ["hierarchy"],
  references: ["reference", "dependency"],
  properties: ["property", "naming"],
  ui: ["ui"],
  assets: ["asset"],
};

export default function ChecksPanel() {
  const { report, validating, validate, repair, meta, openFile, selectInstance, runTests, testReport, testing } = useWorkspace();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showInfo, setShowInfo] = useState(false);
  const grouped = useMemo(() => {
    const m = new Map<string, Diagnostic[]>();
    for (const d of report?.diagnostics ?? []) {
      if (d.severity === "info" && !showInfo) continue;
      const g = Object.entries(GROUP_CATEGORIES).find(([, cats]) => cats.includes(d.category))?.[0] ?? "project";
      m.set(g, [...(m.get(g) ?? []), d]);
    }
    return m;
  }, [report, showInfo]);

  if (meta && !isRobloxKind(meta.kind)) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-8 items-center gap-2 px-3">
          <span className="panel-title flex-1">Web checks</span>
          <button className="btn h-6 text-xs" onClick={() => { runTests(); useLayout.getState().open("tests"); }} disabled={testing}>
            {testing ? <Spinner /> : <RefreshCw className="size-3" />} Run
          </button>
        </div>
        {testReport ? (
          <div className="px-3 text-xs text-fg-2">
            {testReport.passed} passed · {testReport.failed} failed · {testReport.skipped} skipped. Details in Tests.
          </div>
        ) : (
          <EmptyState title="Run the tests to check this app" />
        )}
      </div>
    );
  }
  if (!report) return <EmptyState icon={<ClipboardCheck className="size-5" />} title={validating ? "Checking…" : "No check run yet"} action={<button className="btn" onClick={() => validate()}>Run compatibility check</button>} />;
  const fixable = report.diagnostics.filter((d) => d.fix).length;

  const jump = (d: Diagnostic) => {
    if (d.file && /\.(luau|lua|json)$/.test(d.file)) {
      openFile(d.file);
      useLayout.getState().open("editor");
    }
    if (d.instancePath) selectInstance(d.instancePath);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-line p-2">
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="font-mono text-xs">
            <span className={report.summary.error ? "text-err" : "text-fg-3"}>✕ {report.summary.error}</span>
            <span className="mx-1.5 text-fg-3">·</span>
            <span className={report.summary.warning ? "text-warn" : "text-fg-3"}>⚠ {report.summary.warning}</span>
            <span className="mx-1.5 text-fg-3">·</span>
            <span className="text-fg-3">ℹ {report.summary.info}</span>
          </div>
        </div>
        {report.checks.map((c) => (
          <button
            key={c.id}
            onClick={() =>
              setOpen((s) => {
                const n = new Set(s);
                if (n.has(c.id)) n.delete(c.id);
                else n.add(c.id);
                return n;
              })
            }
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-raise"
          >
            <StatusIcon status={c.status} className="size-3.5" />
            <span className="flex-1 truncate text-fg-2">{c.label}</span>
            {(c.errors > 0 || c.warnings > 0) && <span className="font-mono text-[10px] text-fg-3">{c.errors + c.warnings}</span>}
          </button>
        ))}
        <div className="mt-3 space-y-1 px-1 text-[11px] text-fg-3">
          <div>{report.stats.instances} instances · {report.stats.scripts} scripts</div>
          <div>{report.stats.remotes} remotes · {report.stats.guis} GUI objects · {report.stats.parts} parts</div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="panel-title flex-1">Findings</span>
          <label className="flex items-center gap-1.5 text-[11px] text-fg-3">
            <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> notes
          </label>
          {fixable > 0 && (
            <button className="btn h-6 text-xs" onClick={() => repair()}>
              <Wrench className="size-3" /> Auto-repair {fixable}
            </button>
          )}
          <button className="btn h-6 text-xs" onClick={() => validate()} disabled={validating}>
            {validating ? <Spinner /> : <RefreshCw className="size-3" />} Re-check
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {grouped.size === 0 && (
            <div className="flex items-center gap-2 p-3 text-sm text-ok">
              <StatusIcon status="pass" /> Every Roblox compatibility check passes.
            </div>
          )}
          {report.checks
            .filter((c) => grouped.has(c.id))
            .map((c) => {
              const list = grouped.get(c.id)!;
              const isOpen = !open.has(c.id);
              return (
                <div key={c.id} className="mb-1">
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs font-medium"
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                  >
                    {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    <StatusIcon status={c.status} className="size-3.5" /> {c.label}
                    <span className="text-fg-3">{list.length}</span>
                  </button>
                  {isOpen &&
                    list.map((d, i) => (
                      <button key={i} onClick={() => jump(d)} className="flex w-full items-start gap-2 rounded-md py-1 pl-7 pr-2 text-left text-xs hover:bg-raise">
                        <SeverityGlyph severity={d.severity} />
                        <span className="min-w-0 flex-1">
                          <span className={cx("text-fg-2", d.severity === "error" && "text-fg")}>{d.message}</span>
                          <span className="ml-2 font-mono text-[10.5px] text-fg-3">
                            {d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : d.instancePath ? dottedPath(d.instancePath) : ""}
                          </span>
                          {d.fix && <span className="ml-2 rounded bg-accent/15 px-1 text-[10px] text-accent">fix: {d.fix.description}</span>}
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
          {report.unmappedFiles.length > 0 && (
            <div className="mt-2 rounded-lg bg-bg-2 p-2 text-[11px] text-fg-3 hairline">
              Not synced by Rojo (unknown file types under mapped folders): {report.unmappedFiles.slice(0, 8).join(", ")}
              {report.unmappedFiles.length > 8 ? "…" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
