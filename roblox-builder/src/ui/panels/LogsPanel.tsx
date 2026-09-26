"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, Segmented } from "../common/ui";
import { useWorkspace } from "../workspace/store";

export default function LogsPanel() {
  const { logs, clearLogs } = useWorkspace();
  const [source, setSource] = useState("all");
  const [level, setLevel] = useState("all");
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => logs.filter((l) => (source === "all" || l.source === source) && (level === "all" || (level === "problems" ? l.level === "error" || l.level === "warn" : true))), [logs, source, level]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [shown.length]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented value={source} onChange={setSource} options={[{ value: "all", label: "All" }, { value: "agent", label: "Agent" }, { value: "preview", label: "App console" }, { value: "system", label: "System" }]} />
        <Segmented value={level} onChange={setLevel} options={[{ value: "all", label: "Everything" }, { value: "problems", label: "Problems" }]} />
        <div className="flex-1" />
        <button className="btn btn-ghost h-6 px-1.5" onClick={clearLogs} title="Clear">
          <Trash2 className="size-3" />
        </button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-[11.5px]">
        {shown.length === 0 && <div className="p-3 font-sans text-xs text-fg-3">Agent activity and your running app&apos;s console output appear here.</div>}
        {shown.map((l) => (
          <div key={l.id} className={cx("flex gap-2 border-b border-line/50 py-0.5", l.level === "error" ? "text-err" : l.level === "warn" ? "text-warn" : "text-fg-2")}>
            <span className="shrink-0 text-fg-3">{new Date(l.at).toLocaleTimeString()}</span>
            <span className="w-14 shrink-0 text-fg-3">{l.source}</span>
            <span className="whitespace-pre-wrap break-words">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
