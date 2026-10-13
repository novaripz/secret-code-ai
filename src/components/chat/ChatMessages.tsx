"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { isCutShort, showsText, type AssistantMessage } from "@/store/useAssistantStore";
import { PandaSitting } from "@/components/Panda";
import { IconButton } from "@/components/ui/Button";
import { useReportDialog } from "@/components/ReportDialog";
import { AlertIcon, FileIcon, PencilIcon, RefreshIcon, StopIcon, VolumeIcon } from "@/components/icons";
import { Flag } from "lucide-react";
import { MessageText } from "./MessageText";
import { CopyButton } from "./CopyButton";
import { Activity, Sources, type ActivityState } from "./Activity";
import type { Source } from "./frames";
import { speakableText, useCanSpeak, useReadAloud } from "./speech";
import { stripRemembered } from "./remember";

// The conversation itself: the student's messages on the right, Panda's
// replies on the left, and what Panda is doing at the bottom while it works.

export interface ReplyHandlers {
  /** Re-asks the last question. Shown on the newest reply only. */
  onRegenerate?: () => void;
  /** Replaces the last message the student sent and asks again. */
  onEdit?: (messageId: string, text: string) => void;
  onContinue: () => void;
}

/** The small panda beside a reply. It moves only while that reply is being written. */
function Avatar({ live }: { live: boolean }) {
  return (
    <span aria-hidden="true" className="chat-avatar hidden sm:flex">
      <PandaSitting className="h-[34px] w-[27px]" bamboo={false} idle={live} />
    </span>
  );
}

function ReplyTools({
  message,
  replyLocale,
  onRegenerate,
}: {
  message: AssistantMessage;
  replyLocale: string;
  onRegenerate?: () => void;
}) {
  const { t } = useI18n();
  const canSpeak = useCanSpeak();
  const { speakingId, speak, stop } = useReadAloud();
  const showReport = useReportDialog((s) => s.show);
  const speaking = speakingId === message.id;

  return (
    <>
      <CopyButton content={message.content} variant="icon" />
      {canSpeak && (
        <IconButton
          size="sm"
          className="tap-pad"
          label={speaking ? t("chat.stopReading") : t("chat.readAloud")}
          active={speaking}
          aria-pressed={speaking}
          onClick={() => (speaking ? stop() : speak(message.id, speakableText(message.content, t("chat.codeSpoken")), replyLocale))}
        >
          {speaking ? <StopIcon /> : <VolumeIcon />}
        </IconButton>
      )}
      {onRegenerate && (
        <IconButton size="sm" className="tap-pad" label={t("chat.regenerate")} onClick={onRegenerate}>
          <RefreshIcon />
        </IconButton>
      )}
      <IconButton
        size="sm"
        className="tap-pad"
        label={t("chat.flag")}
        onClick={() => showReport({ category: "wrongInfo", excerpt: stripRemembered(message.content) })}
      >
        <Flag aria-hidden="true" strokeWidth={1.85} />
      </IconButton>
    </>
  );
}

/** The last thing the student sent, opened for editing in place. */
function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const canSave = text.trim().length > 0 && text.trim() !== initial.trim();

  return (
    <form
      className="w-full max-w-[min(100%,40rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(text.trim());
      }}
    >
      <textarea
        ref={ref}
        value={text}
        aria-label={t("chat.editLabel")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSave) onSave(text.trim());
          }
        }}
        rows={2}
        className="input resize-none text-[length:var(--chat-text)] leading-relaxed"
      />
      <p className="mt-1.5 text-[12.5px] text-[var(--text-faint)]">{t("chat.editHint")}</p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          {t("action.cancel")}
        </button>
        <button type="submit" disabled={!canSave} className="btn btn-primary btn-sm">
          {t("chat.editSend")}
        </button>
      </div>
    </form>
  );
}

