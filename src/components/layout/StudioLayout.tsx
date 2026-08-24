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
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200">
      <TopBar />

      {/* Desktop / tablet layout */}
      <div className="hidden md:flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 border-r border-white/5 bg-zinc-950">
          <FileExplorer project={project} activePath={activeTab} />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-[3] min-h-0">
              <EditorArea />
            </div>
            <div className="flex-[2] min-h-0 border-t border-white/5">
              <BottomPanel />
            </div>
          </div>
        </div>

        <aside className="w-[26rem] shrink-0 border-l border-white/5 bg-zinc-950">
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
        <nav className="shrink-0 grid grid-cols-4 border-t border-white/5 bg-zinc-950">
          {([
            ["files", "Files"],
            ["editor", "Editor"],
            ["chat", "AI"],
            ["run", "Preview"],
          ] as [MobileTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`py-2.5 text-xs font-medium ${
                mobileTab === key ? "text-sky-400 bg-white/5" : "text-zinc-500"
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
