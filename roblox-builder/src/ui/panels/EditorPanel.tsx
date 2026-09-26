"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { AlertTriangle, FileCode2, X } from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagnostic } from "@/core/diagnostics";
import { analyzeLuau } from "@/core/luau/analyzer";
import { dottedPath } from "@/core/roblox/instance";
import { api } from "../api";
import { cx, EmptyState } from "../common/ui";
import { useWorkspace } from "../workspace/store";
import { fileIcon } from "./FilesPanel";
import { languageFor, registerLuau } from "./luauMonaco";

// Monaco is served by this app (public/monaco, copied at install), never a CDN.
loader.config({ paths: { vs: "/monaco/vs" } });

function contextFor(path: string): "server" | "client" | "module" {
  if (/\.server\.(luau|lua)$/.test(path) || /\/init\.server\./.test(path)) return "server";
  if (/\.client\.(luau|lua)$/.test(path)) return "client";
  return "module";
}

function toMarkers(monaco: typeof Monaco, diags: Diagnostic[]): Monaco.editor.IMarkerData[] {
  return diags
    .filter((d) => d.line)
    .map((d) => ({
      severity: d.severity === "error" ? monaco.MarkerSeverity.Error : d.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
      message: d.message + (d.fix ? `\n\nQuick fix: ${d.fix.description}` : ""),
      source: d.rule,
      startLineNumber: d.line!,
      startColumn: d.col ?? 1,
      endLineNumber: d.endLine ?? d.line!,
      endColumn: d.endCol && (d.endLine ?? d.line) === d.line && d.endCol > (d.col ?? 1) ? d.endCol : (d.col ?? 1) + 200,
    }));
}