export function ChatMessages({
  messages,
  sources,
  activity,
  busy,
  replyLocale,
  lastAssistantId,
  actions,
  handlers,
}: {
  messages: AssistantMessage[];
  sources: Record<string, Source[]>;
  activity: ActivityState | null;
  busy: boolean;
  replyLocale: string;
  lastAssistantId?: string;
  /** The chips row for the newest reply, built by the caller. */
  actions: (message: AssistantMessage, tools: React.ReactNode) => React.ReactNode;
  handlers: ReplyHandlers;
}) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;
  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7 px-4 pb-6 pt-6 sm:px-6 sm:pt-8">
      {messages.map((m) => {
        if (m.role === "user") {
          const editable = m.id === lastUserId && !busy && handlers.onEdit !== undefined;
          return (
            <div key={m.id} className="group flex flex-col items-end">
              {m.attachments && m.attachments.length > 0 && (
                <div className="mb-2 flex max-w-[88%] flex-wrap justify-end gap-2">
                  {m.attachments.map((a) =>
                    a.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={a.dataUrl}
                        alt={a.name}
                        className="max-h-40 max-w-full rounded-[var(--radius)] border border-[var(--line)] object-cover sm:max-h-48"
                      />
                    ) : (
                      <span
                        key={a.id}
                        className="flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[13px] text-[var(--text-dim)]"
                      >
                        <FileIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{a.name}</span>
                      </span>
                    ),
                  )}
                </div>
              )}

              {editingId === m.id ? (
                <EditBox
                  initial={m.content}
                  onCancel={() => setEditingId(null)}
                  onSave={(text) => {
                    setEditingId(null);
                    handlers.onEdit?.(m.id, text);
                  }}
                />
              ) : (
                m.content && (
                  <div className="user-bubble max-w-[88%] sm:max-w-[80%]">
                    <MessageText content={m.content} />
                  </div>
                )
              )}

              {/* Copy under the student's own message too. Asking the same
                  question a different way means retyping it, and a long prompt
                  retyped from memory comes back shorter and vaguer. The tools
                  stay visible on a phone (no hover there) and fade in on
                  desktop. */}
              {editingId !== m.id && m.content && !m.error && (
                <div className="mt-1 flex items-center gap-0.5 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                  <CopyButton content={m.content} variant="icon" />
                  {editable && (
                    <IconButton size="sm" className="tap-pad" label={t("chat.edit")} onClick={() => setEditingId(m.id)}>
                      <PencilIcon />
                    </IconButton>
                  )}
                </div>
              )}
            </div>
          );
        }

        const isLast = m.id === lastId;
        const isNewestReply = m.id === lastAssistantId;

        return (
          <div key={m.id} className="flex gap-3">
            <Avatar live={m.streaming === true} />
            <div className="min-w-0 flex-1">
              {/* An error no longer hides the text. A reply that broke
                  mid-stream keeps everything that arrived and gets a notice
                  underneath; only a turn that failed before saying anything is
                  shown as a bare error box, because there it is genuinely all
                  there is. */}
              {m.error && !showsText(m) ? (
                <div role="alert" className="chat-error">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0 flex-1">{m.error}</p>
                  {isLast && handlers.onRegenerate && !busy && (
                    <button type="button" onClick={handlers.onRegenerate} className="btn btn-outline btn-sm shrink-0">
                      <RefreshIcon />
                      {t("action.retry")}
                    </button>
                  )}
                </div>
              ) : showsText(m) ? (
                <div className="text-[length:var(--chat-text)] text-[var(--text)]">
                  {/* --chat-text is the Appearance text-size setting. */}
                  <MessageText content={m.content} streaming={m.streaming} />
                  {/* Citations as their own block, below the prose — never
                      woven into the sentence, which is why the route sends
                      them as data in the first place. */}
                  {sources[m.id] && <Sources items={sources[m.id]} />}
                  {/* The cut-short notice. Quiet rather than alarming: what is
                      above it is a real, usable piece of an answer. "Continue"
                      is the way forward that matters — the text is already in
                      history, so Panda can pick the sentence back up instead of
                      making the student retype the question. */}
                  {isCutShort(m) && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-dim)]">
                      <span className="min-w-0 flex-1">{m.error}</span>
                      <button type="button" onClick={handlers.onContinue} disabled={busy} className="btn btn-outline btn-sm shrink-0">
                        {t("action.continue")}
                      </button>
                    </div>
                  )}
                  {/* Actions belong to finished replies. The chips sit under
                      the newest one only; older ones are history and keep
                      just the tools (copy, read aloud, flag). */}
                  {!m.streaming &&
                    (isNewestReply ? (
                      actions(m, <ReplyTools message={m} replyLocale={replyLocale} onRegenerate={!busy ? handlers.onRegenerate : undefined} />)
                    ) : (
                      <div className="mt-2 flex items-center gap-0.5">
                        <ReplyTools message={m} replyLocale={replyLocale} />
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* What Panda is doing before the first word lands. Stop lives in the
          composer now, where the send button was — one place for "go" and
          "stop", instead of a second pill down here. */}
      {activity && (
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="chat-avatar hidden sm:flex">
            <PandaSitting className="h-[34px] w-[27px]" bamboo={false} />
          </span>
          <Activity state={activity} />
        </div>
      )}
    </div>
  );
}
