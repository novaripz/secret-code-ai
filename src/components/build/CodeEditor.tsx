"use client";

import Editor, { type Monaco, type OnChange } from "@monaco-editor/react";
import type { editor as MonacoEditor, Uri as MonacoUri } from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { findByPath, getChildren, listAllFiles } from "@/lib/fileSystem";
import { fileName, languageForPath, parentPath } from "@/lib/paths";
import { isAssetNode } from "@/lib/assets";
import {
  ChevronRightIcon,
  CommandIcon,
  FileCodeIcon,
  FolderIcon,
  PlusFileIcon,
  SearchIcon,
  SlidersIcon,
  SparkleIcon,
  WandIcon,
  WrapTextIcon,
  XIcon,
} from "@/components/icons";
import { Kbd } from "@/components/ui/primitives";
import { useLiveWrite } from "./useLiveWrite";
import { AssetView } from "./AssetView";
import { askPanda, buildAskPrompt } from "./askPanda";
import { displayPath } from "./fileMenu";
import { FileTypeIcon } from "./fileIcons";
import { useEditorSettings } from "./useEditorSettings";
import { useProblems } from "./useProblems";
import { useWorkspaceLayout } from "./useWorkspaceLayout";
import { useFileActions } from "./useFileActions";
import { MONACO_THEME, defineAppTheme, registerPandaLanguageFeatures, useAppThemeName } from "./monacoSetup";
import { WORKSPACE_EVENTS, emit, modKey, type RevealDetail } from "./events";
import { useCursor } from "./StatusBar";

// The editor, and the one pane with no close button: closing the thing you came
// here to write in would only ever be a mistake.
//
// ONE EDITOR, ONE MODEL PER FILE
//
// Monaco used to be given `key={path}`, which threw the whole editor away and
// built a new one on every tab switch — and with it the undo history, the
// cursor and the scroll position of the file being left. A student who
// switched to style.css to check a class name came back to script.js unable to
// undo the line they had just deleted. Now one editor stays mounted and the
// `path` prop swaps MODELS under it: each file keeps its own model, so its own
// undo stack, and the library remembers each one's cursor and scroll.
//
// A model's path carries the project id. Two projects both have an
// index.html, and without the id the second project would have been handed the
// first one's model — undo history and all.
//
// THE RIGHT-CLICK MENU INSIDE THE EDITOR
//
// Monaco already has one, and the entries below are ADDED to it with
// `addAction`, rather than a second menu drawn on top fighting it for the same
// right-click. Every one of them is also reachable without a right-click: each
// has a real keybinding, and the toolbar above the code carries the ones a
// student reaches for on a phone, where there is no right-click at all.

