"use client";

import { useEffect, useRef, useState } from "react";
import { useAssistantStore } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { attachmentsToPromptText, type Attachment } from "@/lib/attachments";
import { Composer } from "./Composer";
import { MessageText } from "./MessageText";
import { ModePills } from "./ModePills";
import { PandaSitting } from "@/components/Panda";
import { MessageActions, actionPrompt, type MessageAction } from "./MessageActions";
import { useI18n } from "@/lib/i18n";
import { Priorities } from "@/components/home/Priorities";
import { findLocale } from "@/lib/i18n/locales";
import { FileIcon } from "@/components/icons";

const STARTERS = [
  "How do I take a screenshot on my computer?",
  "Explain what an API is like I'm new to this",
  "Help me plan a website about something I like",
  "Check my work — I'll paste it in",
];


export function AssistantChat() {
  const {
    activeThread,
    loading,
    hydrate,
    hydrated,
    addUserMessage,
    addErrorMessage,
    setLoading,
    startAssistantMessage,
    appendToAssistantMessage,
    finishAssistantMessage,
  } = useAssistantStore();

  const modes = useProfileStore((s) => s.modes);
  const languages = useProfileStore((s) => s.languages);
  const { t } = useI18n();
  // "auto" means answer in whatever the interface is set to.
  const replyLocale = languages.reply === "auto" ? languages.interface : languages.reply;
  const replyLanguage = findLocale(replyLocale)?.englishName ?? "English";
  const memoryBlock = useProfileStore((s) => s.memoryBlock);
  const displayName = useProfileStore((s) => s.displayName);
  const profileHydrated = useProfileStore((s) => s.hydrated);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Held so the student can stop a reply that is going the wrong way.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const messages = activeThread?.messages ?? [];

  // Total length changes on every chunk, so this runs as the reply grows.
  const streamedLength = messages.reduce((n, m) => n + m.content.length, 0);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // A small slack, so being a pixel or two off the bottom still counts.
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    // `auto` rather than `smooth`: a smooth scroll retargeted many times a
    // second never settles and the view visibly lags the text.
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [streamedLength, messages.length, loading]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function send(promptOverride?: string, opts?: { simplify?: boolean }) {
    const typed = (promptOverride ?? input).trim();
    const outgoing = attachments;
    if ((!typed && outgoing.length === 0) || loading) return;

    setInput("");
    setAttachments([]);
    addUserMessage(typed, outgoing);
    setLoading(true);

    try {
      const attachedText = attachmentsToPromptText(outgoing);
      const prompt = [typed, attachedText].filter(Boolean).join("\n\n");

      const history = (useAssistantStore.getState().activeThread?.messages ?? [])
        .filter((m) => m.content && !m.error)
        .slice(-20, -1)
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/ai", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || "(the user sent attachments with no message)",
          chatOnly: true,
          stream: true,
          fileTree: "",
          contextFiles: {},
          history,
          explainMode: modes.explainMode,
          explainDepth: modes.explainDepth,
          learningMode: "coaching",
          simplify: opts?.simplify === true,
          replyLanguage,
          aiHomie: modes.aiHomie,
          humanize: modes.humanize,
          studentProfile: memoryBlock(),
          images: outgoing
            .filter((a) => a.kind === "image" && a.base64 && a.mimeType)
            .map((a) => ({ data: a.base64!, mimeType: a.mimeType! })),
        }),
      });

      if (!res.ok) {
        // A failure before the stream opens still comes back as JSON.
        const data = await res.json().catch(() => ({}));
        addErrorMessage(data.error ?? "That request didn't go through.");
        return;
      }

      if (!res.body) {
        addErrorMessage("The reply came back empty.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const id = startAssistantMessage();
      // The bubble exists now and text is about to land in it, so the waiting
      // dots have done their job.
      setLoading(false);

      let received = false;
      // Chunks can arrive faster than the screen refreshes. Coalesce whatever
      // lands within a frame into one update: fewer renders, and the fade
      // groups a few words instead of flickering per token. No artificial
      // delay is added — a frame is the display's own tick.
      let pending = "";
      let frame = 0;

      const flush = () => {
        frame = 0;
        if (!pending) return;
        appendToAssistantMessage(id, pending);
        pending = "";
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (!text) continue;
          received = true;
          pending += text;
          if (!frame) frame = requestAnimationFrame(flush);
        }
      } finally {
        if (frame) cancelAnimationFrame(frame);
        flush();
        appendToAssistantMessage(id, decoder.decode());
        finishAssistantMessage(id, received ? undefined : "The reply came back empty.");
      }
    } catch (err) {
      // Stopping on purpose is not an error; the partial reply stays as it is.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        addErrorMessage(err instanceof Error ? err.message : t("error.chatFailed"));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  const name = profileHydrated ? displayName() : "";
  const empty = messages.length === 0;
  // Actions belong on the newest reply only; older ones are history.
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant" && !m.error)?.id;
  const streaming = messages.some((m) => m.streaming);

  return (
    <div className="flex h-full flex-col">
      {empty ? (
        // Landing state: greeting and composer centered, like a fresh chat.
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl animate-rise">
            <div className="mb-5 flex justify-center">
              <PandaSitting className="h-[190px] w-[152px]" />
            </div>
            <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
              {name ? t("chat.greeting", { name }) : t("chat.greetingNoName")}
            </h1>

            <Composer
              autoFocus
              value={input}
              onChange={setInput}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onSend={() => void send()}
              loading={loading}
              placeholder={t("chat.placeholder")}
              footer={<ModePills />}
            />

            <Priorities />

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-full border border-[var(--line)] px-3.5 py-2 text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  {m.role === "assistant" && (
                    <PandaSitting
                      className="mr-3 h-[46px] w-[37px] shrink-0"
                      bamboo={false}
                      idle={m.streaming !== true}
                    />
                  )}
                  <div className={m.role === "user" ? "max-w-[85%]" : "min-w-0 flex-1"}>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap justify-end gap-2">
                        {m.attachments.map((a) =>
                          a.dataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={a.id}
                              src={a.dataUrl}
                              alt={a.name}
                              className="max-h-48 rounded-xl border border-[var(--line)] object-cover"
                            />
                          ) : (
                            <span
                              key={a.id}
                              className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-dim)]"
                            >
                              <FileIcon className="h-3.5 w-3.5" />
                              {a.name}
                            </span>
                          ),
                        )}
                      </div>
                    )}

                    {m.error ? (
                      <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                        {m.error}
                      </div>
                    ) : m.content ? (
                      <div
                        className={
                          m.role === "user"
                            ? "rounded-3xl bg-[var(--bubble-user)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)]"
                            : "text-[15px] text-[var(--text)]"
                        }
                      >
                        <MessageText content={m.content} streaming={m.streaming} />
                        {m.role === "assistant" && !m.streaming && m.id === lastAssistantId && (
                          <MessageActions
                            replyLocale={replyLocale}
                            showTranslate={replyLocale !== "en"}
                            showHint={messages.length > 1}
                            disabled={loading}
                            onAction={(action: MessageAction) =>
                              void send(actionPrompt(action, findLocale(replyLocale)?.englishName ?? "English"), {
                                simplify: action === "simplify" || action === "different",
                              })
                            }
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {(loading || streaming) && (
                <div className="flex items-center gap-3">
                  {loading && (
                    <div className="flex items-center gap-1.5 text-[var(--text-faint)]">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-current" />
                    </div>
                  )}
                  <button
                    onClick={stop}
                    className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  >
                    {t("chat.stop")}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 px-4 pb-5">
            <div className="mx-auto max-w-3xl">
              <Composer
                value={input}
                onChange={setInput}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                onSend={() => void send()}
                loading={loading}
                />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
