"use client";

import { create } from "zustand";
import { useStudioStore } from "@/store/useStudioStore";
import { isLoadingFor, useChatStore } from "@/store/useChatStore";
import { languageForPath } from "@/lib/paths";
import { AlertIcon, CircleAlertIcon, KeyboardIcon, ZapIcon } from "@/components/icons";
import { PandaBall } from "@/components/Panda";
import { allProblems, useProblems } from "./useProblems";
import { useEditorSettings } from "./useEditorSettings";
import { useWorkspaceLayout } from "./useWorkspaceLayout";
import { WORKSPACE_EVENTS, emit } from "./events";

// The strip along the bottom of a desktop editor: how many problems there are,
// where the cursor is, what kind of file this is. Small, but it is the thing
// that makes a browser page feel like a real tool — and each piece is a button
// to the place that explains it.

/** Where the cursor is in the open file. Written by the editor, read here. */
export const useCursor = create<{ line: number; col: number; selected: number; set: (c: { line: number; col: number; selected: number }) => void }>(
  (set) => ({ line: 1, col: 1, selected: 0, set: (c) => set(c) }),
);

const LANGUAGE_NAMES: Record<string, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain text",
  python: "Python",
};

export function StatusBar() {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeTab);
  const consoleEntries = useStudioStore((s) => s.consoleEntries);
  const byPath = useProblems((s) => s.byPath);
  const busy = useChatStore((s) => isLoadingFor(s, project?.id));
  const { line, col, selected } = useCursor();
  const tabSize = useEditorSettings((s) => s.tabSize);
  const autoRun = useEditorSettings((s) => s.autoRun);

  const problems = allProblems(byPath);
  const errors = problems.filter((p) => p.severity === "error").length + consoleEntries.filter((e) => e.level === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  const language = activeTab ? languageForPath(activeTab) : null;

  const showProblems = () => {
    useWorkspaceLayout.getState().reveal("preview");
    requestAnimationFrame(() => emit(WORKSPACE_EVENTS.showPreviewTab, { tab: "problems" }));
  };

  return (
    <footer className="hidden h-7 shrink-0 items-center gap-1 border-t border-[var(--line)] bg-[var(--surface-0)] px-2 text-[12px] text-[var(--text-faint)] md:flex">
      <StatusButton onClick={showProblems} title="Show problems">
        <CircleAlertIcon className={`h-3.5 w-3.5 ${errors ? "text-[var(--danger)]" : ""}`} />
        <span className="tabular-nums">{errors}</span>
        <AlertIcon className={`ml-1.5 h-3.5 w-3.5 ${warnings ? "text-[var(--warn)]" : ""}`} />
        <span className="tabular-nums">{warnings}</span>
      </StatusButton>
      {busy && (
        <span className="ml-2 flex items-center gap-1.5 text-[var(--text-dim)]">
          <PandaBall spin className="h-4 w-4" />
          Panda is working…
        </span>
      )}
      <span className="flex-1" />
      {language && (
        <>
          <span className="px-2 tabular-nums">
            Ln {line}, Col {col}
            {selected > 0 ? ` (${selected} selected)` : ""}
          </span>
          <StatusButton onClick={() => emit(WORKSPACE_EVENTS.openSettings)} title="Change the indent size">
            Spaces: {tabSize}
          </StatusButton>
          <span className="px-2">{LANGUAGE_NAMES[language] ?? language}</span>
        </>
      )}
      <StatusButton onClick={() => emit(WORKSPACE_EVENTS.openSettings)} title={autoRun ? "The preview runs as you type" : "The preview runs when you press Run"}>
        <ZapIcon className={`h-3.5 w-3.5 ${autoRun ? "text-[var(--accent-text)]" : ""}`} />
        {autoRun ? "Auto-run" : "Run on click"}
      </StatusButton>
      <StatusButton onClick={() => emit(WORKSPACE_EVENTS.openShortcuts)} title="Keyboard shortcuts (?)">
        <KeyboardIcon className="h-3.5 w-3.5" />
      </StatusButton>
    </footer>
  );
}

function StatusButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-full items-center gap-1 rounded px-2 hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}