/** The model path for a file: project id first, then each segment encoded so a `#` in a name is a name. */
function modelPath(projectId: string, path: string): string {
  return `${projectId}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The file a model belongs to, or null if it belongs to another project (or is not a file at all). */
function pathFromModel(projectId: string, model: MonacoEditor.ITextModel | null | undefined): string | null {
  if (!model || model.uri.scheme !== "file") return null;
  const prefix = `/${projectId}/`;
  return model.uri.path.startsWith(prefix) ? model.uri.path.slice(prefix.length) : null;
}

/** Code files worth checking for problems even when they have never been opened. */
const CHECKED_LANGUAGES = new Set(["javascript", "typescript", "css", "json"]);

export function CodeEditor({ phone = false }: { phone?: boolean }) {
  const project = useStudioStore((s) => s.project);
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
  const watching = useLiveWrite((s) => s.watching);
  const setWatching = useLiveWrite((s) => s.setWatching);

  const fontSize = useEditorSettings((s) => s.fontSize);
  const wordWrap = useEditorSettings((s) => s.wordWrap);
  const minimap = useEditorSettings((s) => s.minimap);
  const tabSize = useEditorSettings((s) => s.tabSize);
  const updateSettings = useEditorSettings((s) => s.update);

  const themeName = useAppThemeName();
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  // Flipped once Monaco exists, so the effects that need it run again.
  const [monacoReady, setMonacoReady] = useState(false);

  const projectId = project?.id ?? "";
  const activeFile = project && activeTab ? findByPath(project, activeTab) : undefined;
  const textFile = activeFile && activeFile.kind === "file" && !isAssetNode(activeFile) ? activeFile : undefined;
  const showingLive = livePath !== null && watching;

  /** Runs a built-in Monaco command, and says nothing if Monaco never mounted. */
  const runInEditor = useCallback((commandId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.getAction(commandId)?.run();
  }, []);

  /** The selection, or the whole file when nothing is selected — which is what a student means by "this". */
  const selectedText = useCallback((wholeFile = true) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return "";
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return wholeFile ? model.getValue() : "";
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
   * The app's own entries in Monaco's menu, and its keys.
   *
   * Registered on the editor rather than globally so they disappear with it.
   * Ctrl/Cmd-K is deliberately NOT one of them any more: it is the first key
   * of Monaco's own two-key shortcuts (Ctrl K Ctrl C to comment out a line),
   * and claiming it broke every one of them. Inside the editor the palette is
   * Ctrl/Cmd-P, which is what it is in every desktop editor anyway.
   */
  const registerActions = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      const { KeyMod, KeyCode } = monaco;
      const add = (
        id: string,
        label: string,
        group: string | undefined,
        order: number,
        run: () => void,
        keybindings: number[] = [],
      ) => {
        editor.addAction({
          id,
          label,
          ...(group ? { contextMenuGroupId: group, contextMenuOrder: order } : {}),
          keybindings,
          run,
        });
      };

      // Panda first, because it is the reason this editor is not Notepad.
      add("panda.explain", "Ask Panda about this", "panda", 1, () => ask("explain"), [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE,
      ]);
      // Was Ctrl/Cmd-Shift-F, which every student who has used an editor
      // before expects to search all their files. That is what it does now;
      // fixing moved one key along.
      add("panda.fix", "Ask Panda to fix this", "panda", 2, () => ask("fix"), [
        KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX,
      ]);
      add("panda.format", "Tidy up this file", "1_modification", 1, () =>
        editor.getAction("editor.action.formatDocument")?.run(),
      );
      add("panda.find", "Find in this file", "navigation", 1, () => editor.getAction("actions.find")?.run());
      add(
        "panda.findInFiles",
        "Find in all files",
        "navigation",
        2,
        () => emit(WORKSPACE_EVENTS.findInFiles, { query: selectedText(false) }),
        [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF],
      );
      add("panda.goToLine", "Go to line…", "navigation", 3, () => editor.getAction("editor.action.gotoLine")?.run());
      add(
        "panda.palette",
        "Find a file or run a command",
        "navigation",
        4,
        () => emit(WORKSPACE_EVENTS.openPalette),
        [KeyMod.CtrlCmd | KeyCode.KeyP, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP],
      );
      add("panda.copyPath", "Copy this file’s path", "9_cutcopypaste", 5, () => {
        const path = useStudioStore.getState().activeTab;
        if (!path) return;
        void navigator.clipboard?.writeText(displayPath(useStudioStore.getState().project?.name ?? "project", path));
      });
      add("panda.wrap", "Turn word wrap on or off", undefined, 0, () => {
        const settings = useEditorSettings.getState();
        settings.update({ wordWrap: !settings.wordWrap });
      }, [KeyMod.Alt | KeyCode.KeyZ]);
      add("panda.run", "Run the preview", undefined, 0, () => emit(WORKSPACE_EVENTS.runPreview), [
        KeyMod.CtrlCmd | KeyCode.Enter,
      ]);
      add("panda.sidebar", "Show or hide the side bar", undefined, 0, () => {
        const layout = useWorkspaceLayout.getState();
        if (layout.side) layout.closeSide();
        else layout.showSide("files");
      }, [KeyMod.CtrlCmd | KeyCode.KeyB]);
      add("panda.settings", "Editor settings", undefined, 0, () => emit(WORKSPACE_EVENTS.openSettings), [
        KeyMod.CtrlCmd | KeyCode.Comma,
      ]);
      // Ctrl/Cmd-S is muscle memory, and inside Monaco the browser's own
      // "save this page" dialog would otherwise win. The app autosaves anyway,
      // so this is reassurance made real rather than a new capability.
      editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
        void useStudioStore.getState().persist();
      });
    },
    [ask, selectedText],
  );

  const beforeMount = useCallback((monaco: Monaco) => {
    monacoRef.current = monaco;
    defineAppTheme(monaco);
    registerPandaLanguageFeatures(monaco);
  }, []);

  // The app theme changed: rebuild the editor's theme from the new tokens.
  // Redefining the theme Monaco is using makes Monaco re-apply it.
  useEffect(() => {
    if (monacoRef.current) defineAppTheme(monacoRef.current);
  }, [themeName, monacoReady]);

  // Edits made to the student's files elsewhere — Panda's changes, Find and
  // replace, a restored version — are written into each file's model too, as
  // an edit rather than a reset, so the student can still undo them. Models
  // for files that no longer exist, or for another project, are let go. And
  // every small code file gets a model even if it was never opened, which is
  // what lets the Problems tab show a missing bracket in a file the student
  // has not looked at today.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !project) return;
    const active = editorRef.current?.getModel();
    const files = new Map(
      listAllFiles(project)
        .filter((f) => !isAssetNode(f))
        .map((f) => [f.path, f.content ?? ""] as const),
    );
    for (const model of monaco.editor.getModels()) {
      if (model.uri.scheme !== "file" || model === active) continue;
      const path = pathFromModel(project.id, model);
      const text = path === null ? undefined : files.get(path);
      if (text === undefined) {
        if (path !== null) useProblems.getState().setForPath(path, []);
        model.dispose();
        continue;
      }
      if (model.getValue() !== text) {
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
      }
    }
    let created = 0;
    for (const [path, text] of files) {
      const language = languageForPath(path);
      if (!CHECKED_LANGUAGES.has(language) || created > 60) continue;
      const uri = monaco.Uri.parse(modelPath(project.id, path));
      if (!monaco.editor.getModel(uri)) {
        monaco.editor.createModel(text, language, uri);
        created++;
      }
    }
  }, [project, monacoReady]);

  // A new project starts with a clean Problems list.
  useEffect(() => {
    useProblems.getState().clear();
  }, [projectId]);

  // Monaco's own squiggles, forwarded to the Problems tab.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const subscription = monaco.editor.onDidChangeMarkers((uris: readonly MonacoUri[]) => {
      const id = useStudioStore.getState().project?.id;
      if (!id) return;
      for (const uri of uris) {
        const model = monaco.editor.getModel(uri);
        const path = model ? pathFromModel(id, model) : null;
        if (path === null) continue;
        const markers = monaco.editor
          .getModelMarkers({ resource: uri })
          .filter((m: MonacoEditor.IMarker) => m.severity >= monaco.MarkerSeverity.Warning);
        useProblems.getState().setForPath(
          path,
          markers.map((m: MonacoEditor.IMarker) => ({
            path,
            line: m.startLineNumber,
            col: m.startColumn,
            severity: m.severity === monaco.MarkerSeverity.Error ? "error" : "warning",
            message: m.message,
          })),
        );
      }
    });
    return () => subscription.dispose();
  }, [monacoReady]);

  // Requests from the rest of the workspace that only the editor can carry out.
  useEffect(() => {
    function onEditorAction(e: Event) {
      const id = (e as CustomEvent<{ commandId: string }>).detail?.commandId;
      if (id) runInEditor(id);
    }
    function onAsk(e: Event) {
      const kind = (e as CustomEvent<{ kind: "explain" | "fix" }>).detail?.kind;
      if (kind) ask(kind);
    }
    function onReveal(e: Event) {
      const detail = (e as CustomEvent<RevealDetail>).detail;
      if (!detail?.path) return;
      const store = useStudioStore.getState();
      store.openFile(detail.path);
      useLiveWrite.getState().setWatching(false);
      useWorkspaceLayout.getState().reveal("editor");
      if (!detail.line) return;
      // Two frames: one for React to hand the editor the new path, one for
      // the editor to swap to that file's model.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const editor = editorRef.current;
          if (!editor) return;
          const line = detail.line ?? 1;
          const col = detail.col ?? 1;
          editor.setSelection({
            startLineNumber: line,
            startColumn: col,
            endLineNumber: line,
            endColumn: col + (detail.length ?? 0),
          });
          editor.revealLineInCenterIfOutsideViewport(line);
          editor.focus();
        }),
      );
    }
    window.addEventListener(WORKSPACE_EVENTS.editorAction, onEditorAction);
    window.addEventListener(WORKSPACE_EVENTS.askSelection, onAsk);
    window.addEventListener(WORKSPACE_EVENTS.reveal, onReveal);
    return () => {
      window.removeEventListener(WORKSPACE_EVENTS.editorAction, onEditorAction);
      window.removeEventListener(WORKSPACE_EVENTS.askSelection, onAsk);
      window.removeEventListener(WORKSPACE_EVENTS.reveal, onReveal);
    };
  }, [runInEditor, ask]);

  // The edit goes to the file whose MODEL changed, read off the model itself,
  // never to "the active tab": the two can disagree for a moment during a
  // switch, and a keystroke filed under the wrong file is a keystroke lost.
  const onChange = useCallback<OnChange>(
    (value) => {
      const id = useStudioStore.getState().project?.id;
      const path = id ? pathFromModel(id, editorRef.current?.getModel()) : null;
      if (path) editFileContent(path, value ?? "");
    },
    [editFileContent],
  );

  const options = useMemo<MonacoEditor.IStandaloneEditorConstructionOptions>(
    () => ({
      fontSize,
      tabSize,
      insertSpaces: true,
      // A phone is 360px wide, and horizontal scrolling inside a scrolling
      // page is how a student loses their place entirely.
      wordWrap: wordWrap || phone ? "on" : "off",
      minimap: { enabled: minimap && !phone },
      lineNumbersMinChars: phone ? 2 : 3,
      folding: !phone,
      glyphMargin: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      padding: { top: 12, bottom: 12 },
      quickSuggestions: true,
      // Snippets first, so `!` and `log` are the top suggestion when typed.
      snippetSuggestions: "top",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: "active", indentation: true },
      renderLineHighlight: "all",
      cursorBlinking: "smooth",
      fontLigatures: false,
      fixedOverflowWidgets: true,
      // Monaco's own menu is what our actions are added to, so it very much
      // stays on — drawn in the page rather than in a shadow root, because the
      // menu's background comes from a document stylesheet rule that cannot
      // reach inside one (a white menu with grey text, in four themes of five).
      contextmenu: true,
      useShadowDOM: false,
    }),
    [fontSize, tabSize, wordWrap, minimap, phone],
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--surface-1)]">
      <TabStrip
        showingLive={showingLive}
        onPickTab={(path) => {
          setWatching(false);
          setActiveTab(path);
        }}
        onPickLive={() => setWatching(true)}
        onClose={closeTab}
      />

      {showingLive ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-0)] px-3">
          <span aria-hidden className="activity-dot h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-dim)]">
            Panda is {liveKind === "modify" ? "rewriting" : "writing"}{" "}
            <span className="ide-mono text-[var(--text)]">{livePath}</span>
            <span className="text-[var(--text-faint)]"> · nothing changes until you apply it</span>
          </span>
          <button type="button" onClick={() => setWatching(false)} className="btn btn-ghost btn-sm shrink-0">
            Back to my code
          </button>
        </div>
      ) : (
        activeFile && (
          <EditorToolbar
            path={activeFile.path}
            isText={!!textFile}
            phone={phone}
            wrap={wordWrap || phone}
            onFind={() => runInEditor("actions.find")}
            onFormat={() => runInEditor("editor.action.formatDocument")}
            onWrap={() => updateSettings({ wordWrap: !wordWrap })}
            onAsk={() => ask("explain")}
          />
        )
      )}

      <div className="relative min-h-0 flex-1">
        {textFile && project && (
          <div className={showingLive ? "hidden" : "h-full"}>
            <Editor
              path={modelPath(project.id, textFile.path)}
              language={languageForPath(textFile.path)}
              value={textFile.content ?? ""}
              theme={MONACO_THEME}
              beforeMount={beforeMount}
              onChange={onChange}
              // The model outlives the editor, so leaving for a picture and
              // coming back finds the file exactly as it was left.
              keepCurrentModel
              loading={<EditorLoading />}
              options={options}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                registerActions(editor, monaco);
                // The status bar's "Ln 12, Col 4" — on every move, and again
                // when the editor switches files, which restores a cursor
                // without announcing it as a move.
                const reportCursor = () => {
                  const model = editor.getModel();
                  const selection = editor.getSelection();
                  if (!selection) return;
                  useCursor.getState().set({
                    line: selection.positionLineNumber,
                    col: selection.positionColumn,
                    selected: model && !selection.isEmpty() ? model.getValueLengthInRange(selection) : 0,
                  });
                };
                editor.onDidChangeCursorSelection(reportCursor);
                editor.onDidChangeModel(() => requestAnimationFrame(reportCursor));
                setMonacoReady(true);
              }}
            />
          </div>
        )}

        {showingLive ? (
          // THE FILE, AS IT IS BEING WRITTEN.
          //
          // It sits over the editor rather than replacing it: the student's own
          // editor stays mounted underneath, with its undo history, and one
          // click on any tab goes back to it. Read-only, because typing into a
          // buffer that is about to be overwritten by the next token is typing
          // into nothing.
          <Editor
            path={`live://${livePath}`}
            language={languageForPath(livePath ?? "")}
            value={liveContent}
            theme={MONACO_THEME}
            beforeMount={beforeMount}
            loading={<EditorLoading />}
            options={{ ...options, readOnly: true, domReadOnly: true, wordWrap: "on", minimap: { enabled: false } }}
            onMount={(editor) => {
              // Follow the writing. Without this the view sits at line one
              // while the interesting part scrolls past below the fold.
              editor.onDidChangeModelContent(() => {
                editor.revealLine(editor.getModel()?.getLineCount() ?? 1);
              });
            }}
          />
        ) : activeFile && !textFile ? (
          // An asset is shown, not edited. Monaco given a data URL renders half
          // a megabyte of base64 on a single line and locks the tab laying it
          // out, and nothing about that tells the student what the file is.
          <AssetView node={activeFile} />
        ) : !activeFile ? (
          <EmptyEditor />
        ) : null}
      </div>
    </div>
  );
}

