"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useStudioStore } from "@/store/useStudioStore";
import { useChatStore } from "@/store/useChatStore";
import { useMemoryStore } from "@/store/useMemoryStore";
import { useProfileStore } from "@/store/useProfileStore";
import { selectContextFiles } from "@/lib/ai/contextSelection";
import { projectFileTreeText } from "@/lib/fileSystem";
import { attachmentsToPromptText, type Attachment } from "@/lib/attachments";
import { Composer } from "@/components/chat/Composer";
import { ModePills } from "@/components/chat/ModePills";
import { MessageText } from "@/components/chat/MessageText";
import { SparkleIcon } from "@/components/icons";
import type { FileOperation } from "@/types";
import { ActionList, LiveActions, type RecoveryNote } from "./ActionList";
import { recoverOperations } from "./recoverOperations";
import { runBuildStream, type OpStart } from "./buildStream";

// The agent panel: the workspace's own chat, and deliberately not the general
// one in components/chat. That panel is a conversation; this one is a build
// log. The difference shows in what it puts on screen — an answer here is a
// list of actions taken against files, with a diff behind each, and the prose
// is the small print rather than the headline.
//
// It is also where the code-in-the-transcript bug is repaired. See
// recoverOperations.ts for the root cause; the wiring is in `send` below, where
// a reply that came back with no operations is given a second reading before it
// is allowed to become a wall of text in the log.

const SUGGESTIONS: StringKey[] = [
  "studio.suggestionPortfolio",
  "studio.suggestionHero",
  "studio.suggestionScreen",
  "studio.suggestionExplainFile",
];

/**
 * Why a message's operations were recovered, and what actually arrived, keyed
 * by message id. Deliberately in memory rather than in the persisted message:
 * the recovery is a note about this session's repair, not part of the student's
 * project history, and adding a field to the shared ChatMessage type would
 * reach every other surface for the benefit of one.
 */
const recoveries = new Map<string, { source: RecoveryNote; raw: string }>();

/** What the panel is doing right now, in words that are true. */
type Phase =
  | { kind: "idle" }
  | { kind: "reading"; files: string[] }
  /** The request is away and the model has produced nothing yet. */
  | { kind: "waiting" }
  | { kind: "writing"; path: string; index: number; total: number };

/**
 * The agent's work as it arrives: operations the server has finished parsing,
 * and the one the model is writing at this moment.
 *
 * Held apart from `phase` because it outlives a phase change — the list stays
 * on screen while the next file is being written — and because everything in
 * it came off the wire. Nothing is added here that the model did not emit.
 */
interface Live {
  done: FileOperation[];
  current?: OpStart;
}

/**
 * The elapsed clock, mounted only while we are waiting. Its own component
 * because "start again from zero" is then a mount rather than a state reset
 * inside an effect, and because a render must give the same answer twice —
 * reading Date.now() while rendering would not.
 */
function Elapsed() {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{t("studio.working", { seconds })}</>;
}

function StatusLine({ phase }: { phase: Phase }) {
  const { t } = useI18n();
  if (phase.kind === "idle") return null;

  const text =
    phase.kind === "reading"
      ? phase.files.length === 0
        ? t("studio.lookingAtProject")
        : t("studio.readingFiles", { files: phase.files.join(", ") })
      : phase.kind === "waiting"
        ? null
        : t("studio.writingCount", { path: phase.path, index: phase.index, total: phase.total });

  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-faint)]"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent)] motion-reduce:animate-none"
      />
      <span className="min-w-0 truncate">{text ?? <Elapsed />}</span>
    </p>
  );
}

