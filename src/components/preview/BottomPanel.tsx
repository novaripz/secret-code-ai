"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { buildPreviewDocument } from "@/lib/buildPreviewDocument";
import { PlayIcon, RefreshIcon } from "@/components/icons";

type Tab = "preview" | "console" | "problems";

export function BottomPanel() {
  const project = useStudioStore((s) => s.project);
  const consoleEntries = useStudioStore((s) => s.consoleEntries);
  const pushConsoleEntry = useStudioStore((s) => s.pushConsoleEntry);
  const clearConsole = useStudioStore((s) => s.clearConsole);

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

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/5 px-2 shrink-0">
        <div className="flex items-center">
          {(["preview", "console", "problems"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${
                tab === t ? "border-sky-400 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t}
              {t === "console" && errorCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center text-[10px] bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5">
                  {errorCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 py-1">
          <button
            onClick={run}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          >
            <PlayIcon className="w-3.5 h-3.5" /> Run
          </button>
          <button
            onClick={refresh}
            title="Refresh preview"
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "preview" && (
          <div className="h-full bg-white">
            {!running && !entryFound ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm bg-zinc-950">
                Click <span className="mx-1 font-medium text-zinc-300">Run</span> to render your project&apos;s{" "}
                <code className="mx-1 text-zinc-300">index.html</code>.
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
              <div className="text-zinc-600 px-1 py-4 text-center">
                No output yet. Run the preview to see console logs and errors here.
              </div>
            ) : (
              consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`px-2 py-1 rounded whitespace-pre-wrap break-words ${
                    entry.level === "error"
                      ? "bg-red-500/10 text-red-300"
                      : entry.level === "warn"
                      ? "bg-amber-500/10 text-amber-300"
                      : "text-zinc-400"
                  }`}
                >
                  {entry.text}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "problems" && (
          <div className="h-full overflow-y-auto text-xs p-3 text-zinc-500">
            {errorCount === 0 ? (
              <div className="text-center py-4">No problems detected. Runtime errors will surface here after you Run the preview.</div>
            ) : (
              <div className="space-y-1">
                {consoleEntries
                  .filter((e) => e.level === "error")
                  .map((e) => (
                    <div key={e.id} className="px-2 py-1 rounded bg-red-500/10 text-red-300">
                      {e.text}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
