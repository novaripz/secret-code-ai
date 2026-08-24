"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useMemoryStore } from "@/store/useMemoryStore";
import { buildPreviewDocument } from "@/lib/buildPreviewDocument";
import { PlayIcon, RefreshIcon, BookIcon } from "@/components/icons";

type Tab = "preview" | "console" | "problems" | "log";

export function BottomPanel() {
  const project = useStudioStore((s) => s.project);
  const consoleEntries = useStudioStore((s) => s.consoleEntries);
  const pushConsoleEntry = useStudioStore((s) => s.pushConsoleEntry);
  const clearConsole = useStudioStore((s) => s.clearConsole);
  const buildLog = useMemoryStore((s) => s.buildLog);

  const [tab, setTab] = useState<Tab>("preview");
  const [running, setRunning] = useState(false);
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { html, entryFound } = useMemo(
    () => (project ? buildPreviewDocument(project) : { html: "", entryFound: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, nonce]
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object" || !e.data.__preview) return;
      pushConsoleEntry({ level: e.data.level ?? "log", text: e.data.text ?? "" });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushConsoleEntry]);

  function run() {
    setRunning(true);
    clearConsole();
    setNonce((n) => n + 1);
    setTab("preview");
  }

  function refresh() {
    setNonce((n) => n + 1);
  }

  const errorCount = consoleEntries.filter((e) => e.level === "error").length;

  const TABS: { key: Tab; label: string }[] = [
    { key: "preview", label: "See It Run" },
    { key: "console", label: "Messages" },
    { key: "problems", label: "Problems" },
    { key: "log", label: "What We Built" },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--surface-0)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-2 shrink-0">
        <div className="flex items-center">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-faint)] hover:text-[var(--text-dim)]"
              }`}
            >
              {t.label}
              {t.key === "console" && errorCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center text-[10px] bg-[var(--danger-soft)] text-[var(--danger)] rounded-full px-1.5 py-0.5">
                  {errorCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 py-1">
          <button
            onClick={run}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[var(--success-soft)] text-[var(--success)] hover:brightness-95 font-medium"
          >
            <PlayIcon className="w-3.5 h-3.5" /> Run
          </button>
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-faint)]"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "preview" && (
          <div className="h-full bg-white">
            {!running && !entryFound ? (
              <div className="h-full flex items-center justify-center text-[var(--text-faint)] text-sm text-center px-6 bg-[var(--surface-0)]">
                Click <span className="mx-1 font-medium text-[var(--text)]">Run</span> to see your project come to
                life.
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                key={nonce}
                title="Preview"
                srcDoc={html}
                sandbox="allow-scripts allow-forms allow-modals"
                className="w-full h-full border-0 bg-white"
              />
            )}
          </div>
        )}

        {tab === "console" && (
          <div className="h-full overflow-y-auto font-mono text-xs p-2 space-y-1">
            {consoleEntries.length === 0 ? (
              <div className="text-[var(--text-faint)] px-1 py-4 text-center">
                Nothing here yet. Click Run to see messages from your project show up here.
              </div>
            ) : (
              consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`px-2 py-1 rounded whitespace-pre-wrap break-words ${
                    entry.level === "error"
                      ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                      : entry.level === "warn"
                      ? "bg-[var(--warn-soft)] text-[var(--warn)]"
                      : "text-[var(--text-dim)]"
                  }`}
                >
                  {entry.text}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "problems" && (
          <div className="h-full overflow-y-auto text-xs p-3 text-[var(--text-faint)]">
            {errorCount === 0 ? (
              <div className="text-center py-4">Nothing broken that I can see! Click Run to double-check.</div>
            ) : (
              <div className="space-y-1">
                {consoleEntries
                  .filter((e) => e.level === "error")
                  .map((e) => (
                    <div key={e.id} className="px-2 py-1 rounded bg-[var(--danger-soft)] text-[var(--danger)]">
                      {e.text}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {tab === "log" && (
          <div className="h-full overflow-y-auto text-sm p-3">
            {buildLog.length === 0 ? (
              <div className="text-center py-6 text-[var(--text-faint)] flex flex-col items-center gap-2">
                <BookIcon className="w-6 h-6" />
                Nothing built yet — ask for help to get started, and I&apos;ll keep track of it here.
              </div>
            ) : (
              <ol className="space-y-2">
                {[...buildLog].reverse().map((entry) => (
                  <li key={entry.id} className="flex gap-2 px-2 py-1.5 rounded-lg bg-[var(--surface-2)]">
                    <span className="text-[var(--text-faint)] text-xs shrink-0 pt-0.5">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[var(--text-dim)]">{entry.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
