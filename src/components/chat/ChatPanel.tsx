"use client";

import { useEffect, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useChatStore } from "@/store/useChatStore";
import { useMemoryStore } from "@/store/useMemoryStore";
import { useProfileStore } from "@/store/useProfileStore";
import { selectContextFiles } from "@/lib/ai/contextSelection";
import { projectFileTreeText } from "@/lib/fileSystem";
import { attachmentsToPromptText, type Attachment } from "@/lib/attachments";
import { OperationsPreview } from "./OperationsPreview";
import { Composer } from "./Composer";
import { ModePills } from "./ModePills";
import { MessageText } from "./MessageText";
import { SparkleIcon } from "@/components/icons";

const SUGGESTIONS = [
  "Make me a simple portfolio site with hero, about, projects, and contact sections",
  "Make the hero section bigger and add fun animations",
  "Something on my screen looks wrong — can you help?",
  "Explain what this file does, step by step",
];

export function ChatPanel() {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeTab);
  const applyOperations = useStudioStore((s) => s.applyOperations);
  const openFile = useStudioStore((s) => s.openFile);

  const {
    messages,
    loading,
    loadForProject,
    addUserMessage,
    addAssistantMessage,
    addErrorMessage,
    markApplied,
    markRejected,
    setLoading,
  } = useChatStore();

  const { hydrate, projectMemorySummary, addBuildLogEntry } = useMemoryStore();
  const modes = useProfileStore((s) => s.modes);
  const memoryBlock = useProfileStore((s) => s.memoryBlock);
  const displayName = useProfileStore((s) => s.displayName);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;
    void loadForProject(project.id);
    void hydrate(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  async function send(promptOverride?: string) {
    const typed = (promptOverride ?? input).trim();
    const outgoing = attachments;
    if ((!typed && outgoing.length === 0) || !project || loading) return;

    setInput("");
    setAttachments([]);
    addUserMessage(typed || "(sent attachments)");
    setLoading(true);

    try {
      const attachedText = attachmentsToPromptText(outgoing);
      const prompt = [typed, attachedText].filter(Boolean).join("\n\n");

      const fileTree = projectFileTreeText(project);
      const contextFiles = selectContextFiles(project, { currentFilePath: activeTab ?? undefined, prompt: typed });
      const history = useChatStore
        .getState()
        .messages.filter((m) => m.content)
        .slice(-10)
        .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content }));

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "(the user sent attachments with no message)",
          fileTree,
          contextFiles,
          history,
          explainMode: modes.explainMode,
          aiHomie: modes.aiHomie,
          projectMemory: projectMemorySummary(),
          studentProfile: memoryBlock(),
          images: outgoing
            .filter((a) => a.kind === "image" && a.base64 && a.mimeType)
            .map((a) => ({ data: a.base64!, mimeType: a.mimeType! })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        addErrorMessage(data.error ?? "Request failed.");
        return;
      }

      addAssistantMessage(data.message || "Done.", data.operations);
      if (data.message) addBuildLogEntry(project.id, data.message.slice(0, 200));

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
      addErrorMessage(`Some of that didn't work: ${failed.map((f) => f.error).join("; ")}`);
    }
  }

  const name = displayName();

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <SparkleIcon className="h-4 w-4 text-[var(--text-dim)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Assistant</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-[var(--text-dim)]">
              {name ? `Alright ${name} — what` : "What"} do you want to build or change? Describe it like you&apos;d
              describe it to a friend. You&apos;ll always see the changes before anything happens.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-left text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
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
              className={
                m.role === "user"
                  ? "max-w-[92%] rounded-2xl bg-[var(--bubble-user)] px-3.5 py-2 text-sm text-[var(--text)]"
                  : "w-full text-sm text-[var(--text)]"
              }
            >
              {m.error ? (
                <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                  {m.error}
                </div>
              ) : (
                <>
                  <MessageText content={m.content} />
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
          <div className="flex items-center gap-1.5 text-[var(--text-faint)]">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] p-2.5">
        <Composer
          value={input}
          onChange={setInput}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={() => void send()}
          loading={loading}
          disabled={!project}
          placeholder={project ? "What should we build or fix?" : "Open a project to start"}
          footer={<ModePills />}
        />
      </div>
    </div>
  );
}