function EditorLoading() {
  return (
    <div className="flex h-full w-full flex-col gap-2.5 p-5" aria-label="Getting the editor ready">
      {[72, 54, 64, 38, 58, 46].map((w, i) => (
        <span key={i} className="skeleton h-3" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** What the editor says when nothing is open. Never "pick a file": three ways forward, each one a button. */
function EmptyEditor() {
  const actions = useFileActions();
  const project = useStudioStore((s) => s.project);
  const hasFiles = project ? listAllFiles(project).length > 0 : false;
  const mod = modKey();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <FileCodeIcon className="h-6 w-6" />
        </span>
        <p className="mt-4 text-[15px] font-[var(--weight-strong)] text-[var(--text)]">
          {hasFiles ? "No file open" : "This project is empty"}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-dim)]">
          {hasFiles
            ? "Open a file from your files, or jump straight to one by name."
            : "Make your first file, or tell Panda what you want and it will make them for you."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasFiles ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => emit(WORKSPACE_EVENTS.openPalette)}>
              <CommandIcon /> Open a file <Kbd className="ml-1">{mod} P</Kbd>
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void actions.create("file", "")}>
              <PlusFileIcon /> New file
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              useWorkspaceLayout.getState().reveal("chat");
              requestAnimationFrame(() => requestAnimationFrame(() => emit(WORKSPACE_EVENTS.focusComposer)));
            }}
          >
            <SparkleIcon /> Ask Panda
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The open files. Each tab says what kind of file it is, carries a dot while
 * it has edits the autosave has not written yet (the dot becomes the close
 * button under the pointer), and names its folder when two open files share a
 * name — eight tabs called index.html are otherwise eight guesses.
 */
function TabStrip({
  showingLive,
  onPickTab,
  onPickLive,
  onClose,
}: {
  showingLive: boolean;
  onPickTab: (path: string) => void;
  onPickLive: () => void;
  onClose: (path: string) => void;
}) {
  const tabs = useStudioStore((s) => s.tabs);
  const activeTab = useStudioStore((s) => s.activeTab);
  const livePath = useLiveWrite((s) => s.path);
  const stripRef = useRef<HTMLDivElement>(null);

  // The active tab scrolls into view, so opening the ninth file on a phone
  // does not leave its tab somewhere off to the right.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab, showingLive]);

  const names = new Map<string, number>();
  for (const t of tabs) names.set(fileName(t.path), (names.get(fileName(t.path)) ?? 0) + 1);

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Open files"
      className="scroll-x flex h-10 shrink-0 items-stretch border-b border-[var(--line)] bg-[var(--surface-0)]"
    >
      {livePath && (
        <button
          type="button"
          role="tab"
          aria-selected={showingLive}
          data-active={showingLive ? "true" : undefined}
          onClick={onPickLive}
          className={`flex shrink-0 items-center gap-2 border-r border-[var(--line)] px-3 text-[13px] ${
            showingLive
              ? "bg-[var(--surface-1)] text-[var(--text)] shadow-[inset_0_2px_0_var(--accent)]"
              : "text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
          }`}
        >
          <SparkleIcon className="h-3.5 w-3.5 text-[var(--accent-text)]" />
          <span className="max-w-[160px] truncate">Panda: {fileName(livePath)}</span>
          <span aria-hidden className="activity-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        </button>
      )}
      {tabs.map((tab) => {
        const name = fileName(tab.path);
        const active = !showingLive && activeTab === tab.path;
        const folder = parentPath(tab.path);
        return (
          <div
            key={tab.path}
            title={tab.path}
            data-active={active ? "true" : undefined}
            data-dirty={tab.dirty ? "true" : undefined}
            // Middle-click closes, the way it does in a browser and in VS Code.
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.path);
              }
            }}
            className={`ide-tab group flex shrink-0 items-center border-r border-[var(--line)] ${
              active
                ? "bg-[var(--surface-1)] shadow-[inset_0_2px_0_var(--accent)]"
                : "hover:bg-[var(--surface-2)]"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onPickTab(tab.path)}
              className={`tap flex h-full items-center gap-2 pl-3 pr-1.5 text-[13px] ${
                active ? "text-[var(--text)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"
              }`}
            >
              <FileTypeIcon path={tab.path} className="h-4 w-4" />
              <span className="max-w-[160px] truncate">{name}</span>
              {folder && (names.get(name) ?? 0) > 1 && (
                <span className="max-w-[90px] truncate text-[11px] text-[var(--text-faint)]">{folder}</span>
              )}
              {tab.dirty && <span className="sr-only">(not saved yet)</span>}
            </button>
            <button
              type="button"
              onClick={() => onClose(tab.path)}
              aria-label={`Close ${name}`}
              title={tab.dirty ? `${name} has changes that are still saving` : `Close ${name}`}
              className="ide-tab-close tap-sq tap-pad mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <span className="min-w-4 flex-1" />
    </div>
  );
}

/**
 * Where the file lives, and the handful of buttons a student actually reaches
 * for. Each folder in the trail opens the Files view at that folder; the file's
 * own name lists the files beside it, which is the quickest way to hop from
 * index.html to the stylesheet next to it.
 */
function EditorToolbar({
  path,
  isText,
  phone,
  wrap,
  onFind,
  onFormat,
  onWrap,
  onAsk,
}: {
  path: string;
  isText: boolean;
  phone: boolean;
  wrap: boolean;
  onFind: () => void;
  onFormat: () => void;
  onWrap: () => void;
  onAsk: () => void;
}) {
  const segments = path.split("/");
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--line)] bg-[var(--surface-1)] px-2">
      <nav aria-label="Where this file lives" className="scroll-x flex min-w-0 flex-1 items-center gap-0.5 text-[12.5px]">
        {segments.map((segment, index) => {
          const last = index === segments.length - 1;
          const segmentPath = segments.slice(0, index + 1).join("/");
          return (
            <span key={segmentPath} className="flex shrink-0 items-center gap-0.5">
              {index > 0 && <ChevronRightIcon aria-hidden className="h-3.5 w-3.5 text-[var(--text-faint)]" />}
              {last ? (
                <SiblingMenu path={path} />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    useWorkspaceLayout.getState().reveal("files");
                    requestAnimationFrame(() => emit(WORKSPACE_EVENTS.revealInTree, { path: segmentPath }));
                  }}
                  title={`Show ${segmentPath} in your files`}
                  className="tap inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                >
                  <FolderIcon className="h-3.5 w-3.5" />
                  {segment}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      {isText && (
        <div className="flex shrink-0 items-center">
          <ToolButton label={`Find in this file (${modKey()} F)`} onClick={onFind}>
            <SearchIcon />
          </ToolButton>
          {!phone && (
            <ToolButton label="Tidy up this file (Shift Alt F)" onClick={onFormat}>
              <WandIcon />
            </ToolButton>
          )}
          {!phone && (
            <ToolButton label={wrap ? "Stop wrapping long lines (Alt Z)" : "Wrap long lines (Alt Z)"} onClick={onWrap} pressed={wrap}>
              <WrapTextIcon />
            </ToolButton>
          )}
          <ToolButton label="Editor settings" onClick={() => emit(WORKSPACE_EVENTS.openSettings)}>
            <SlidersIcon />
          </ToolButton>
          <button
            type="button"
            onClick={onAsk}
            title={`Ask Panda about the selected code (${modKey()} Shift E)`}
            className="btn btn-ghost btn-sm ml-1 !h-7 !px-2 text-[var(--accent-text)] hover:!text-[var(--accent-text)]"
          >
            <SparkleIcon />
            <span className="hidden sm:inline">Ask Panda</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="icon-btn icon-btn-sm tap-sq tap-pad"
    >
      {children}
    </button>
  );
}

/** The last crumb: the file's name, which opens a list of the files beside it. */
function SiblingMenu({ path }: { path: string }) {
  const project = useStudioStore((s) => s.project);
  const openFile = useStudioStore((s) => s.openFile);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const siblings = useMemo(() => {
    if (!project) return [];
    const parent = parentPath(path);
    const folder = parent ? findByPath(project, parent) : undefined;
    const id = parent ? folder?.id : project.rootId;
    return id ? getChildren(project, id).filter((n) => n.kind === "file") : [];
  }, [project, path]);

  return (
    <span ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Files in this folder"
        className="tap inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-[var(--weight-ui)] text-[var(--text)] hover:bg-[var(--surface-2)]"
      >
        <FileTypeIcon path={path} className="h-3.5 w-3.5" />
        {fileName(path)}
      </button>
      {open && siblings.length > 0 && (
        <div role="menu" className="menu absolute left-0 top-full z-50 mt-1 max-h-72 w-60 overflow-y-auto">
          {siblings.map((node) => (
            <button
              key={node.id}
              type="button"
              role="menuitem"
              data-active={node.path === path ? true : undefined}
              onClick={() => {
                openFile(node.path);
                useLiveWrite.getState().setWatching(false);
                setOpen(false);
              }}
              className="menu-item"
            >
              <FileTypeIcon path={node.path} className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