export function AgentPanel() {
  const { t } = useI18n();
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
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [live, setLive] = useState<Live>({ done: [] });
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

  // The composer is the panel's job, so a request to focus it from anywhere
  // else in the workspace (the command palette, mostly) lands here.
  useEffect(() => {
    function focusComposer() {
      scrollRef.current?.parentElement?.querySelector("textarea")?.focus();
    }
    window.addEventListener("panda:focus-composer", focusComposer);
    return () => window.removeEventListener("panda:focus-composer", focusComposer);
  }, []);

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
      const contextFiles = selectContextFiles(project, {
        currentFilePath: activeTab ?? undefined,
        prompt: typed,
      });
      // Naming the files we are about to send is honest and instant: these are
      // the files going up with the request, said before the model has had a
      // chance to do anything at all.
      setPhase({ kind: "reading", files: Object.keys(contextFiles).slice(0, 4) });
      setLive({ done: [] });

      const history = useChatStore
        .getState()
        .messages.filter((m) => m.content)
        .slice(-10)
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));

      // The turn is streamed, and that is what makes generating a whole small
      // app possible: buffered, the entire job had to land inside one deadline,
      // and "make a better version of cookie clicker" never did. Streamed, only
      // the first token is on a clock — and the student watches the files
      // appear instead of watching a spinner.
      await runBuildStream(
        {
          prompt: prompt || "(the user sent attachments with no message)",
          fileTree,
          contextFiles,
          history,
          explainMode: modes.explainMode,
          projectMemory: projectMemorySummary(),
          studentProfile: memoryBlock(),
          images: outgoing
            .filter((a) => a.kind === "image" && a.base64 && a.mimeType)
            .map((a) => ({ data: a.base64!, mimeType: a.mimeType! })),
        },
        {
          onThinking: () => setPhase({ kind: "waiting" }),
          onOpStart: (op) => setLive((l) => ({ ...l, current: op })),
          onOp: (op) =>
            setLive((l) => ({
              done: [...l.done, op],
              // The file that just finished is the one that was in flight, so
              // the "writing now" row retires with it rather than lingering
              // under a completed one.
              current: l.current?.path === op.path ? undefined : l.current,
            })),
          onError: (message) => addErrorMessage(message),
          onDone: (result) => {
            const raw = result.message;

            // Unchanged from the buffered path: no operations means the model
            // answered as prose (or with code in a fence), and that reply gets
            // a second reading before it is allowed to become a wall of text.
            if (result.operations.length === 0) {
              const recovered = recoverOperations(raw);
              if (recovered) {
                const msg = addAssistantMessage(
                  recovered.note || "Panda wrote some code. Here's where it goes.",
                  recovered.operations,
                );
                recoveries.set(msg.id, { source: recovered.source, raw });
                return;
              }
            }

            const msg = addAssistantMessage(raw || "Done.", result.operations);
            // A cut-off reply is said out loud rather than presented as a
            // finished answer: these are the files that completed, and the
            // student is told to check them before applying.
            //
            // Running out of time is its own note. The files are whole — the
            // turn just ended before the model got to the rest — so the student
            // is told to apply them and ask Panda to carry on, not sent off to
            // check a connection that was never the problem.
            if (result.interrupted) {
              recoveries.set(msg.id, { source: "out-of-time", raw: "" });
            } else if (result.truncated) {
              recoveries.set(msg.id, { source: "truncated-envelope", raw });
            }
            if (raw && !result.interrupted) addBuildLogEntry(project.id, raw.slice(0, 200));

            if (result.openFiles?.length && result.operations.length === 0) {
              for (const path of result.openFiles) openFile(path);
            }
          },
        },
        t("error.requestFailed"),
      );
    } catch (err) {
      addErrorMessage(err instanceof Error ? err.message : t("error.network"));
    } finally {
      setLoading(false);
      setPhase({ kind: "idle" });
      setLive({ done: [] });
    }
  }

  /**
   * Applied one file at a time on purpose. The store would take all of them in
   * a single call, but then the only thing a student sees is the result; going
   * file by file lets the status line name the file being written as it is
   * written, which is the difference between a tool that works and a tool you
   * can watch working.
   */
  async function handleApply(messageId: string, ops: FileOperation[]) {
    const failures: string[] = [];
    for (const [index, op] of ops.entries()) {
      setPhase({ kind: "writing", path: op.path, index: index + 1, total: ops.length });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const { failed } = applyOperations([op]);
      if (failed.length > 0) failures.push(...failed.map((f) => f.error));
      else if (op.type !== "delete") openFile(op.type === "rename" ? op.newPath! : op.path);
    }
    setPhase({ kind: "idle" });
    markApplied(messageId);
    if (failures.length > 0) addErrorMessage(t("studio.applyFailed", { errors: failures.join("; ") }));
  }

  const name = displayName();
  const changed = useMemo(
    () => messages.reduce((n, m) => n + (m.applied && m.proposedOperations ? m.proposedOperations.length : 0), 0),
    [messages],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <SparkleIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Agent
        </span>
        {changed > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--text-faint)]">
            {changed} change{changed === 1 ? "" : "s"} applied
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-[var(--text-dim)]">
              {name ? t("studio.emptyGreeting", { name }) : t("studio.emptyGreetingNoName")}
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  onClick={() => void send(t(key))}
                  className="tap inline-flex items-center w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-left text-sm md:text-xs text-[var(--text-dim)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const recovery = recoveries.get(m.id);
          return (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[92%] rounded-2xl bg-[var(--bubble-user)] px-3.5 py-2 text-sm text-[var(--text)]"
                    : "w-full min-w-0 text-sm text-[var(--text)]"
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
                      <ActionList
                        operations={m.proposedOperations}
                        applied={m.applied}
                        rejected={m.rejected}
                        recovered={recovery?.source}
                        onApply={() => void handleApply(m.id, m.proposedOperations!)}
                        onReject={() => markRejected(m.id)}
                      />
                    )}
                    {recovery && recovery.raw && (
                      // The raw reply is kept, not thrown away: a student who
                      // wants to see exactly what came back can, it just is not
                      // the first thing the log shows them any more.
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[13px] sm:text-[11px] text-[var(--text-faint)] hover:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                          Show what Panda actually sent
                        </summary>
                        <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--surface-1)] p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap break-words text-[var(--text-faint)]">
                          {recovery.raw}
                        </pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {(live.done.length > 0 || live.current) && (
          <LiveActions done={live.done} current={live.current} />
        )}

        {phase.kind !== "idle" && <StatusLine phase={phase} />}
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
          placeholder={t(project ? "studio.placeholder" : "studio.placeholderNoProject")}
          footer={<ModePills />}
        />
      </div>
    </div>
  );
}
