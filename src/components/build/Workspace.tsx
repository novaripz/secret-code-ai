"use client";

import "@/styles/ide.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushPendingSave, useStudioStore } from "@/store/useStudioStore";
import { useVersionStore } from "@/store/useVersionStore";
import { isDarkTheme, useProfileStore } from "@/store/useProfileStore";
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { BottomPanel } from "@/components/preview/BottomPanel";
import { TopBar } from "@/components/layout/TopBar";
import {
  CopyIcon,
  DiffIcon,
  DownloadIcon,
  DuplicateIcon,
  FilesIcon,
  HistoryIcon,
  KeyboardIcon,
  MonitorIcon,
  MoonIcon,
  PencilIcon,
  PlayIcon,
  PlusFileIcon,
  PlusFolderIcon,
  ReplaceIcon,
  ResetIcon,
  SearchIcon,
  SlidersIcon,
  SmartphoneIcon,
  SparkleIcon,
  TabletIcon,
  TrashIcon,
  UndoIcon,
  WandIcon,
  WrapTextIcon,
  XIcon,
  ZapIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/icons";
import { exportProjectToZip } from "@/lib/zip";
import { safeFileName, saveBlob } from "./download";
import { ResizeHandle } from "./ResizeHandle";
import { CodeEditor } from "./CodeEditor";
import { AgentPanel } from "./AgentPanel";
import { CommandPalette, type Command, type PaletteMode } from "./CommandPalette";
import { VersionPanel } from "./VersionPanel";
import { ChangesPanel } from "./ChangesPanel";
import { SearchPanel, useSearchState } from "./SearchPanel";
import { ActivityRail, PhoneNav } from "./ActivityRail";
import { StatusBar } from "./StatusBar";
import { EditorSettingsSheet, ShortcutsSheet } from "./WorkspaceSheets";
import { useFileActions } from "./useFileActions";
import { ASK_EVENT, prefillComposer, type AskDetail } from "./askPanda";
import { FONT_SIZES, useEditorSettings } from "./useEditorSettings";
import { WORKSPACE_EVENTS, emit, isTyping, modKey } from "./events";
import {
  MAX_CHANGES,
  MAX_CHAT,
  MAX_SIDEBAR,
  MIN_CENTER,
  MIN_CHANGES,
  MIN_CHAT,
  MIN_SIDEBAR,
  MIN_STACKED,
  clamp,
  fitColumns,
  useWorkspaceLayout,
} from "./useWorkspaceLayout";

// The workspace itself: the panes the student arranges, the rail that brings
// any of them back, and the wiring between them. Everything that remembers a
// size or an open/closed state lives in useWorkspaceLayout; everything that
// remembers code lives in the studio and version stores.

const PHONE_QUERY = "(max-width: 767px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Phone or not, live. The workspace only ever renders in the browser, so there is no server answer to disagree with. */
function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

const RAIL_WIDTH = 48;
const HANDLE_WIDTH = 6;

export function Workspace() {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeTab);
  const lastDeleted = useStudioStore((s) => s.lastDeleted);
  const tabCount = useStudioStore((s) => s.tabs.length);
  const fileActions = useFileActions();
  const phone = useIsPhone();

  const layout = useWorkspaceLayout();
  const { visible, side } = layout;

  const noteChange = useVersionStore((s) => s.noteChange);
  const projectId = project?.id ?? null;
  // Read so the palette's labels say what each toggle will DO ("Wrap long
  // lines" or "Stop wrapping"), not what it did last time.
  const autoRun = useEditorSettings((s) => s.autoRun);
  const wordWrap = useEditorSettings((s) => s.wordWrap);
  const minimap = useEditorSettings((s) => s.minimap);
  const fontSize = useEditorSettings((s) => s.fontSize);
  const dark = useProfileStore((s) => isDarkTheme(s.theme));

  const [palette, setPalette] = useState<false | PaletteMode>(false);
  const [sheet, setSheet] = useState<null | "shortcuts" | "settings">(null);
  const [rowWidth, setRowWidth] = useState(0);

  const rowRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  // Where a drag began. Read on every move, so a ref rather than state.
  const start = useRef(0);

  // A project opened: its history is loaded, and the moment it was opened is
  // remembered so Changes can say what has happened since.
  useEffect(() => {
    if (!projectId) return;
    void useVersionStore.getState().load(projectId);
    const opened = useStudioStore.getState().project;
    if (opened) useVersionStore.getState().beginSession(opened);
  }, [projectId]);

  // Every change to the project is offered to the history; the store decides
  // which ones are worth a snapshot and when the typing has gone quiet.
  useEffect(() => {
    if (!project) return;
    noteChange(project);
  }, [project, noteChange]);

  // SAVE ON THE WAY OUT
  //
  // The autosave waits 800ms after the last keystroke, and a student who types
  // and then closes the tab inside that window lost those keystrokes — the
  // timer died with the page. The pending write is now made the moment the
  // page is hidden or closed, and if it is still running as the tab closes the
  // browser is asked to hold on.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }
    function onPageHide() {
      flushPendingSave();
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (flushPendingSave()) e.preventDefault();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Leaving for the project list writes too.
      flushPendingSave();
    };
  }, []);

  // The row's width, so the side columns can give way to the editor.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [phone]);

  const openSearch = useCallback((query?: string) => {
    useSearchState.getState().focusRequest(query);
    useWorkspaceLayout.getState().reveal("search");
  }, []);

  const askToBuild = useCallback(() => {
    useWorkspaceLayout.getState().reveal("chat");
    // Two frames: one for the pane to show, one for the composer inside it to
    // be focusable. A single frame was not enough when the chat was closed.
    requestAnimationFrame(() => requestAnimationFrame(() => emit(WORKSPACE_EVENTS.focusComposer)));
  }, []);

  // KEYS THAT WORK ANYWHERE IN THE WORKSPACE.
  //
  // Inside Monaco the editor handles its own (see CodeEditor), and stops them
  // here. Everywhere else — the tree, the preview's buttons, the composer —
  // these are the same keys, so a shortcut never depends on where the focus
  // happened to be. Ctrl/Cmd-S in particular used to open the browser's own
  // "save this web page" dialog anywhere outside the editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey && !e.shiftKey && (key === "k" || key === "p")) {
        e.preventDefault();
        setPalette((open) => (open ? false : "all"));
      } else if (mod && e.shiftKey && key === "p") {
        e.preventDefault();
        setPalette("commands");
      } else if (mod && !e.shiftKey && key === "s") {
        e.preventDefault();
        void useStudioStore.getState().persist();
      } else if (mod && e.shiftKey && key === "f") {
        e.preventDefault();
        openSearch(window.getSelection()?.toString());
      } else if (mod && !e.shiftKey && key === "b" && !isTyping(e.target)) {
        e.preventDefault();
        const l = useWorkspaceLayout.getState();
        if (l.side) l.closeSide();
        else l.showSide("files");
      } else if (mod && key === "enter") {
        e.preventDefault();
        emit(WORKSPACE_EVENTS.runPreview);
      } else if (mod && key === ",") {
        e.preventDefault();
        setSheet("settings");
      } else if (e.key === "?" && !mod && !isTyping(e.target)) {
        e.preventDefault();
        setSheet("shortcuts");
      }
    }
    function onOpenPalette(e: Event) {
      const mode = (e as CustomEvent<{ mode?: PaletteMode }>).detail?.mode;
      setPalette(mode ?? "all");
    }
    function onSettings() {
      setSheet("settings");
    }
    function onShortcuts() {
      setSheet("shortcuts");
    }
    function onFind(e: Event) {
      openSearch((e as CustomEvent<{ query?: string }>).detail?.query);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(WORKSPACE_EVENTS.openPalette, onOpenPalette);
    window.addEventListener(WORKSPACE_EVENTS.openSettings, onSettings);
    window.addEventListener(WORKSPACE_EVENTS.openShortcuts, onShortcuts);
    window.addEventListener(WORKSPACE_EVENTS.findInFiles, onFind);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(WORKSPACE_EVENTS.openPalette, onOpenPalette);
      window.removeEventListener(WORKSPACE_EVENTS.openSettings, onSettings);
      window.removeEventListener(WORKSPACE_EVENTS.openShortcuts, onShortcuts);
      window.removeEventListener(WORKSPACE_EVENTS.findInFiles, onFind);
    };
  }, [openSearch]);

  // "Ask Panda about this" lands here: the chat is brought into view first,
  // because the composer cannot be filled in while it is hidden, and the fill
  // waits two frames for it to be shown.
  useEffect(() => {
    function onAsk(e: Event) {
      const prompt = (e as CustomEvent<AskDetail>).detail?.prompt;
      if (!prompt) return;
      useWorkspaceLayout.getState().reveal("chat");
      requestAnimationFrame(() => requestAnimationFrame(() => prefillComposer(prompt)));
    }
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const mod = modKey();
    const short = (path: string) => path.split("/").pop() ?? path;
    const editorAction = (commandId: string) => emit(WORKSPACE_EVENTS.editorAction, { commandId });
    const settings = useEditorSettings.getState();
    const l = useWorkspaceLayout.getState();
    const list: Command[] = [
      { id: "action:ask", label: "Ask Panda to build something", icon: <SparkleIcon />, group: "Actions", run: askToBuild },
      { id: "action:run", label: "Run the preview", icon: <PlayIcon />, keys: `${mod} Enter`, group: "Actions", run: () => { l.reveal("preview"); emit(WORKSPACE_EVENTS.runPreview); } },
      { id: "action:find", label: "Find in all files", icon: <SearchIcon />, keys: `${mod} Shift F`, group: "Actions", run: () => openSearch() },
      { id: "action:replace", label: "Find and replace in all files", icon: <ReplaceIcon />, group: "Actions", run: () => { useSearchState.getState().set({ showReplace: true }); openSearch(); } },
      { id: "file:new", label: "New file…", icon: <PlusFileIcon />, group: "Actions", run: () => void fileActions.create("file", "") },
      { id: "file:newFolder", label: "New folder…", icon: <PlusFolderIcon />, group: "Actions", run: () => void fileActions.create("folder", "") },
      { id: "panel:files", label: "Show Files", icon: <FilesIcon />, group: "Actions", run: () => l.reveal("files") },
      { id: "panel:history", label: "Show History", icon: <HistoryIcon />, group: "Actions", run: () => l.reveal("history") },
      { id: "panel:changes", label: "Show Changes", icon: <DiffIcon />, group: "Actions", run: () => l.reveal("changes") },
      { id: "panel:preview", label: "Show the preview", icon: <MonitorIcon />, group: "Actions", run: () => l.reveal("preview") },
      { id: "panel:console", label: "Show the console", icon: <MonitorIcon />, group: "Actions", run: () => { l.reveal("preview"); requestAnimationFrame(() => emit(WORKSPACE_EVENTS.showPreviewTab, { tab: "console" })); } },
      { id: "panel:problems", label: "Show problems", icon: <MonitorIcon />, group: "Actions", run: () => { l.reveal("preview"); requestAnimationFrame(() => emit(WORKSPACE_EVENTS.showPreviewTab, { tab: "problems" })); } },
      { id: "preview:auto", label: autoRun ? "Stop running while I type" : "Run while I type", icon: <ZapIcon />, group: "Actions", run: () => settings.update({ autoRun: !autoRun }) },
      { id: "preview:phone", label: "Preview at phone size", icon: <SmartphoneIcon />, group: "Actions", run: () => { settings.update({ device: "phone" }); l.reveal("preview"); } },
      { id: "preview:tablet", label: "Preview at tablet size", icon: <TabletIcon />, group: "Actions", run: () => { settings.update({ device: "tablet" }); l.reveal("preview"); } },
      { id: "preview:desktop", label: "Preview at full width", icon: <MonitorIcon />, group: "Actions", run: () => { settings.update({ device: "desktop" }); l.reveal("preview"); } },
      { id: "editor:settings", label: "Editor settings", icon: <SlidersIcon />, keys: `${mod} ,`, group: "Actions", run: () => setSheet("settings") },
      { id: "editor:wrap", label: wordWrap ? "Stop wrapping long lines" : "Wrap long lines", icon: <WrapTextIcon />, keys: "Alt Z", group: "Actions", run: () => settings.update({ wordWrap: !wordWrap }) },
      { id: "editor:minimap", label: minimap ? "Hide the minimap" : "Show the minimap", icon: <SlidersIcon />, group: "Actions", run: () => settings.update({ minimap: !minimap }) },
      { id: "editor:bigger", label: "Make the code text bigger", icon: <ZoomInIcon />, group: "Actions", run: () => settings.update({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(fontSize as (typeof FONT_SIZES)[number]) + 1)] }) },
      { id: "editor:smaller", label: "Make the code text smaller", icon: <ZoomOutIcon />, group: "Actions", run: () => settings.update({ fontSize: FONT_SIZES[Math.max(0, FONT_SIZES.indexOf(fontSize as (typeof FONT_SIZES)[number]) - 1)] }) },
      { id: "help:shortcuts", label: "Keyboard shortcuts", icon: <KeyboardIcon />, keys: "?", group: "Actions", run: () => setSheet("shortcuts") },
      { id: "app:theme", label: dark ? "Switch to the light theme" : "Switch to the dark theme", icon: <MoonIcon />, group: "Actions", run: () => useProfileStore.getState().toggleTheme() },
      { id: "layout:reset", label: "Reset the layout", icon: <ResetIcon />, group: "Actions", run: () => l.reset() },
      {
        id: "project:download",
        label: "Download the project as a .zip",
        icon: <DownloadIcon />,
        group: "Actions",
        run: () => {
          const current = useStudioStore.getState().project;
          if (current) void exportProjectToZip(current).then((blob) => saveBlob(blob, `${safeFileName(current.name)}.zip`));
        },
      },
    ];

    // FILE ACTIONS, WITHOUT A POINTER.
    //
    // Every one of these is also in the tree's right-click menu. They are here
    // because the palette is the route that needs no mouse and no long press:
    // a menu may be the nicest way to reach an action, never the only one.
    // They name the current file, so the student can see which one they are
    // about to delete before they press Enter.
    if (activeTab) {
      list.push(
        { id: "file:rename", label: `Rename ${short(activeTab)}…`, icon: <PencilIcon />, group: "Actions", run: () => void fileActions.rename(activeTab) },
        { id: "file:duplicate", label: `Duplicate ${short(activeTab)}`, icon: <DuplicateIcon />, group: "Actions", run: () => void fileActions.duplicate(activeTab) },
        { id: "file:delete", label: `Delete ${short(activeTab)}`, icon: <TrashIcon />, group: "Actions", run: () => void fileActions.remove(activeTab) },
        { id: "file:copyPath", label: `Copy the path of ${short(activeTab)}`, icon: <CopyIcon />, group: "Actions", run: () => void fileActions.copyPath(activeTab) },
        { id: "file:download", label: `Download ${short(activeTab)}`, icon: <DownloadIcon />, group: "Actions", run: () => void fileActions.download(activeTab) },
        { id: "file:reveal", label: `Show ${short(activeTab)} in Files`, icon: <FilesIcon />, group: "Actions", run: () => { l.reveal("files"); requestAnimationFrame(() => emit(WORKSPACE_EVENTS.revealInTree, { path: activeTab })); } },
        { id: "editor:find", label: "Find in this file", icon: <SearchIcon />, keys: `${mod} F`, group: "Actions", run: () => editorAction("actions.find") },
        { id: "editor:replace", label: "Find and replace in this file", icon: <ReplaceIcon />, keys: `${mod} H`, group: "Actions", run: () => editorAction("editor.action.startFindReplaceAction") },
        { id: "editor:goToLine", label: "Go to line…", icon: <SearchIcon />, keys: `${mod} G`, group: "Actions", run: () => editorAction("editor.action.gotoLine") },
        { id: "editor:format", label: "Tidy up this file", icon: <WandIcon />, keys: "Shift Alt F", group: "Actions", run: () => editorAction("editor.action.formatDocument") },
        { id: "editor:explain", label: "Ask Panda about this code", icon: <SparkleIcon />, keys: `${mod} Shift E`, group: "Actions", run: () => emit(WORKSPACE_EVENTS.askSelection, { kind: "explain" }) },
        { id: "editor:fix", label: "Ask Panda to fix this code", icon: <SparkleIcon />, keys: `${mod} Shift X`, group: "Actions", run: () => emit(WORKSPACE_EVENTS.askSelection, { kind: "fix" }) },
      );
      if (tabCount > 1) {
        list.push({ id: "tabs:closeOthers", label: "Close the other tabs", icon: <XIcon />, group: "Actions", run: () => useStudioStore.getState().closeOtherTabs(activeTab) });
      }
    }
    if (lastDeleted) {
      list.unshift({ id: "file:undoDelete", label: `Undo deleting ${short(lastDeleted.path)}`, icon: <UndoIcon />, group: "Actions", run: () => fileActions.undoDelete() });
    }
    return list;
  }, [fileActions, activeTab, lastDeleted, tabCount, askToBuild, openSearch, autoRun, wordWrap, minimap, fontSize, dark]);

  if (!project) return null;

  const closePalette = () => setPalette(false);
  const sheets = (
    <>
      <CommandPalette open={palette !== false} mode={palette || "all"} onClose={closePalette} actions={commands} />
      <ShortcutsSheet open={sheet === "shortcuts"} onClose={() => setSheet(null)} />
      <EditorSettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} />
    </>
  );

  // ---- PHONE: one pane at a time --------------------------------------------
  if (phone) {
    const pane = layout.phonePane;
    return (
      <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
        <TopBar />
        <div className="relative min-h-0 flex-1">
          {pane === "files" && <FileExplorer project={project} activePath={activeTab} />}
          {pane === "search" && <SearchPanel />}
          {pane === "history" && <VersionPanel />}
          {pane === "changes" && <ChangesPanel />}
          {pane === "preview" && <BottomPanel />}
          {/* The editor and Panda stay mounted while hidden: the editor keeps
              every file's undo history, and Panda keeps a turn running while
              the student looks at their code. */}
          <div className={pane === "editor" ? "h-full" : "hidden"}>
            <CodeEditor phone />
          </div>
          <div className={pane === "chat" ? "h-full" : "hidden"}>
            <AgentPanel />
          </div>
        </div>
        <PhoneNav />
        {sheets}
      </div>
    );
  }

  // ---- DESKTOP ---------------------------------------------------------------
  // Side columns give way before the editor is squeezed below MIN_CENTER.
  const columns: { key: "side" | "changes" | "chat"; width: number; min: number }[] = [];
  if (side) columns.push({ key: "side", width: layout.sidebarWidth, min: MIN_SIDEBAR });
  if (visible.changes) columns.push({ key: "changes", width: layout.changesWidth, min: MIN_CHANGES });
  if (visible.chat) columns.push({ key: "chat", width: layout.chatWidth, min: MIN_CHAT });
  const available = rowWidth - RAIL_WIDTH - columns.length * HANDLE_WIDTH;
  const fitted = rowWidth > 0 ? fitColumns(available, columns) : columns.map((c) => c.width);
  const widthOf = (key: "side" | "changes" | "chat") => fitted[columns.findIndex((c) => c.key === key)] ?? 0;
  /** The widest a column may be dragged while the editor keeps its floor. */
  const maxFor = (key: "side" | "changes" | "chat", cap: number) => {
    const others = columns.filter((c) => c.key !== key).reduce((sum, c) => sum + widthOf(c.key), 0);
    return rowWidth > 0 ? Math.max(0, Math.min(cap, available - others - MIN_CENTER)) : cap;
  };

  function centerHeight() {
    return centerRef.current?.getBoundingClientRect().height ?? 0;
  }
  function setEditor(ratio: number) {
    const total = centerHeight();
    const min = total > MIN_STACKED * 2 ? MIN_STACKED / total : 0.15;
    layout.setEditorRatio(clamp(ratio, min, 1 - min));
  }

  const sideView =
    side === "files" ? (
      <FileExplorer project={project} activePath={activeTab} onClose={layout.closeSide} />
    ) : side === "search" ? (
      <SearchPanel onClose={layout.closeSide} />
    ) : side === "history" ? (
      <VersionPanel onClose={layout.closeSide} />
    ) : null;

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <TopBar />
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <ActivityRail onShortcuts={() => setSheet("shortcuts")} onSettings={() => setSheet("settings")} />

        {sideView && (
          <>
            <aside className="flex min-h-0 shrink-0 flex-col" style={{ width: widthOf("side") }}>
              {sideView}
            </aside>
            <ResizeHandle
              orientation="vertical"
              label="Resize the side bar"
              value={layout.sidebarWidth}
              min={MIN_SIDEBAR}
              max={MAX_SIDEBAR}
              onDragStart={() => {
                start.current = widthOf("side");
              }}
              onDrag={(delta) => layout.setSidebarWidth(Math.min(start.current + delta, maxFor("side", MAX_SIDEBAR)))}
              onNudge={(step) => layout.setSidebarWidth(Math.min(widthOf("side") + step, maxFor("side", MAX_SIDEBAR)))}
            />
          </>
        )}

        {/* Centre column: the editor, and the preview under it. */}
        <main ref={centerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={visible.preview ? { flex: `${layout.editorRatio} 1 0`, minHeight: MIN_STACKED } : { flex: "1 1 0" }}
          >
            <CodeEditor />
          </div>
          {visible.preview && (
            <>
              <ResizeHandle
                orientation="horizontal"
                label="Resize the editor against the preview"
                value={Math.round(layout.editorRatio * 100)}
                min={15}
                max={85}
                onDragStart={() => {
                  start.current = layout.editorRatio * centerHeight();
                }}
                onDrag={(delta) => {
                  const total = centerHeight();
                  if (total > 0) setEditor((start.current + delta) / total);
                }}
                onNudge={(step) => {
                  const total = centerHeight();
                  if (total > 0) setEditor((layout.editorRatio * total + step) / total);
                }}
              />
              <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${1 - layout.editorRatio} 1 0`, minHeight: MIN_STACKED }}>
                <BottomPanel onClose={() => layout.close("preview")} />
              </div>
            </>
          )}
        </main>

        {/* CHANGES: its own column, right of the editor, because you read it
            AGAINST the editor — glance from the file to what changed in it
            without crossing the whole window. */}
        {visible.changes && (
          <>
            <ResizeHandle
              orientation="vertical"
              label="Resize the changes column"
              value={layout.changesWidth}
              min={MIN_CHANGES}
              max={MAX_CHANGES}
              onDragStart={() => {
                start.current = widthOf("changes");
              }}
              // Right of the centre, so dragging left makes it wider.
              onDrag={(delta) => layout.setChangesWidth(Math.min(start.current - delta, maxFor("changes", MAX_CHANGES)))}
              onNudge={(step) => layout.setChangesWidth(Math.min(widthOf("changes") - step, maxFor("changes", MAX_CHANGES)))}
            />
            <aside className="flex min-h-0 shrink-0 flex-col" style={{ width: widthOf("changes") }}>
              <ChangesPanel onClose={() => layout.close("changes")} />
            </aside>
          </>
        )}

        {/* Panda. Hidden rather than removed when closed, so a turn that is
            running keeps running and the half-typed message stays put. */}
        {visible.chat && (
          <ResizeHandle
            orientation="vertical"
            label="Resize the chat"
            value={layout.chatWidth}
            min={MIN_CHAT}
            max={MAX_CHAT}
            onDragStart={() => {
              start.current = widthOf("chat");
            }}
            onDrag={(delta) => layout.setChatWidth(Math.min(start.current - delta, maxFor("chat", MAX_CHAT)))}
            onNudge={(step) => layout.setChatWidth(Math.min(widthOf("chat") - step, maxFor("chat", MAX_CHAT)))}
          />
        )}
        <aside
          className={visible.chat ? "flex min-h-0 shrink-0 flex-col" : "hidden"}
          style={{ width: visible.chat ? widthOf("chat") : undefined }}
        >
          <AgentPanel onClose={() => layout.close("chat")} />
        </aside>
      </div>
      <StatusBar />
      {sheets}
    </div>
  );
}
