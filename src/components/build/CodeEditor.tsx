"use client";

import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { findByPath } from "@/lib/fileSystem";
import { languageForPath } from "@/lib/paths";
import { FileIcon, SearchIcon, SparkleIcon, XIcon } from "@/components/icons";
import { useResolvedTheme } from "./useResolvedTheme";
import { useLiveWrite } from "./useLiveWrite";
import { askPanda, buildAskPrompt } from "./askPanda";
import { displayPath } from "./fileMenu";

// The editor, and the one pane with no close button: closing the thing you came
// here to write in would only ever be a mistake, and the other three panes can
// already be cleared out of its way.
//
// THE RIGHT-CLICK MENU INSIDE THE EDITOR
//
// Monaco already has one, and it is a good one — cut, copy, paste, go to
// definition, the lot. So the entries below are ADDED to it with `addAction`
// and a `contextMenuGroupId`, rather than a menu of our own drawn on top of
// Monaco's and fighting it for the same right-click. A second menu would have
// meant reimplementing find, format and go-to-line by hand and losing whatever
// Monaco gains next year.
//
// Every one of them is also reachable without a right-click: each has a real
// keybinding, and the toolbar under the tabs carries the three a student
// actually reaches for on a phone, where there is no right-click at all and
// Monaco's menu cannot be opened.
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
        // Monaco's right-click menu is drawn by Monaco, from its OWN palette:
        // leave these out and the menu comes up white on a dark workspace,
        // which is exactly the drift the rest of this function exists to stop.
        // Found the hard way — the menu looked fine in the light theme and
        // like a bug in the other four.
        "menu.background": cssToken("--surface-0", fallback),
        "menu.foreground": cssToken("--text-dim", mode === "dark" ? "#b4b4b4" : "#3d3d3d"),
        "menu.selectionBackground": cssToken("--surface-2", "#262626"),
        "menu.selectionForeground": cssToken("--text", mode === "dark" ? "#ececec" : "#0d0d0d"),
        "menu.separatorBackground": cssToken("--line", "#2a2a2a"),
        "menu.border": cssToken("--line-strong", "#3d3d3d"),
        // The find widget and the quick-input box (go to line, go to symbol)
        // are the same story.
        "input.background": cssToken("--surface-2", "#262626"),
        "input.foreground": cssToken("--text", mode === "dark" ? "#ececec" : "#0d0d0d"),
        "input.border": cssToken("--line", "#2a2a2a"),
        "quickInput.background": cssToken("--surface-0", fallback),
        "quickInput.foreground": cssToken("--text", mode === "dark" ? "#ececec" : "#0d0d0d"),
        "list.hoverBackground": cssToken("--surface-2", "#262626"),
        "list.activeSelectionBackground": cssToken("--surface-3", "#333333"),
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

  // What Panda is writing right now, if anything. See useLiveWrite for why this
  // is deliberately NOT the project: nothing below is saved, and the student's
  // files are untouched until they apply.
  const livePath = useLiveWrite((s) => s.path);
  const liveKind = useLiveWrite((s) => s.kind);
  const liveContent = useLiveWrite((s) => s.content);

  const mode = useResolvedTheme();
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  // Word wrap is off by default because code is written in lines, and on by
  // choice because a phone is 360px wide and horizontal scrolling inside a
  // scrolling page is how a student loses their place entirely.
  const [wrap, setWrap] = useState(false);

  // The Monaco actions below are registered once per mounted editor, so they
  // read the open file off the store when they run rather than closing over
  // whatever was open when they were created. Otherwise "copy this file's path"
  // would copy the path of the file the student had open ten minutes ago.
  const currentPath = () => useStudioStore.getState().activeTab;

  /** Runs a built-in Monaco command, and says nothing if Monaco never mounted. */
  const runInEditor = useCallback((commandId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.getAction(commandId)?.run();
  }, []);

  /** The selection, or the whole file when nothing is selected — which is what a student means by "this". */
  const selectedText = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return "";
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return model.getValue();
    return model.getValueInRange(selection);
  }, []);

  const ask = useCallback(
    (kind: "explain" | "fix") => {
      const path = useStudioStore.getState().activeTab;
      if (!path) return;
      askPanda(buildAskPrompt(kind, path, selectedText()));
    },
    [selectedText],
  );

  /**
   * The app's own entries in Monaco's menu.
   *
   * Registered on the editor rather than globally so they disappear with it,
   * and given keybindings as well as menu positions: the menu is the
   * discoverable route and the key is the fast one, and neither is the only
   * one. `navigation` and `9_cutcopypaste` are Monaco's own group ids, so our
   * entries sit among the built-ins instead of in a lonely section at the
   * bottom.
   */
  const registerActions = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      const add = (
        id: string,
        label: string,
        group: string,
        order: number,
        run: () => void,
        keybindings: number[] = [],
      ) => {
        editor.addAction({ id, label, contextMenuGroupId: group, contextMenuOrder: order, keybindings, run });
      };

      // Panda first, because it is the reason this editor is not Notepad.
      add("panda.explain", "Ask Panda about this", "panda", 1, () => ask("explain"), [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE,
      ]);
      add("panda.fix", "Ask Panda to fix this", "panda", 2, () => ask("fix"), [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      ]);

      add("panda.format", "Tidy up this file", "1_modification", 1, () =>
        editor.getAction("editor.action.formatDocument")?.run(),
      );
      add("panda.find", "Find in this file", "navigation", 1, () =>
        editor.getAction("actions.find")?.run(),
      );
      add("panda.replace", "Find and replace", "navigation", 2, () =>
        editor.getAction("editor.action.startFindReplaceAction")?.run(),
      );
      add("panda.goToLine", "Go to line…", "navigation", 3, () =>
        editor.getAction("editor.action.gotoLine")?.run(),
      );
      add(
        "panda.palette",
        "Find a file or run a command",
        "navigation",
        4,
        () => window.dispatchEvent(new CustomEvent("panda:open-palette")),
        [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      );
      add("panda.copyPath", "Copy this file\u2019s path", "9_cutcopypaste", 5, () => {
        const path = currentPath();
        if (!path) return;
        void navigator.clipboard?.writeText(
          displayPath(useStudioStore.getState().project?.name ?? "project", path),
        );
      });
      // Ctrl/Cmd-S is muscle memory, and inside Monaco the browser's own
      // "save this page" dialog would otherwise win. The app autosaves anyway,
      // so this is reassurance made real rather than a new capability.
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void useStudioStore.getState().persist();
      });
    },
    [ask],
  );

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

  // The same actions, asked for from outside the editor — from the command
  // palette, which is the route for anyone who never touches a pointer. The
  // editor is the only thing that can run them, so it listens rather than
  // exporting a handle and hoping whoever holds it is still mounted.
  useEffect(() => {
    function onEditorAction(e: Event) {
      const id = (e as CustomEvent<{ commandId: string }>).detail?.commandId;
      if (id) runInEditor(id);
    }
    function onAsk(e: Event) {
      const kind = (e as CustomEvent<{ kind: "explain" | "fix" }>).detail?.kind;
      if (kind) ask(kind);
    }
    window.addEventListener("panda:editor-action", onEditorAction);
    window.addEventListener("panda:ask-selection", onAsk);
    return () => {
      window.removeEventListener("panda:editor-action", onEditorAction);
      window.removeEventListener("panda:ask-selection", onAsk);
    };
  }, [runInEditor, ask]);

  const activeFile = project && activeTab ? findByPath(project, activeTab) : undefined;

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--surface-1)]">
      <div className="scroll-x flex h-8 shrink-0 items-center border-b border-[var(--line)] bg-[var(--surface-0)]">
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
                title={tab.path}
                // Middle-click closes, the way it does in a browser and in VS
                // Code. It is a shortcut, never the only way: the × is right
                // there and has its own label.
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.path);
                  }
                }}
                className={`flex h-full shrink-0 items-center gap-1.5 border-r border-[var(--line)] pr-1.5 ${
                  active ? "bg-[var(--surface-1)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <button
                  onClick={() => setActiveTab(tab.path)}
                  aria-current={active ? "true" : undefined}
                  className={`flex h-full items-center gap-1.5 pl-2.5 text-sm md:text-xs ${
                    active ? "text-[var(--text)]" : "text-[var(--text-faint)] hover:text-[var(--text-dim)]"
                  }`}
                >
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
                  <span className="max-w-[150px] truncate">{name}</span>
                  {/* The dirty dot gets a label of its own. It is the only
                      thing on the tab that says "not saved yet", and a dot
                      says nothing at all to a screen reader. */}
                  {tab.dirty && (
                    <span
                      title="Not saved yet"
                      aria-label="Not saved yet"
                      role="img"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                    />
                  )}
                </button>
                <button
                  onClick={() => closeTab(tab.path)}
                  aria-label={`Close ${name}`}
                  title={`Close ${name}`}
                  className="tap-sq inline-flex items-center justify-center shrink-0 rounded p-0.5 text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* BREADCRUMBS AND THE THREE BUTTONS.
          The breadcrumb answers "where am I", which a tab strip showing eight
          files called index.html cannot. The buttons are the phone answer to
          Monaco's right-click menu: find, tidy, and ask Panda are the three a
          student actually reaches for, and on a touch screen there is no other
          way to reach them at all. Everything else stays in the menu and on a
          key. */}
      {activeFile && !livePath && (
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--line)] bg-[var(--surface-0)] px-2">
          <nav aria-label="Where this file lives" className="scroll-x flex min-w-0 flex-1 items-center gap-1">
            {activeFile.path.split("/").map((segment, index, all) => (
              <span key={`${segment}-${index}`} className="flex shrink-0 items-center gap-1">
                {index > 0 && <span aria-hidden className="text-[var(--text-faint)]">/</span>}
                <span
                  className={`truncate font-mono text-[11px] ${
                    index === all.length - 1 ? "text-[var(--text-dim)]" : "text-[var(--text-faint)]"
                  }`}
                >
                  {segment}
                </span>
              </span>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => runInEditor("actions.find")}
            title="Find in this file (Ctrl F)"
            aria-label="Find in this file"
            className="tap-sq tap-pad inline-flex shrink-0 items-center justify-center rounded p-1 text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <SearchIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-pressed={wrap}
            title={wrap ? "Stop wrapping long lines" : "Wrap long lines"}
            aria-label={wrap ? "Stop wrapping long lines" : "Wrap long lines"}
            className={`tap-sq tap-pad inline-flex shrink-0 items-center justify-center rounded px-1.5 py-1 font-mono text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
              wrap ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--text-faint)] hover:bg-[var(--surface-2)]"
            }`}
          >
            wrap
          </button>
          <button
            type="button"
            onClick={() => ask("explain")}
            title="Ask Panda about the selected code (Ctrl Shift E)"
            aria-label="Ask Panda about the selected code"
            className="tap-sq tap-pad inline-flex shrink-0 items-center justify-center rounded p-1 text-[var(--accent)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <SparkleIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {livePath ? (
          // THE FILE, AS IT IS BEING WRITTEN.
          //
          // It takes over the editor body rather than opening a tab, and that is
          // the careful choice: a tab is a thing you own and close, and this is
          // a thing that appears and then goes away on its own. Opening tabs for
          // files that may not exist when the turn ends would leave the student
          // holding half a dozen tabs pointing at nothing.
          //
          // Read-only, because typing into it would be typing into a buffer that
          // is about to be overwritten by the next token.
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-0)] px-3 py-1.5">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--success)]" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-dim)]" title={livePath}>
                {livePath}
              </span>
              {/* Said in words as well as shown: "writing" and "rewriting" are
                  different promises about the student's existing file. */}
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                {liveKind === "create" ? "writing" : liveKind === "modify" ? "rewriting" : liveKind}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Editor
                path={`live://${livePath}`}
                language={languageForPath(livePath)}
                value={liveContent}
                theme={`panda-${mode}`}
                beforeMount={beforeMount}
                loading={<span className="text-sm text-[var(--text-faint)]">Getting the editor ready…</span>}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  automaticLayout: true,
                  tabSize: 2,
                  readOnly: true,
                  domReadOnly: true,
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  padding: { top: 12 },
                  wordWrap: "off",
                }}
                onMount={(editor) => {
                  // Follow the writing. Without this the view sits at line one
                  // while the interesting part scrolls past below the fold.
                  editor.onDidChangeModelContent(() => {
                    const last = editor.getModel()?.getLineCount() ?? 1;
                    editor.revealLine(last);
                  });
                }}
              />
            </div>
          </div>
        ) : activeFile ? (
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
              wordWrap: wrap ? "on" : "off",
              quickSuggestions: true,
              // Monaco's own menu is what our actions are added to, so it very
              // much stays on.
              contextmenu: true,
              // ...and it is drawn in the page rather than in a shadow root.
              // Monaco themes the menu from two directions: the text colour
              // rides in on a CSS variable, which inherits into a shadow root
              // fine, but the BACKGROUND comes from a rule Monaco writes into
              // the document stylesheet, and a document rule cannot reach
              // inside a shadow root. The result was a white menu with our
              // grey text on it in all five themes — legible in one of them by
              // luck. Out of the shadow root, both halves land.
              useShadowDOM: false,
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              registerActions(editor, monaco);
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
