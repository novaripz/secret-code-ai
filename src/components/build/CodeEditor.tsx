"use client";

import Editor, { type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useRef } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { findByPath } from "@/lib/fileSystem";
import { languageForPath } from "@/lib/paths";
import { FileIcon, XIcon } from "@/components/icons";
import { useResolvedTheme } from "./useResolvedTheme";

// The editor, and the one pane with no close button: closing the thing you came
// here to write in would only ever be a mistake, and the other three panes can
// already be cleared out of its way.
//
// Monaco ships its own themes, and left alone it stays on whichever one it
// booted with — which is how you end up with a white editor sitting in a dark
// app. So the app's own tokens are read out of the stylesheet at runtime and
// handed to Monaco as a theme, and redefined whenever the app theme flips.
// Reading them rather than repeating them means the editor can never drift from
// the rest of the workspace.

function cssToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Monaco only accepts plain hex; anything else would throw and leave the
  // editor themeless.
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

function defineWorkspaceTheme(monaco: Monaco, mode: "dark" | "light") {
  const fallback = mode === "dark" ? "#171717" : "#ffffff";
  try {
    monaco.editor.defineTheme(`panda-${mode}`, {
      base: mode === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": cssToken("--surface-1", fallback),
        "editor.foreground": cssToken("--text", mode === "dark" ? "#ececec" : "#0d0d0d"),
        "editorGutter.background": cssToken("--surface-1", fallback),
        "editorLineNumber.foreground": cssToken("--text-faint", "#8a8a8a"),
        "editorLineNumber.activeForeground": cssToken("--text-dim", "#b4b4b4"),
        "editor.lineHighlightBackground": cssToken("--surface-2", fallback),
        "editor.selectionBackground": cssToken("--surface-3", "#333333"),
        "editorCursor.foreground": cssToken("--text", "#ececec"),
        "editorWidget.background": cssToken("--surface-0", fallback),
        "editorWidget.border": cssToken("--line", "#2a2a2a"),
        "editorSuggestWidget.background": cssToken("--surface-0", fallback),
        "scrollbarSlider.background": cssToken("--surface-3", "#333333"),
      },
    });
  } catch {
    // A malformed token shouldn't cost the student their editor.
  }
}

export function CodeEditor() {
  const project = useStudioStore((s) => s.project);
  const tabs = useStudioStore((s) => s.tabs);
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const closeTab = useStudioStore((s) => s.closeTab);
  const editFileContent = useStudioStore((s) => s.editFileContent);

  const mode = useResolvedTheme();
  const monacoRef = useRef<Monaco | null>(null);

  const beforeMount = useCallback((monaco: Monaco) => {
    monacoRef.current = monaco;
    defineWorkspaceTheme(monaco, "dark");
    defineWorkspaceTheme(monaco, "light");
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    // The token values themselves changed with the theme, so the definition has
    // to be rebuilt, not just re-selected.
    defineWorkspaceTheme(monaco, mode);
    monaco.editor.setTheme(`panda-${mode}`);
  }, [mode]);

  const activeFile = project && activeTab ? findByPath(project, activeTab) : undefined;

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--surface-1)]">
      <div className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-[var(--line)] bg-[var(--surface-0)]">
        {tabs.length === 0 ? (
          <span className="px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            Editor
          </span>
        ) : (
          tabs.map((tab) => {
            const name = tab.path.split("/").pop() ?? tab.path;
            const active = activeTab === tab.path;
            return (
              <div
                key={tab.path}
                className={`flex h-full shrink-0 items-center gap-1.5 border-r border-[var(--line)] pr-1.5 ${
                  active ? "bg-[var(--surface-1)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <button
                  onClick={() => setActiveTab(tab.path)}
                  aria-current={active ? "true" : undefined}
                  className={`flex h-full items-center gap-1.5 pl-2.5 text-xs ${
                    active ? "text-[var(--text)]" : "text-[var(--text-faint)] hover:text-[var(--text-dim)]"
                  }`}
                >
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
                  <span className="max-w-[150px] truncate">{name}</span>
                  {tab.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
                </button>
                <button
                  onClick={() => closeTab(tab.path)}
                  aria-label={`Close ${name}`}
                  title={`Close ${name}`}
                  className="shrink-0 rounded p-0.5 text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="min-h-0 flex-1">
        {activeFile ? (
          <Editor
            key={activeFile.path}
            path={activeFile.path}
            language={languageForPath(activeFile.path)}
            value={activeFile.content ?? ""}
            theme={`panda-${mode}`}
            beforeMount={beforeMount}
            onChange={(value) => editFileContent(activeFile.path, value ?? "")}
            loading={
              <span className="text-sm text-[var(--text-faint)]">Getting the editor ready…</span>
            }
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              automaticLayout: true,
              tabSize: 2,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              padding: { top: 12 },
              wordWrap: "off",
              quickSuggestions: true,
            }}
          />
        ) : (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--text-faint)]">
            Pick a file from your files, or ask Panda and it&apos;ll make one for you.
          </p>
        )}
      </div>
    </div>
  );
}
