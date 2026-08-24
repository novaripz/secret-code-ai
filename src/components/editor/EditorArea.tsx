"use client";

import Editor from "@monaco-editor/react";
import { useStudioStore } from "@/store/useStudioStore";
import { findByPath } from "@/lib/fileSystem";
import { languageForPath } from "@/lib/paths";
import { XIcon, FileIcon } from "@/components/icons";

export function EditorArea() {
  const project = useStudioStore((s) => s.project);
  const tabs = useStudioStore((s) => s.tabs);
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const closeTab = useStudioStore((s) => s.closeTab);
  const editFileContent = useStudioStore((s) => s.editFileContent);

  const activeFile = project && activeTab ? findByPath(project, activeTab) : undefined;

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex items-center overflow-x-auto border-b border-white/5 bg-zinc-950/60 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            onClick={() => setActiveTab(tab.path)}
            className={`group flex items-center gap-2 px-3 py-2 text-sm border-r border-white/5 whitespace-nowrap ${
              activeTab === tab.path
                ? "bg-zinc-900 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
          >
            <FileIcon className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            <span className="max-w-[160px] truncate">{tab.path.split("/").pop()}</span>
            {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path);
              }}
              className="opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded p-0.5 shrink-0"
            >
              <XIcon className="w-3 h-3" />
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {activeFile ? (
          <Editor
            key={activeFile.path}
            path={activeFile.path}
            language={languageForPath(activeFile.path)}
            value={activeFile.content ?? ""}
            theme="vs-dark"
            onChange={(value) => editFileContent(activeFile.path, value ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: true },
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
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Select a file from the explorer, or ask the AI to create one.
          </div>
        )}
      </div>
    </div>
  );
}
