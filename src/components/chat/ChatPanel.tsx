"use client";

import { useEffect, useRef, useState } from "react";
import { useStudioStore } from "@/store/useStudioStore";
import { useChatStore } from "@/store/useChatStore";
import { useMemoryStore } from "@/store/useMemoryStore";
import { selectContextFiles } from "@/lib/ai/contextSelection";
import { projectFileTreeText } from "@/lib/fileSystem";
import { captureTabScreenshot, readFileAsImage, type CapturedImage } from "@/lib/tabCapture";
import { OperationsPreview } from "./OperationsPreview";
import { SendIcon, SparkleIcon, CameraIcon, LightbulbIcon, XIcon } from "@/components/icons";

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

  const { messages, loading, loadForProject, addUserMessage, addAssistantMessage, addErrorMessage, markApplied, markRejected, setLoading } =
    useChatStore();

  const { explainMode, setExplainMode, hydrate, profileSummary, projectMemorySummary, addBuildLogEntry } = useMemoryStore();

  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<CapturedImage | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (project) {
      loadForProject(project.id);
      hydrate(project.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleCapture() {
    setCaptureError(null);
    setCapturing(true);
    try {
      const img = await captureTabScreenshot();
      setPendingImage(img);
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Couldn't capture the screen.");
    } finally {
      setCapturing(false);
    }
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPendingImage(await readFileAsImage(file));
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Couldn't read that image.");
    }
  }

  async function send(promptOverride?: string) {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || !project || loading) return;
    const imageToSend = pendingImage;
    setInput("");
    setPendingImage(null);
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
        body: JSON.stringify({
          prompt,
          fileTree,
          contextFiles,
          history,
          explainMode,
          projectMemory: projectMemorySummary(),
          studentProfile: profileSummary(),
          image: imageToSend ? { data: imageToSend.base64, mimeType: imageToSend.mimeType } : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        addErrorMessage(data.error ?? "Request failed.");
        return;
      }

      addAssistantMessage(data.message || "Done.", data.operations);

      if (data.message && project) {
        addBuildLogEntry(project.id, data.message.slice(0, 200));
      }

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] shrink-0">
        <div className="flex items-center gap-2">
          <SparkleIcon className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-xs font-semibold tracking-wide text-[var(--text-dim)] uppercase">Ask for Help</span>
        </div>
        <button
          onClick={() => setExplainMode(!explainMode)}
          title="Explain Mode: extra simple, step-by-step answers"
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full transition-colors ${
            explainMode ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--text-faint)]"
          }`}
        >
          <LightbulbIcon className="w-3.5 h-3.5" />
          Explain Mode {explainMode ? "On" : "Off"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-faint)] leading-relaxed">
              Tell me what you want to build or change, kind of like describing it to a friend. I can create, edit,
              rename, and remove files for you — you&apos;ll always get to look before anything changes.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-xs px-2.5 py-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-dim)] hover:text-[var(--text)]"
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
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--surface-2)] text-[var(--text)]"
              }`}
            >
              {m.error ? (
                <div className="text-[var(--danger)] text-xs">⚠ {m.error}</div>
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
            <div className="bg-[var(--surface-2)] text-[var(--text-faint)] rounded-xl px-3 py-2 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] p-2.5 shrink-0 space-y-2">
        {captureError && (
          <div className="text-[11px] text-[var(--danger)] px-1">{captureError}</div>
        )}
        {pendingImage && (
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage.dataUrl} alt="Attached screenshot" className="w-12 h-8 object-cover rounded" />
            <span className="text-[11px] text-[var(--text-faint)] flex-1">Screenshot attached</span>
            <button onClick={() => setPendingImage(null)} className="p-1 hover:bg-[var(--surface-3)] rounded">
              <XIcon className="w-3.5 h-3.5 text-[var(--text-faint)]" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 bg-[var(--surface-2)] rounded-xl px-2.5 py-2 focus-within:ring-2 focus-within:ring-[var(--accent)]">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked} />
          <button
            onClick={handleCapture}
            disabled={!project || capturing}
            title="Capture your screen so I can see what you see"
            className="shrink-0 p-1.5 rounded-md hover:bg-[var(--surface-3)] text-[var(--text-faint)] disabled:opacity-30"
          >
            <CameraIcon className="w-4 h-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={project ? "What do you want to build or fix?" : "Open a project to start chatting"}
            disabled={!project}
            rows={1}
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] resize-none outline-none max-h-40"
          />
          <button
            onClick={() => send()}
            disabled={!project || loading || !input.trim()}
            className="shrink-0 p-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-faint)] px-1">
          Tip: click the camera to show me your screen instead of typing it out — your browser will ask which tab to share.
        </p>
      </div>
    </div>
  );
}
