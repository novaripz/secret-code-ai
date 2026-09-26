"use client";

import { ChevronDown, ChevronRight, FlaskConical, Play } from "lucide-react";
import { useState } from "react";
import { cx, EmptyState, Spinner, StatusIcon } from "../common/ui";
import { useWorkspace } from "../workspace/store";

export default function TestsPanel() {
  const { testReport, testing, runTests, projectId, branch } = useWorkspace();
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!testReport) {
    return (
      <EmptyState icon={<FlaskConical className="size-5" />} title={testing ? "Running tests…" : "No test run yet"} action={<button className="btn btn-primary" onClick={() => runTests()} disabled={testing}>{testing ? <Spinner /> : <Play className="size-3.5" />} Run tests</button>}>
        Everything that can actually run here runs: syntax, the compatibility check, export round-trips, Rojo and linters if installed, npm tests and a real browser load for web apps. Anything that cannot run here is reported as skipped.
      </EmptyState>
    );
  }
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex h-8 items-center gap-3 border-b border-line px-3 text-xs">
          <span className="text-ok">{testReport.passed} passed</span>
          <span className={testReport.failed ? "text-err" : "text-fg-3"}>{testReport.failed} failed</span>
          <span className={testReport.warned ? "text-warn" : "text-fg-3"}>{testReport.warned} warnings</span>
          <span className="text-fg-3">{testReport.skipped} skipped</span>
          <span className="text-fg-3">{(testReport.durationMs / 1000).toFixed(1)}s</span>
          <div className="flex-1" />
          <button className="btn h-6 text-xs" onClick={() => runTests()} disabled={testing}>
            {testing ? <Spinner /> : <Play className="size-3" />} Run again
          </button>
        </div>
        {testReport.cases.map((c) => {
          const isOpen = open.has(c.id) || c.status === "fail";
          return (
            <div key={c.id} className="border-b border-line/60">
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-raise/50"
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
              >
                {c.detail ? isOpen ? <ChevronDown className="size-3 text-fg-3" /> : <ChevronRight className="size-3 text-fg-3" /> : <span className="w-3" />}
                <StatusIcon status={c.status} className="size-3.5" />
                <span className={cx("flex-1", c.status === "skip" ? "text-fg-3" : "text-fg-2")}>{c.name}</span>
                {c.durationMs > 50 && <span className="text-[10px] text-fg-3">{c.durationMs} ms</span>}
              </button>
              {isOpen && c.detail && <pre className="mx-3 mb-2 ml-11 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-bg-2 p-2 font-mono text-[11px] text-fg-2 hairline">{c.detail}</pre>}
            </div>
          );
        })}
      </div>
      {testReport.hasScreenshot && (
        <div className="w-80 shrink-0 border-l border-line p-2">
          <div className="mb-1 panel-title">Browser screenshot</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/projects/${projectId}/screenshot?branch=${encodeURIComponent(branch)}&t=${testReport.startedAt}`} alt="Headless browser screenshot" className="w-full rounded-lg hairline" />
        </div>
      )}
    </div>
  );
}