export default function EditorPanel() {
  const { tabs, activeTab, buffers, files, diskChanged, closeTab, setBuffer, save, reloadFromDisk, report, build, projectId, branch } = useWorkspace();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const liveDiags = useRef<Diagnostic[]>([]);
  const [theme, setTheme] = useState("rb-dark");
  const [cursor, setCursor] = useState<{ line: number; col: number }>();
  const [problems, setProblems] = useState(0);

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "rb-light" : "rb-dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const file = activeTab ? files.get(activeTab) : undefined;
  const value = activeTab ? (buffers[activeTab] ?? file?.text ?? "") : "";
  const mapped = useMemo(() => {
    if (!activeTab || !build) return undefined;
    const id = build.nodesByFile.get(activeTab)?.[0];
    if (!id) return undefined;
    const node = [...(function* all(n): Generator<typeof build.root> { yield n; for (const c of n.children) yield* all(c); })(build.root)].find((n) => n.id === id);
    return node ? `${dottedPath(node.id)} · ${node.className}` : undefined;
  }, [activeTab, build]);

  // Markers: live analysis for Luau (instant), plus the last project-wide check for everything else.
  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model || !activeTab) return;
    const t = setTimeout(() => {
      let diags: Diagnostic[] = [];
      if (/\.(luau|lua)$/.test(activeTab)) {
        diags = analyzeLuau(value, contextFor(activeTab), activeTab).diagnostics;
        // Cross-file findings (missing requires, remote wiring) come from the project check.
        const projectOnly = (report?.diagnostics ?? []).filter((d) => d.file === activeTab && !d.rule.startsWith("luau/") && d.rule !== "roblox/client-server" && d.rule !== "roblox/unknown-service");
        if (buffers[activeTab] === undefined) diags = [...diags, ...projectOnly];
      } else {
        diags = (report?.diagnostics ?? []).filter((d) => d.file === activeTab);
      }
      liveDiags.current = diags;
      setProblems(diags.filter((d) => d.severity !== "info").length);
      monaco.editor.setModelMarkers(model, "rb", toMarkers(monaco, diags));
    }, 180);
    return () => clearTimeout(t);
  }, [value, activeTab, report, buffers]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco as unknown as typeof Monaco;
    editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => useWorkspace.getState().save());
    // Quick fixes from the analyzer's repair suggestions.
    monaco.languages.registerCodeActionProvider("luau", {
      provideCodeActions(model, range) {
        const actions = liveDiags.current
          .filter((d) => d.fix?.kind === "text-edits" && d.line && d.line <= range.endLineNumber && (d.endLine ?? d.line) >= range.startLineNumber)
          .map((d) => {
            const fix = d.fix as Extract<NonNullable<Diagnostic["fix"]>, { kind: "text-edits" }>;
            return {
              title: fix.description,
              kind: "quickfix",
              isPreferred: true,
              diagnostics: [],
              edit: {
                edits: fix.edits.map((e) => ({
                  resource: model.uri,
                  versionId: undefined,
                  textEdit: { range: new monaco.Range(e.line, e.col, e.endLine, e.endCol), text: e.text },
                })),
              },
            };
          });
        return { actions, dispose() {} };
      },
    });
  };

  if (!tabs.length || !activeTab) {
    return (
      <EmptyState icon={<FileCode2 className="size-5" />} title="No file open">
        Pick a file in Files, an instance in Explorer, or press <span className="kbd">⌘K</span> to jump to anything.
      </EmptyState>
    );
  }

  const isImage = file?.binary && /\.(png|jpe?g|gif|webp)$/.test(activeTab);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-line bg-bg-2/40 [scrollbar-width:none]">
        {tabs.map((t) => (
          <div
            key={t}
            onClick={() => useWorkspace.setState({ activeTab: t })}
            onAuxClick={(e) => e.button === 1 && closeTab(t)}
            className={cx(
              "group flex cursor-pointer items-center gap-1.5 border-r border-line px-3 text-xs",
              t === activeTab ? "bg-panel text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-fg-3 hover:text-fg-2",
            )}
            title={t}
          >
            {fileIcon(t, "size-3")}
            <span className="max-w-44 truncate">{t.split("/").pop()}</span>
            {buffers[t] !== undefined ? (
              <span className="size-1.5 rounded-full bg-accent group-hover:hidden" />
            ) : null}
            <button
              className={cx("rounded p-0.5 hover:bg-raise", buffers[t] !== undefined ? "hidden group-hover:block" : "opacity-0 group-hover:opacity-100")}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t);
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 px-3 text-[11px] text-fg-3">
        <span className="truncate">{activeTab}</span>
        {mapped && (
          <>
            <span>→</span>
            <span className="truncate text-accent-2">{mapped}</span>
          </>
        )}
        <div className="flex-1" />
        {problems > 0 && <span className="text-warn">{problems} problem{problems === 1 ? "" : "s"}</span>}
        {cursor && (
          <span>
            Ln {cursor.line}, Col {cursor.col}
          </span>
        )}
      </div>
      {diskChanged[activeTab] && (
        <div className="flex items-center gap-2 bg-warn/10 px-3 py-1.5 text-xs text-warn">
          <AlertTriangle className="size-3.5" /> This file changed on disk (the agent edited it) while you had unsaved changes.
          <div className="flex-1" />
          <button className="btn h-6 text-xs" onClick={() => reloadFromDisk(activeTab)}>
            Load theirs
          </button>
          <button className="btn h-6 text-xs" onClick={() => save(activeTab)}>
            Keep mine
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {isImage ? (
          <div className="checker-bg grid h-full place-items-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={api.rawFileUrl(projectId, branch, activeTab)} alt={activeTab} className="max-h-full max-w-full rounded-lg shadow-2xl" />
          </div>
        ) : file?.binary ? (
          <EmptyState title="Binary file">This file is binary. Download it from the Files panel.</EmptyState>
        ) : (
          <Editor
            path={activeTab}
            value={value}
            language={languageFor(activeTab)}
            theme={theme}
            beforeMount={(monaco) => registerLuau(monaco as unknown as typeof Monaco)}
            onMount={onMount}
            onChange={(v) => setBuffer(activeTab, v ?? "")}
            options={{
              fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
              fontSize: 13,
              fontLigatures: true,
              minimap: { enabled: true, scale: 1, renderCharacters: false },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorSmoothCaretAnimation: "on",
              renderLineHighlight: "all",
              tabSize: 4,
              insertSpaces: false,
              detectIndentation: true,
              padding: { top: 8 },
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: "active" },
              lightbulb: { enabled: "on" as never },
            }}
            loading={<div className="grid h-full place-items-center text-xs text-fg-3">Loading editor…</div>}
          />
        )}
      </div>
    </div>
  );
}
