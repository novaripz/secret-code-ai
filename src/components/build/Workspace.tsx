"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useVersionStore } from "@/store/useVersionStore";
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { BottomPanel } from "@/components/preview/BottomPanel";
import { TopBar } from "@/components/layout/TopBar";
import { ChatIcon } from "@/components/icons";
import { Pane } from "./Pane";
import { ResizeHandle } from "./ResizeHandle";
import { CodeEditor } from "./CodeEditor";
import { AgentPanel } from "./AgentPanel";
import { CommandPalette, type Command } from "./CommandPalette";
import { VersionPanel } from "./VersionPanel";
import { ChangesPanel } from "./ChangesPanel";
import { CodeIcon, CommandIcon, DiffIcon, FilesIcon, HistoryIcon, MonitorIcon } from "./icons";
import {
  clamp,
  MAX_CHAT,
  MAX_SIDEBAR,
  MIN_CHAT,
  MIN_SIDEBAR,
  MIN_STACKED,
  type PanelKey,
  useWorkspaceLayout,
} from "./useWorkspaceLayout";

// The workspace itself: four panes the student arranges, plus a rail that can
// bring any of them back. Everything that remembers a size or an open/closed
// state lives in useWorkspaceLayout; everything that remembers code lives in
// the studio and version stores. This file is only the wiring between them.

const RAIL: { key: PanelKey; label: string; Icon: typeof FilesIcon }[] = [
  { key: "files", label: "Files", Icon: FilesIcon },
  { key: "history", label: "History", Icon: HistoryIcon },
  { key: "changes", label: "Changes", Icon: DiffIcon },
  { key: "preview", label: "Preview", Icon: MonitorIcon },
  { key: "chat", label: "Panda chat", Icon: ChatIcon },
];

