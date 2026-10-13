"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useStudioStore } from "@/store/useStudioStore";
import { isLoadingFor, useChatStore } from "@/store/useChatStore";
import { useMemoryStore } from "@/store/useMemoryStore";
import { useProfileStore } from "@/store/useProfileStore";
import { assetManifest } from "@/lib/assets";
import { selectContextFiles } from "@/lib/ai/contextSelection";
import { findByPath, projectFileTreeText } from "@/lib/fileSystem";
import { attachmentsToPromptText, type Attachment } from "@/lib/attachments";
import { Composer } from "@/components/chat/Composer";
import { CopyButton } from "@/components/chat/CopyButton";
import { MessageText } from "@/components/chat/MessageText";
import { useDialog } from "@/components/ui/Dialog";
import { PandaBall, PandaMark, PandaSitting } from "@/components/Panda";
import { BookIcon, GamepadIcon, PaletteIcon, RefreshIcon, SparkleIcon, StopIcon, WandIcon } from "@/components/icons";
import type { FileOperation } from "@/types";
import { useLiveWrite } from "./useLiveWrite";
import { EffortPills } from "./EffortPills";
import { ActionList, LiveActions, type RecoveryNote } from "./ActionList";
import { recoverOperations } from "./recoverOperations";
import { runBuildStream, type OpStart } from "./buildStream";
import { studentSafeMessage } from "@/lib/ai/turn";
import { PaneHeader } from "./Pane";
import { WORKSPACE_EVENTS } from "./events";
import { ago, useNow } from "./useNow";

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
//
// ONE TURN, ONE PROJECT
//
// A turn belongs to the project it was asked in. The request is aborted when
// the project changes (or the workspace closes), every write to the chat names
// that project, and the busy state is per project — so opening project B while
// A's turn is running can no longer land A's reply, and A's Apply button, in B.
// The panel stays mounted while it is hidden, so closing the chat pane mid-turn
// does not cancel the turn; leaving the project does.

const SUGGESTIONS: { key: StringKey; Icon: typeof SparkleIcon }[] = [
  { key: "studio.suggestionPortfolio", Icon: PaletteIcon },
  { key: "studio.suggestionHero", Icon: WandIcon },
  { key: "studio.suggestionScreen", Icon: GamepadIcon },
  { key: "studio.suggestionExplainFile", Icon: BookIcon },
];

/**
 * Why a message's operations were recovered, and what actually arrived, keyed
 * by message id. Deliberately in memory rather than in the persisted message:
 * the recovery is a note about this session's repair, not part of the student's
 * project history, and adding a field to the shared ChatMessage type would
 * reach every other surface for the benefit of one.
 */
const recoveries = new Map<string, { source: RecoveryNote; raw: string }>();

/**
 * What a failed turn was asking for, keyed by the error message's id. It is
 * what lets a dead-end error grow a "Try again" button that resends the
 * student's exact words — including the attachments, which they could not
 * retype at all.
 */
const retryable = new Map<string, { prompt: string; attachments: Attachment[] }>();

/**
 * The files a proposal was written against, keyed by message id: the content
 * of every file it modifies, as it was when Panda answered. If the student has
 * typed into one of those files since, applying would silently replace their
 * typing with Panda's older picture of the file — so they are asked first.
 */
const proposalBase = new Map<string, Record<string, string>>();

/** What the panel is doing right now, in words that are true. */
type Phase =
  | { kind: "idle" }
  | { kind: "reading"; files: string[] }
  /** The request is away and the model has produced nothing yet. */
  | { kind: "waiting" }
  | { kind: "writing"; path: string; index: number; total: number };

/**
 * The agent's work as it arrives: operations the server has finished parsing,
 * and the one the model is writing at this moment. Nothing is added here that
 * the model did not emit.
 */
interface Live {
  done: FileOperation[];
  current?: OpStart;
}

