"use client";

import { useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { EditorArea } from "@/components/editor/EditorArea";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BottomPanel } from "@/components/preview/BottomPanel";
import { TopBar } from "@/components/layout/TopBar";

type MobileTab = "files" | "editor" | "chat" | "run";

export function StudioLayout() {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeTab);
  const [mobileTab, setMobileTab] = useState<MobileTab>("editor");

  if (!project) return null;

  return (
    <div className="flex flex-col h-screen bg-[var(--bg)] text-[var(--text)]">
      <TopBar />

      {/* Desktop / tablet layout */}
      <div className="hidden md:flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 border-r border-[var(--line)] bg-[var(--surface-0)]">
          <FileExplorer project={project} activePath={activeTab} />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-[3] min-h-0">
              <EditorArea />
            </div>
            <div className="flex-[2] min-h-0 border-t border-[var(--line)]">
              <BottomPanel />
            </div>
          </div>
        </div>

        <aside className="w-[26rem] shrink-0 border-l border-[var(--line)] bg-[var(--surface-0)]">
          <ChatPanel />
        </aside>
      </div>

      {/* Mobile layout: one panel at a time */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col">
        <div className="flex-1 min-h-0">
          {mobileTab === "files" && <FileExplorer project={project} activePath={activeTab} />}
          {mobileTab === "editor" && <EditorArea />}
          {mobileTab === "chat" && <ChatPanel />}
          {mobileTab === "run" && <BottomPanel />}
        </div>
        <nav className="shrink-0 grid grid-cols-4 border-t border-[var(--line)] bg-[var(--surface-0)]">
          {([
            ["files", "Files"],
            ["editor", "Editor"],
            ["chat", "Help"],
            ["run", "Run"],
          ] as [MobileTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`py-2.5 text-xs font-medium ${
                mobileTab === key ? "text-[var(--accent)] bg-[var(--surface-2)]" : "text-[var(--text-faint)]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
