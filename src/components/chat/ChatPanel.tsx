"use client";

import { useEffect, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useChatStore } from "@/store/useChatStore";
import { selectContextFiles } from "@/lib/ai/contextSelection";
import { projectFileTreeText } from "@/lib/fileSystem";
import { OperationsPreview } from "./OperationsPreview";
import { SendIcon, SparkleIcon } from "@/components/icons";

const SUGGESTIONS = [
  "Create a simple portfolio site with hero, about, projects, and contact sections",
  "Make the hero section bigger and add subtle animations",
  "Explain the error in my current file",
  "Refactor this file for readability",
];

export function ChatPanel() {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeTab);
  const applyOperations = useStudioStore((s) => s.applyOperations);
  const openFile = useStudioStore((s) => s.openFile);

  const { messages, loading, loadForProject, addUserMessage, addAssistantMessage, addErrorMessage, markApplied, markRejected, setLoading } =
    useChatStore();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project) loadForProject(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || !project || loading) return;
    setInput("");
    addUserMessage(prompt);
    setLoading(true);

    try {
      const fileTree = projectFileTreeText(project);
      const contextFiles = selectContextFiles(project, { currentFilePath: activeTab ?? undefined, prompt });
      const history = useChatStore
        .getState()
        .messages.filter((m) => m.content)
        .slice(-10)
        .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content }));

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, fileTree, contextFiles, history }),
      });

      const data = await res.json();
      if (!res.ok) {
        addErrorMessage(data.error ?? "Request failed.");
        return;
      }

      addAssistantMessage(data.message || "Done.", data.operations);

      // If there are no operations to review, or the caller intends auto-apply for
      // trivial Q&A responses, nothing further to do — the message itself is the answer.
      if (data.openFiles?.length && (!data.operations || data.operations.length === 0)) {
        for (const path of data.openFiles) openFile(path);
      }
    } catch (err) {
      addErrorMessage(err instanceof Error ? err.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply(messageId: string, ops: NonNullable<(typeof messages)[number]["proposedOperations"]>) {
    const { failed } = applyOperations(ops);
    markApplied(messageId);
    for (const op of ops) {
      if (op.type !== "delete" && !failed.some((f) => f.op === op)) {
        openFile(op.type === "rename" ? op.newPath! : op.path);
      }
    }
    if (failed.length > 0) {
      addErrorMessage(`Some operations failed: ${failed.map((f) => f.error).join("; ")}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <SparkleIcon className="w-4 h-4 text-sky-400" />
        <span className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">AI Coding Agent</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Describe what you want to build or change. The AI can create, edit, rename, and delete files in this
              project.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-xs px-2.5 py-2 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-sky-500/15 text-sky-100" : "bg-white/5 text-zinc-300"
              }`}
            >
              {m.error ? (
                <div className="text-red-400 text-xs">⚠ {m.error}</div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  {m.proposedOperations && (
                    <OperationsPreview
                      operations={m.proposedOperations}
                      applied={m.applied}
                      rejected={m.rejected}
                      onApply={() => handleApply(m.id, m.proposedOperations!)}
                      onReject={() => markRejected(m.id)}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 text-zinc-500 rounded-lg px-3 py-2 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-2.5 shrink-0">
        <div className="flex items-end gap-2 bg-white/5 rounded-lg px-2.5 py-2 focus-within:ring-1 focus-within:ring-sky-500">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={project ? "Ask the AI to build or change something..." : "Open a project to chat with the AI"}
            disabled={!project}
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 resize-none outline-none max-h-40"
          />
          <button
            onClick={() => send()}
            disabled={!project || loading || !input.trim()}
            className="shrink-0 p-1.5 rounded-md bg-sky-500 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sky-400"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