/**
 * The elapsed clock, mounted only while we are waiting. Its own component
 * because "start again from zero" is then a mount rather than a state reset
 * inside an effect.
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

function StatusLine({ phase, onStop }: { phase: Phase; onStop?: () => void }) {
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
    <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2">
      <PandaBall spin className="h-6 w-6 shrink-0" />
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-dim)]">
        {text ?? <Elapsed />}
      </p>
      {onStop && (
        <button type="button" onClick={onStop} className="btn btn-ghost btn-sm !h-7 shrink-0 !px-2">
          <StopIcon />
          Stop
        </button>
      )}
    </div>
  );
}

export function AgentPanel({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n();
  const dialog = useDialog();
  const project = useStudioStore((s) => s.project);
  const applyOperations = useStudioStore((s) => s.applyOperations);
  const openFile = useStudioStore((s) => s.openFile);

  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => isLoadingFor(s, project?.id));
  const { addUserMessage, addAssistantMessage, addErrorMessage, markApplied, markRejected, setLoading } =
    useChatStore.getState();

  const buildLog = useMemoryStore((s) => s.buildLog);
  const modes = useProfileStore((s) => s.modes);
  const memoryBlock = useProfileStore((s) => s.memoryBlock);
  const displayName = useProfileStore((s) => s.displayName);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [live, setLive] = useState<Live>({ done: [] });
  const [applying, setApplying] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const now = useNow();
  const projectId = project?.id;

  // A new project gets its own chat and log — and whatever was running for the
  // last one is stopped, here, on the way out.
  useEffect(() => {
    if (!projectId) return;
    void useChatStore.getState().loadForProject(projectId);
    void useMemoryStore.getState().hydrate(projectId);
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      useLiveWrite.getState().end();
    };
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading, live.done.length]);

  // The composer is the panel's job, so a request to focus it from anywhere
  // else in the workspace (the command palette, mostly) lands here. Scoped to
  // this panel's composer: Monaco has a hidden textarea of its own.
  useEffect(() => {
    function focusComposer() {
      document.querySelector<HTMLTextAreaElement>("[data-agent-composer] textarea")?.focus();
    }
    window.addEventListener(WORKSPACE_EVENTS.focusComposer, focusComposer);
    return () => window.removeEventListener(WORKSPACE_EVENTS.focusComposer, focusComposer);
  }, []);

  async function send(promptOverride?: string, resent?: Attachment[]) {
    const typed = (promptOverride ?? input).trim();
    const outgoing = resent ?? attachments;
    if ((!typed && outgoing.length === 0) || !project || loading) return;

    // Everything below is about THIS project, whatever the store says later.
    const turnProject = project;
    const id = turnProject.id;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const stillHere = () => !controller.signal.aborted && useStudioStore.getState().project?.id === id;

    setInput("");
    setAttachments([]);
    setShowNotes(false);
    addUserMessage(id, typed || "(sent attachments)");
    setLoading(id, true);

    try {
      const attachedText = attachmentsToPromptText(outgoing);
      const prompt = [typed, attachedText].filter(Boolean).join("\n\n");

      const fileTree = projectFileTreeText(turnProject);
      const contextFiles = selectContextFiles(turnProject, {
        currentFilePath: useStudioStore.getState().activeTab ?? undefined,
        prompt: typed,
      });
      // Naming the files we are about to send is honest and instant: these are
      // the files going up with the request.
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

      // The turn is streamed, so only the first token is on a clock and the
      // student watches the files appear instead of watching a spinner.
      //
      // ONE AUTOMATIC RETRY, AND ONLY FOR A TURN THAT PRODUCED NOTHING. A turn
      // is only ever restarted BEFORE it has produced anything: once an
      // operation, a delta or a `done` frame has reached the student,
      // re-running could put a second copy of the same file operations in
      // front of them. `produced` enforces that.
      const attempts = 2;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        let produced = false;
        let failure: string | undefined;

        await runBuildStream(
          {
            prompt: prompt || "(the user sent attachments with no message)",
            fileTree,
            contextFiles,
            history,
            explainMode: modes.explainMode,
            buildEffort: modes.buildEffort,
            assetManifest: assetManifest(turnProject),
            projectMemory: useMemoryStore.getState().projectMemorySummary(),
            studentProfile: memoryBlock(),
            images: outgoing
              .filter((a) => a.kind === "image" && a.base64 && a.mimeType)
              .map((a) => ({ data: a.base64!, mimeType: a.mimeType! })),
          },
          {
            onThinking: () => stillHere() && setPhase({ kind: "waiting" }),
            onOpStart: (op) => {
              if (!stillHere()) return;
              produced = true;
              setLive((l) => ({ ...l, current: op }));
              // The editor shows this file being written.
              useLiveWrite.getState().begin(op.path, op.type);
            },
            onOpDelta: (path, delta) => {
              if (!stillHere()) return;
              produced = true;
              useLiveWrite.getState().append(path, delta);
            },
            onOp: (op) => {
              if (!stillHere()) return;
              produced = true;
              setLive((l) => ({
                done: [...l.done, op],
                current: l.current?.path === op.path ? undefined : l.current,
              }));
            },
            // Held rather than shown. On the first attempt this may be a blip
            // the retry will step over.
            onError: (message) => {
              failure = message;
            },
            onDone: (result) => {
              if (!stillHere()) return;
              produced = true;
              // Never the raw reply: `studentSafeMessage` keeps a malformed
              // envelope out of the transcript.
              const raw = studentSafeMessage(result.message, "");

              if (result.operations.length === 0) {
                const recovered = recoverOperations(result.message);
                if (recovered) {
                  const msg = addAssistantMessage(
                    id,
                    studentSafeMessage(recovered.note, "Panda wrote some code. Here's where it goes."),
                    recovered.operations,
                  );
                  if (msg) {
                    recoveries.set(msg.id, { source: recovered.source, raw: result.message });
                    rememberBase(msg.id, recovered.operations);
                  }
                  return;
                }
              }

              const msg = addAssistantMessage(id, raw || "Done.", result.operations);
              if (msg) {
                rememberBase(msg.id, result.operations);
                // A cut-off reply is said out loud rather than presented as a
                // finished answer. Running out of time is its own note: the
                // files are whole, the turn just ended before the rest.
                if (result.interrupted) recoveries.set(msg.id, { source: "out-of-time", raw: "" });
                else if (result.truncated) recoveries.set(msg.id, { source: "truncated-envelope", raw: result.message });
              }
              if (raw && !result.interrupted) useMemoryStore.getState().addBuildLogEntry(id, raw.slice(0, 200));

              if (result.openFiles?.length && result.operations.length === 0) {
                for (const path of result.openFiles) openFile(path);
              }
            },
          },
          t("error.requestFailed"),
          controller.signal,
        );

        if (!stillHere()) return;
        if (!failure) break;
        if (!produced && attempt < attempts) {
          // Silent on purpose: from the student's side this is still the one
          // turn they asked for, and it has not failed yet.
          setLive({ done: [] });
          setPhase({ kind: "waiting" });
          continue;
        }

        // Out of attempts. The error gets a Try again button, and the text goes
        // back into the composer, because the one thing a failure must never
        // cost is the message they typed.
        const failed = addErrorMessage(id, failure);
        if (failed) retryable.set(failed.id, { prompt: typed, attachments: outgoing });
        setInput(typed);
        setAttachments(outgoing);
        break;
      }
    } catch (err) {
      // A stop the student asked for, or a project they left, is not an error.
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      if (!stillHere()) return;
      const failed = addErrorMessage(id, err instanceof Error ? err.message : t("error.network"));
      if (failed) retryable.set(failed.id, { prompt: typed, attachments: outgoing });
      setInput(typed);
      setAttachments(outgoing);
    } finally {
      setLoading(id, false);
      if (abortRef.current === controller) abortRef.current = null;
      // However the turn ended, the panel and the editor stop showing a draft —
      // but only for the project this turn belonged to.
      if (useStudioStore.getState().project?.id === id) {
        setPhase({ kind: "idle" });
        setLive({ done: [] });
        useLiveWrite.getState().end();
      }
    }
  }

  /** Records what each file a proposal modifies looked like when it was proposed. */
  function rememberBase(messageId: string, ops: FileOperation[]) {
    const current = useStudioStore.getState().project;
    if (!current) return;
    const base: Record<string, string> = {};
    for (const op of ops) {
      if (op.type !== "modify") continue;
      const node = findByPath(current, op.path);
      if (node?.kind === "file") base[op.path] = node.content ?? "";
    }
    proposalBase.set(messageId, base);
  }

  function stop() {
    abortRef.current?.abort();
  }

  /**
   * Applied one file at a time on purpose, so the status line can name the
   * file being written as it is written. Locked while it runs: see ActionList.
   */
  async function handleApply(messageId: string, ops: FileOperation[]) {
    if (applying || !project) return;
    const message = useChatStore.getState().messages.find((m) => m.id === messageId);
    if (!message || message.applied || message.rejected) return;
    const id = project.id;
    setApplying(messageId);
    try {
      // Edited since Panda wrote this? Say so before anything is replaced.
      const base = proposalBase.get(messageId);
      if (base) {
        const changed = Object.entries(base)
          .filter(([path, before]) => {
            const node = findByPath(project, path);
            return node?.kind === "file" && (node.content ?? "") !== before;
          })
          .map(([path]) => path);
        if (changed.length > 0) {
          const ok = await dialog.confirm({
            title: changed.length === 1 ? `You've changed ${changed[0]} since then` : `You've changed ${changed.length} of these files since then`,
            description:
              `Panda wrote this before your latest edits${changed.length > 1 ? ` to ${changed.join(", ")}` : ""}. ` +
              "Applying replaces those files with Panda's version, so your newer edits would be lost. " +
              "(History still has them if you change your mind.)",
            confirmLabel: "Apply anyway",
            danger: true,
          });
          if (!ok) return;
        }
      }
      const failures: string[] = [];
      for (const [index, op] of ops.entries()) {
        setPhase({ kind: "writing", path: op.path, index: index + 1, total: ops.length });
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        if (useStudioStore.getState().project?.id !== id) return;
        const { failed } = applyOperations([op]);
        if (failed.length > 0) failures.push(...failed.map((f) => f.error));
        else if (op.type !== "delete") openFile(op.type === "rename" ? op.newPath! : op.path);
      }
      markApplied(id, messageId);
      proposalBase.delete(messageId);
      if (failures.length > 0) addErrorMessage(id, t("studio.applyFailed", { errors: failures.join("; ") }));
    } finally {
      setApplying(null);
      setPhase({ kind: "idle" });
    }
  }

  const name = displayName();
  const changed = useMemo(
    () => messages.reduce((n, m) => n + (m.applied && m.proposedOperations ? m.proposedOperations.length : 0), 0),
    [messages],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-0)]">
      <PaneHeader
        onClose={onClose}
        closeLabel="Close the chat with Panda"
        actions={
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            aria-pressed={showNotes}
            title="What we built: Panda's notes on this project"
            className="icon-btn icon-btn-sm tap-sq tap-pad"
          >
            <BookIcon />
          </button>
        }
      >
        <h2 className="flex min-w-0 flex-1 items-center gap-2">
          <PandaMark className="h-5 w-5 shrink-0" />
          <span className="truncate text-[13.5px] font-[var(--weight-strong)] text-[var(--text)]">Panda</span>
          {changed > 0 && (
            <span className="badge badge-success !h-5 shrink-0 tabular-nums">
              {changed} change{changed === 1 ? "" : "s"} applied
            </span>
          )}
        </h2>
      </PaneHeader>

      {showNotes ? (
        <BuildNotes entries={buildLog} now={now} onBack={() => setShowNotes(false)} />
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {messages.length === 0 && !loading && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col items-center text-center">
                <PandaSitting className="h-24 w-24" bamboo />
                <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[var(--text-dim)]">
                  {name ? t("studio.emptyGreeting", { name }) : t("studio.emptyGreetingNoName")}
                </p>
              </div>
              <div className="grid gap-2">
                {SUGGESTIONS.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void send(t(key))}
                    className="card card-interactive tap flex items-start gap-2.5 px-3 py-2.5 text-left text-[13px] leading-snug text-[var(--text-dim)] hover:text-[var(--text)]"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)]">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const recovery = recoveries.get(m.id);
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-[var(--radius-lg)] rounded-br-md bg-[var(--accent-soft)] px-3.5 py-2 text-[14px] text-[var(--text)]">
                    {m.content}
                  </div>
                  {m.content && <CopyButton content={m.content} variant="own" />}
                </div>
              );
            }
            return (
              <div key={m.id} className="flex gap-2.5">
                <PandaMark className="mt-0.5 h-6 w-6 shrink-0" />
                <div className="min-w-0 flex-1 text-[14px] text-[var(--text)]">
                  {m.error ? (
                    <div className="rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-[var(--danger)]">
                      {m.error}
                      {retryable.has(m.id) && (
                        <button
                          type="button"
                          onClick={() => {
                            const again = retryable.get(m.id)!;
                            // Taken out of the map first: one button, one resend,
                            // so a double click cannot start two turns.
                            retryable.delete(m.id);
                            void send(again.prompt, again.attachments);
                          }}
                          className="btn btn-danger btn-sm mt-2 flex"
                        >
                          <RefreshIcon />
                          Try again
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <MessageText content={m.content} />
                      {m.proposedOperations && (
                        <ActionList
                          operations={m.proposedOperations}
                          applied={m.applied}
                          rejected={m.rejected}
                          busy={applying === m.id}
                          recovered={recovery?.source}
                          onApply={() => void handleApply(m.id, m.proposedOperations!)}
                          onReject={() => project && markRejected(project.id, m.id)}
                        />
                      )}
                      {recovery && recovery.raw && (
                        // The raw reply is kept, not thrown away: a student who
                        // wants to see exactly what came back can.
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[12px] text-[var(--text-faint)] hover:text-[var(--text-dim)]">
                            Show what Panda actually sent
                          </summary>
                          <pre className="ide-mono mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-1)] p-2 text-[11px] leading-snug text-[var(--text-faint)]">
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

          {(live.done.length > 0 || live.current) && <LiveActions done={live.done} current={live.current} />}

          {phase.kind !== "idle" && <StatusLine phase={phase} onStop={loading ? stop : undefined} />}
        </div>
      )}

      {/* Marked so "Ask Panda about this" can find THIS composer and nothing
          else — Monaco keeps a hidden textarea of its own. */}
      <div data-agent-composer className="shrink-0 border-t border-[var(--line)] p-2.5">
        <Composer
          value={input}
          onChange={setInput}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={() => void send()}
          loading={loading}
          disabled={!project}
          placeholder={t(project ? "studio.placeholder" : "studio.placeholderNoProject")}
          footer={<EffortPills />}
        />
      </div>
    </div>
  );
}

/** Panda's running notes on the project — what it has built so far, newest first. */
function BuildNotes({ entries, now, onBack }: { entries: { id: string; text: string; timestamp: number }[]; now: number; onBack: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="eyebrow">What we built</p>
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm !h-7">
          Back to chat
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]">
            <BookIcon className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-dim)]">
            Nothing built yet. Ask Panda for something, and a note about each change lands here.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className="card px-3 py-2">
              <p className="text-[13px] leading-relaxed text-[var(--text)]">{entry.text}</p>
              <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{ago(entry.timestamp, now)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