export function Workspace() {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeTab);

  const layout = useWorkspaceLayout();
  const { visible } = layout;

  const noteChange = useVersionStore((s) => s.noteChange);
  const loadVersions = useVersionStore((s) => s.load);
  const projectId = project?.id ?? null;

  // Columns whose splits are fractions need to know how many pixels the column
  // actually has before a drag can mean anything.
  const sidebarRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  // Where a drag began. Read on every move, so a ref rather than state.
  const start = useRef(0);

  useEffect(() => {
    if (!projectId) return;
    void loadVersions(projectId);
  }, [projectId, loadVersions]);

  // Every change to the project is offered to the history; the store decides
  // which ones are worth a snapshot and when the typing has gone quiet.
  useEffect(() => {
    if (!project) return;
    noteChange(project);
  }, [project, noteChange]);

  // The command affordance. Ctrl/Cmd-K is the shortcut every tool this wants to
  // resemble already uses, so it costs a student nothing to learn here and
  // carries over when they meet the real thing.
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const show = useCallback((key: PanelKey) => layout.open(key), [layout]);

  const commands = useMemo<Command[]>(
    () => [
      ...RAIL.map(({ key, label }) => ({
        id: `panel:${key}`,
        label: `Show ${label}`,
        hint: "panel",
        run: () => show(key),
      })),
      {
        id: "action:ask",
        label: "Ask Panda to build something",
        hint: "agent",
        run: () => {
          show("chat");
          // The panel owns its own composer, so it is asked rather than told.
          window.dispatchEvent(new CustomEvent("panda:focus-composer"));
        },
      },
      { id: "action:reset", label: "Reset the layout", hint: "layout", run: () => layout.reset() },
    ],
    [layout, show],
  );

  if (!project) return null;

  // Files keeps its dragged share whenever it is sharing the column; History
  // and Changes split what is left between them. Three stacked splitters in a
  // 232px column would be three things to get wrong for no gain, so only the
  // Files split is draggable and the rest is even.
  const stackedBelowFiles = Number(visible.history) + Number(visible.changes);
  const bothSidebarPanes = visible.files && stackedBelowFiles > 0;
  const belowShare = stackedBelowFiles > 0 ? (1 - layout.filesRatio) / stackedBelowFiles : 0;
  const bothCenterPanes = visible.preview;

  function sidebarHeight() {
    return sidebarRef.current?.getBoundingClientRect().height ?? 0;
  }
  function centerHeight() {
    return centerRef.current?.getBoundingClientRect().height ?? 0;
  }

  function ratioLimits(total: number) {
    if (total <= MIN_STACKED * 2) return { min: 0.15, max: 0.85 };
    return { min: MIN_STACKED / total, max: 1 - MIN_STACKED / total };
  }

  function setFiles(ratio: number) {
    const { min, max } = ratioLimits(sidebarHeight());
    layout.setFilesRatio(clamp(ratio, min, max));
  }
  function setEditor(ratio: number) {
    const { min, max } = ratioLimits(centerHeight());
    layout.setEditorRatio(clamp(ratio, min, max));
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <TopBar />

      {/* `relative` is what makes the phone layout below possible: the side
          panes become absolutely-positioned overlays inside this box rather
          than columns competing for a 360px row. */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar column: Files above History and Changes. */}
        {(visible.files || visible.history || visible.changes) && (
          <>
            {/* PHONE: one pane at a time.
                On a laptop this is a column in a row of columns, and the
                dragged width is what the student set. On a phone, three
                columns plus two splitters inside 360px gave every pane about
                a hundred usable pixels — which is how the old single-panel
                phone layout got lost. Below `md` this becomes a full-screen
                overlay over the editor instead, driven by exactly the same
                visibility toggles: open it to use it, close it to get back.
                The width lives in a custom property so the class can override
                it below `md`; an inline `width` would win over any class. */}
            <div
              ref={sidebarRef}
              className="absolute inset-0 z-30 flex min-h-0 w-full flex-col bg-[var(--bg)] md:static md:z-auto md:w-[var(--pane-w)] md:bg-transparent"
              style={{ "--pane-w": `${layout.sidebarWidth}px`, flex: "0 0 auto" } as React.CSSProperties}
            >
              {visible.files && (
                <div
                  className="flex min-h-0 flex-col"
                  style={
                    bothSidebarPanes
                      ? { flex: `${layout.filesRatio} 1 0`, minHeight: MIN_STACKED }
                      : { flex: "1 1 0" }
                  }
                >
                  <Pane title="Files" closeLabel="Close the files list" onClose={() => layout.close("files")}>
                    <div className="h-full overflow-y-auto">
                      <FileExplorer project={project} activePath={activeTab} />
                    </div>
                  </Pane>
                </div>
              )}

              {bothSidebarPanes && (
                <ResizeHandle
                  className="hidden md:block"
                  orientation="horizontal"
                  label="Resize the files list against what is below it"
                  value={Math.round(layout.filesRatio * 100)}
                  min={15}
                  max={85}
                  onDragStart={() => {
                    start.current = layout.filesRatio * sidebarHeight();
                  }}
                  onDrag={(delta) => {
                    const total = sidebarHeight();
                    if (total > 0) setFiles((start.current + delta) / total);
                  }}
                  onNudge={(step) => {
                    const total = sidebarHeight();
                    if (total > 0) setFiles((layout.filesRatio * total + step) / total);
                  }}
                />
              )}

              {visible.history && (
                <div
                  className="flex min-h-0 flex-col"
                  style={
                    bothSidebarPanes
                      ? { flex: `${belowShare} 1 0`, minHeight: MIN_STACKED }
                      : { flex: "1 1 0" }
                  }
                >
                  <Pane
                    title="History"
                    closeLabel="Close your version history"
                    onClose={() => layout.close("history")}
                  >
                    <div className="h-full min-h-0">
                      <VersionPanel />
                    </div>
                  </Pane>
                </div>
              )}

              {visible.changes && (
                <div
                  className="flex min-h-0 flex-col"
                  style={
                    bothSidebarPanes
                      ? { flex: `${belowShare} 1 0`, minHeight: MIN_STACKED }
                      : { flex: "1 1 0" }
                  }
                >
                  <Pane
                    title="Changes"
                    closeLabel="Close the list of changes"
                    onClose={() => layout.close("changes")}
                  >
                    <div className="h-full min-h-0">
                      <ChangesPanel />
                    </div>
                  </Pane>
                </div>
              )}
            </div>

            <ResizeHandle
              className="hidden md:block"
              orientation="vertical"
              label="Resize the files column"
              value={layout.sidebarWidth}
              min={MIN_SIDEBAR}
              max={MAX_SIDEBAR}
              onDragStart={() => {
                start.current = layout.sidebarWidth;
              }}
              onDrag={(delta) => layout.setSidebarWidth(start.current + delta)}
              onNudge={(step) => layout.setSidebarWidth(layout.sidebarWidth + step)}
            />
          </>
        )}

        {/* Centre column: the editor, and the preview under it. */}
        <div ref={centerRef} className="flex min-w-0 min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={
              bothCenterPanes
                ? { flex: `${layout.editorRatio} 1 0`, minHeight: MIN_STACKED }
                : { flex: "1 1 0" }
            }
          >
            <CodeEditor />
          </div>

          {bothCenterPanes && (
            <>
              <ResizeHandle
                className="hidden md:block"
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
              <div
                className="flex min-h-0 min-w-0 flex-col"
                style={{ flex: `${1 - layout.editorRatio} 1 0`, minHeight: MIN_STACKED }}
              >
                <Pane
                  title="Preview"
                  closeLabel="Close the preview"
                  onClose={() => layout.close("preview")}
                >
                  <div className="h-full min-h-0">
                    <BottomPanel />
                  </div>
                </Pane>
              </div>
            </>
          )}
        </div>

        {/* Panda's chat. Closable like anything else. */}
        {visible.chat && (
          <>
            <ResizeHandle
              className="hidden md:block"
              orientation="vertical"
              label="Resize the chat"
              value={layout.chatWidth}
              min={MIN_CHAT}
              max={MAX_CHAT}
              onDragStart={() => {
                start.current = layout.chatWidth;
              }}
              // The chat is on the right, so dragging left makes it wider.
              onDrag={(delta) => layout.setChatWidth(start.current - delta)}
              onNudge={(step) => layout.setChatWidth(layout.chatWidth - step)}
            />
            <div
              className="absolute inset-0 z-30 flex min-h-0 w-full flex-col bg-[var(--bg)] md:static md:z-auto md:w-[var(--pane-w)] md:bg-transparent"
              style={{ "--pane-w": `${layout.chatWidth}px`, flex: "0 0 auto" } as React.CSSProperties}
            >
              <Pane title="Agent" closeLabel="Close the chat with Panda" onClose={() => layout.close("chat")}>
                <div className="h-full min-h-0">
                  <AgentPanel />
                </div>
              </Pane>
            </div>
          </>
        )}

        {/* The way back. Anything closed is one click from returning, and the
            rail never closes, so nothing can be lost behind a closed pane. */}
        <nav
          aria-label="Show or hide panels"
          className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-[var(--line)] bg-[var(--surface-0)] py-2"
        >
          {RAIL.map(({ key, label, Icon }) => {
            const open = visible[key];
            return (
              <button
                key={key}
                onClick={() => layout.toggle(key)}
                aria-pressed={open}
                aria-label={open ? `Hide ${label}` : `Show ${label}`}
                title={open ? `Hide ${label}` : `Show ${label}`}
                className={`tap-sq inline-flex items-center justify-center rounded-lg p-2 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                  open
                    ? "bg-[var(--surface-2)] text-[var(--text)]"
                    : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}

          <span aria-hidden className="my-1 h-px w-5 bg-[var(--line)]" />

          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="Find a file or run a command"
            title="Find a file or run a command (Ctrl K)"
            className="tap-sq inline-flex items-center justify-center rounded-lg p-2 text-[var(--text-faint)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <CommandIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() => layout.reset()}
            aria-label="Reset the layout back to normal"
            title="Reset the layout back to normal"
            className="tap-sq inline-flex items-center justify-center rounded-lg p-2 text-[var(--text-faint)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <CodeIcon className="h-4 w-4" />
          </button>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={commands} />
    </div>
  );
}
