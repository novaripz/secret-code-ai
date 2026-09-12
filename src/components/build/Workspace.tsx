"use client";

import { useEffect, useRef } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useVersionStore } from "@/store/useVersionStore";
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BottomPanel } from "@/components/preview/BottomPanel";
import { TopBar } from "@/components/layout/TopBar";
import { ChatIcon } from "@/components/icons";
import { Pane } from "./Pane";
import { ResizeHandle } from "./ResizeHandle";
import { CodeEditor } from "./CodeEditor";
import { VersionPanel } from "./VersionPanel";
import { CodeIcon, FilesIcon, HistoryIcon, MonitorIcon } from "./icons";
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

  if (!project) return null;

  const bothSidebarPanes = visible.files && visible.history;
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
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar column: Files above History. */}
        {(visible.files || visible.history) && (
          <>
            <div
              ref={sidebarRef}
              className="flex min-h-0 flex-col"
              style={{ width: layout.sidebarWidth, flex: "0 0 auto" }}
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
                  orientation="horizontal"
                  label="Resize the files list against your history"
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
                      ? { flex: `${1 - layout.filesRatio} 1 0`, minHeight: MIN_STACKED }
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
            </div>

            <ResizeHandle
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
              className="flex min-h-0 flex-col"
              style={{ width: layout.chatWidth, flex: "0 0 auto" }}
            >
              <Pane title="Panda" closeLabel="Close the chat with Panda" onClose={() => layout.close("chat")}>
                <div className="h-full min-h-0">
                  <ChatPanel />
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
                className={`rounded-lg p-2 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
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
            onClick={() => layout.reset()}
            aria-label="Reset the layout back to normal"
            title="Reset the layout back to normal"
            className="rounded-lg p-2 text-[var(--text-faint)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <CodeIcon className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}
