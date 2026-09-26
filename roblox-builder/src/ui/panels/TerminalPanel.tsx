"use client";

import { CornerDownLeft, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../common/ui";
import { useWorkspace } from "../workspace/store";

interface Line {
  kind: "cmd" | "out" | "err" | "meta";
  text: string;
}

const SUGGESTIONS = ["npm test", "npm install", "rojo build default.project.json -o .rbuild/place.rbxlx", "selene src", "node --version", "rojo --version"];

export default function TerminalPanel() {
  const { projectId, branch, status, refreshFiles } = useWorkspace();
  const [lines, setLines] = useState<Line[]>([{ kind: "meta", text: "Commands run in the project folder without a shell (no pipes or &&). Allowed: node, npm, npx, pnpm, yarn, tsc, rojo, luau, lune, selene, stylua, wally." }]);
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [running, setRunning] = useState<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  const run = async (command: string) => {
    if (!command.trim() || running) return;
    setHistory((h) => [...h.filter((x) => x !== command), command]);
    setHIdx(-1);
    setCmd("");
    setLines((l) => [...l, { kind: "cmd", text: command }]);
    const ctrl = new AbortController();
    setRunning(ctrl);
    try {
      const res = await fetch(`/api/projects/${projectId}/exec?branch=${encodeURIComponent(branch)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setLines((l) => [...l, { kind: "err", text: data.error ?? `HTTP ${res.status}` }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const ev = JSON.parse(buf.slice(0, i));
          buf = buf.slice(i + 1);
          if (ev.type === "output") setLines((l) => [...l.slice(-3000), { kind: ev.stream === "stderr" ? "err" : "out", text: ev.chunk }]);
          else if (ev.type === "exit") setLines((l) => [...l, { kind: "meta", text: `exit ${ev.exitCode}${ev.timedOut ? " (timed out)" : ""} · ${(ev.durationMs / 1000).toFixed(1)}s` }]);
          else if (ev.type === "error") setLines((l) => [...l, { kind: "err", text: ev.message }]);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setLines((l) => [...l, { kind: "err", text: String(e) }]);
      else setLines((l) => [...l, { kind: "meta", text: "stopped" }]);
    } finally {
      setRunning(null);
      refreshFiles();
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#07080c] font-mono text-[12px]">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {lines.map((l, i) => (
          <div key={i} className={cx("whitespace-pre-wrap break-words leading-relaxed", l.kind === "cmd" ? "mt-1.5 text-accent-2" : l.kind === "err" ? "text-err/90" : l.kind === "meta" ? "text-fg-3" : "text-fg-2")}>
            {l.kind === "cmd" ? `$ ${l.text}` : l.text}
          </div>
        ))}
        {!status?.commands && <div className="text-warn">Command execution is disabled on this server.</div>}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
        <span className="text-accent-2">$</span>
        <input
          className="h-7 flex-1 bg-transparent focus:outline-none"
          value={cmd}
          placeholder={running ? "running…" : "npm test"}
          list="rb-term-suggestions"
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(cmd);
            if (e.key === "ArrowUp" && history.length) {
              e.preventDefault();
              const idx = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
              setHIdx(idx);
              setCmd(history[idx]);
            }
            if (e.key === "ArrowDown" && hIdx >= 0) {
              e.preventDefault();
              const idx = hIdx + 1;
              if (idx >= history.length) {
                setHIdx(-1);
                setCmd("");
              } else {
                setHIdx(idx);
                setCmd(history[idx]);
              }
            }
            if (e.key === "c" && e.ctrlKey && running) running.abort();
          }}
        />
        <datalist id="rb-term-suggestions">
          {SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {running ? (
          <button className="btn btn-ghost h-6 px-1.5 text-err" onClick={() => running.abort()} title="Stop (Ctrl+C)">
            <Square className="size-3" />
          </button>
        ) : (
          <button className="btn btn-ghost h-6 px-1.5" onClick={() => run(cmd)} title="Run">
            <CornerDownLeft className="size-3" />
          </button>
        )}
        <button className="btn btn-ghost h-6 px-1.5" onClick={() => setLines([])} title="Clear">
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
