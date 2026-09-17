"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authHeader, authReady, deviceHeader } from "@/lib/security/device";
import { isCutShort, showsText, usableAsHistory, useAssistantStore } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { attachmentsToPromptText, type Attachment } from "@/lib/attachments";
import { Composer } from "./Composer";
import { MessageText } from "./MessageText";
import { ModePills } from "./ModePills";
import { PandaSitting } from "@/components/Panda";
import { MessageActions, actionPrompt, type MessageAction } from "./MessageActions";
import { useI18n } from "@/lib/i18n";
import { useInsightsStore } from "@/store/useInsightsStore";
import { NEUTRAL_ACTIONS, actionableFindings, signalFromAction, type Topic } from "@/lib/insights";
import { Priorities } from "@/components/home/Priorities";
import { findLocale } from "@/lib/i18n/locales";
import { FileIcon } from "@/components/icons";
import { buildSuggestions } from "./suggestions";
import { deriveFollowUps, type FollowUp } from "./followUps";
import { CopyButton } from "./CopyButton";
import { parseRemembered } from "./remember";
import { frameReader, type Source } from "./frames";
import { Activity, Sources, type ActivityState } from "./Activity";


/**
 * Personal Panda has no assignment and no class, so it has no honest topic.
 *
 * We still record the neutral buttons here — "translate" in particular, which
 * is the clearest statement a student can make that the English was the
 * obstacle, and which `estimateEnglishLevel` reads straight off the signals.
 * Neutral actions score zero points in the aggregator, so this topic can never
 * become a finding a teacher reads as "struggling with General chat".
 *
 * The struggle buttons (simplify, hint, different, example) are deliberately
 * NOT captured here. Pressing them in a chat about nothing in particular is
 * real, but we cannot say what it was about, and a finding labelled after the
 * surface the student happened to be on would be a topic we invented.
 */
const GENERAL_TOPIC: Topic = { id: "general", label: "General chat" };

/**
 * What the "Continue" button under a cut-short reply actually asks for.
 *
 * English like every other canned prompt in `actionPrompt` — the model is told
 * separately what language to answer in, and the student sees their own
 * language in the reply. It names the situation explicitly ("you stopped
 * partway") because the partial text is now in history: without that sentence
 * the model's most likely move is to start the whole explanation again, which
 * is the repetition this fix exists to avoid.
 */
const CONTINUE_PROMPT =
  "You stopped partway through that answer. Carry on from exactly where you stopped — do not start again or repeat what you already wrote.";

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
  const addMemory = useProfileStore((s) => s.addMemory);
  const displayName = useProfileStore((s) => s.displayName);
  const profileHydrated = useProfileStore((s) => s.hydrated);

  const insightsHydrated = useInsightsStore((s) => s.hydrated);
  const hydrateInsights = useInsightsStore((s) => s.hydrate);
  const signals = useInsightsStore((s) => s.signals);
  const insightsSummary = useInsightsStore((s) => s.summary);

  // Recomputed when a signal lands, not on every keystroke: `summary()` is
  // memoised inside the store, and subscribing to `signals` is what tells us
  // the memo can have moved. Before hydration finishes there is nothing stored
  // to read, so the chips start generic and quietly become personal a tick
  // later — better than holding the landing screen blank waiting on IndexedDB.
  const suggestions = useMemo(
    () => buildSuggestions(insightsHydrated ? actionableFindings(insightsSummary()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insightsHydrated, signals],
  );

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Held so the student can stop a reply that is going the wrong way.
  const abortRef = useRef<AbortController | null>(null);
  // What Panda is doing right now, or null when it is doing nothing. Set the
  // moment a message is sent rather than when the server first speaks, because
  // the wait the student complained about starts at the button, not at the
  // first byte.
  const [activity, setActivity] = useState<ActivityState | null>(null);
  // Citations, by the message they belong to. Kept in this component rather
  // than in the thread store because the stored message shape is owned
  // elsewhere; the cost is that sources are lost on reload, which is the right
  // trade for not reaching into another module's data model.
  const [sources, setSources] = useState<Record<string, Source[]>>({});

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Loaded once, well before the first send, so the adaptation string can be
  // computed synchronously from memory when a message actually goes out.
  useEffect(() => {
    if (!insightsHydrated) void hydrateInsights();
  }, [insightsHydrated, hydrateInsights]);

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
    setActivity({ phase: "thinking" });

    const insights = useInsightsStore.getState();
    // Only what the student typed themselves. A button's canned prompt is our
    // sentence, not theirs, and counting it would flatter the English estimate.
    if (!promptOverride && typed) insights.noteWriting(typed);

    try {
      const attachedText = attachmentsToPromptText(outgoing);
      const prompt = [typed, attachedText].filter(Boolean).join("\n\n");

      // Partial answers count. They were really shown to the student, so
      // leaving them out is what made Panda repeat or contradict itself on the
      // next turn; `usableAsHistory` keeps them and drops only the turns that
      // never said anything. See the comment on it for the full reasoning.
      const history = usableAsHistory(useAssistantStore.getState().activeThread?.messages ?? [])
        .slice(-20, -1)
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      await authReady();

      const res = await fetch("/api/ai", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...deviceHeader(), ...authHeader() },
        body: JSON.stringify({
          prompt: prompt || "(the user sent attachments with no message)",
          chatOnly: true,
          stream: true,
          // Opt into the framed (newline-delimited JSON) stream. Without this
          // the route writes raw prose and there is no channel for progress —
          // and, on a deployment with search configured, no tool calling
          // either, precisely because a client that cannot draw progress
          // should not be made to wait through an invisible round-trip.
          events: true,
          fileTree: "",
          contextFiles: {},
          history,
          explainMode: modes.explainMode,
          explainDepth: modes.explainDepth,
          learningMode: "coaching",
          simplify: opts?.simplify === true,
          replyLanguage,
          studentProfile: memoryBlock(),
          // Pure arithmetic over signals already in memory — no await, so this
          // adds nothing measurable before the request leaves.
          adaptation: insights.adaptation(),
          images: outgoing
            .filter((a) => a.kind === "image" && a.base64 && a.mimeType)
            .map((a) => ({ data: a.base64!, mimeType: a.mimeType! })),
        }),
      });

      if (!res.ok) {
        // A failure before the stream opens still comes back as JSON.
        const data = await res.json().catch(() => ({}));
        addErrorMessage(data.error ?? t("error.chatFailed"));
        return;
      }

      if (!res.body) {
        addErrorMessage(t("error.emptyReply"));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const frames = frameReader();
      const id = startAssistantMessage();
      // The bubble exists now, but nothing has landed in it yet. The waiting
      // state stays up and is driven by the stream from here on — it is the
      // status line, not `loading`, that tells the student what is happening.
      setLoading(false);

      // Only text counts as a reply. A stream that carried nothing but a
      // status frame and then closed is an empty answer, however many bytes
      // crossed the wire.
      let received = false;
      let failure: string | undefined;

      // Chunks can arrive faster than the screen refreshes. Coalesce whatever
      // lands within a frame into one update: fewer renders, and the fade
      // groups a few words instead of flickering per token. No artificial
      // delay is added — a frame is the display's own tick.
      let pending = "";
      let raf = 0;

      const flush = () => {
        raf = 0;
        if (!pending) return;
        appendToAssistantMessage(id, pending);
        pending = "";
      };

      const handle = (frame: ReturnType<typeof frames.push>[number]) => {
        if (frame.t === "text") {
          // The first token is the end of the wait, so the indicator goes
          // here and not in a timeout: it clears on the same event that gives
          // the student something to read, and can never linger over prose.
          if (!received) {
            received = true;
            setActivity(null);
          }
          pending += frame.v;
          if (!raf) raf = requestAnimationFrame(flush);
          return;
        }
        if (frame.t === "status") {
          // Late status frames are ignored once text is flowing. The server
          // drains its queue as it streams, so a search that finished before
          // the first word can otherwise arrive after it and reinstate a
          // spinner over an answer already being written.
          if (!received) {
            setActivity({ phase: frame.phase, query: frame.query, count: frame.count, reason: frame.reason });
          }
          return;
        }
        if (frame.t === "sources") {
          setSources((prev) => ({ ...prev, [id]: frame.items }));
          return;
        }
        // An error frame is prose the route already wrote for a student, and
        // it is terminal: whatever text arrived stays, and this is what the
        // bubble reports when the stream closes.
        failure = frame.message;
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (!text) continue;
          for (const frame of frames.push(text)) handle(frame);
        }
      } finally {
        if (raf) cancelAnimationFrame(raf);
        // The decoder's tail can complete a multi-byte character that ends the
        // last line, so it is pushed through the splitter before the splitter
        // is asked for its own leftovers.
        for (const frame of frames.push(decoder.decode())) handle(frame);
        for (const frame of frames.end()) handle(frame);
        flush();
        // Whatever happened — finished, errored, or stopped mid-sentence —
        // the indicator comes down here. This is the one path every ending
        // goes through, which is what stops a spinner outliving its stream.
        setActivity(null);
        // Stopping on purpose is a choice, not an error — the same rule
        // `streamChat.ts` already applies to the assignment chat, followed here
        // rather than inventing a second answer to the same question. The
        // check has to happen in this `finally` and not in the outer `catch`,
        // because aborting rejects `reader.read()` and this block runs first:
        // reading `received` alone recorded a student pressing Stop before the
        // first token as "The reply came back empty." in a red box.
        const stopped = controller.signal.aborted;
        finishAssistantMessage(
          id,
          failure ?? (received || stopped ? undefined : t("error.emptyReply")),
        );

        // A student who says "my name is Santi, not S" has corrected Panda for
        // every future conversation, not just this one. The model marks the
        // durable fact itself; we only store what it marked, and only from a
        // reply that actually finished, so an aborted stream cannot half-write
        // a fact. `addMemory` is the same list Settings shows and lets them
        // delete, which is what makes writing to it acceptable at all.
        const finished =
          useAssistantStore.getState().activeThread?.messages.find((m) => m.id === id)?.content ?? "";
        for (const fact of parseRemembered(finished)) addMemory(fact, "chat");
      }
    } catch (err) {
      // Stopping on purpose is not an error; the partial reply stays as it is.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        addErrorMessage(err instanceof Error ? err.message : t("error.chatFailed"));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      // Belt and braces for the paths that never reached the stream at all —
      // a non-OK response, a thrown fetch. A stuck "Thinking" with no stream
      // behind it is the exact failure this feature exists to remove.
      setActivity(null);
    }
  }

  const name = profileHydrated ? displayName() : "";
  const empty = messages.length === 0;
  // Actions belong on the newest reply only; older ones are history.
  // A cut-short reply still anchors the actions: it is the newest thing Panda
  // said and it is on screen, so hanging "Explain another way" under the reply
  // above it would point the student at the wrong paragraph. Only a turn with
  // no text at all is skipped, since there is nothing there to act on.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && showsText(m));
  const lastAssistantId = lastAssistant?.id;
  const streaming = messages.some((m) => m.streaming);

  // Chips derived from the reply they sit under. Memoised on the finished text
  // so the parse does not run on every token: while `streaming` is true this
  // stays an empty list, which is also the answer to "what shows mid-stream" —
  // nothing, because a chip about a numbered list is a lie until the list has
  // finished arriving.
  // Cut short counts as unfinished here too: a chip like "Where's that formula
  // from?" derived from half an explanation asks about something the student
  // was never actually told.
  const finishedReply =
    lastAssistant && !lastAssistant.streaming && !isCutShort(lastAssistant) ? lastAssistant.content : "";
  const followUps: FollowUp[] = useMemo(() => deriveFollowUps(finishedReply), [finishedReply]);

  return (
    <div className="flex h-full flex-col">
      {empty ? (
        // Landing state: greeting and composer centered, like a fresh chat.
        // `overflow-y-auto` and `justify-center` together, on purpose: the
        // greeting stays optically centred while there is room, and the moment
        // the keyboard halves the screen the whole landing state becomes
        // scrollable instead of clipping the panda and the suggestion chips.
        // A centred flex child with no scroller is the classic way to make
        // content unreachable rather than merely cramped.
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-6">
          <div className="w-full max-w-2xl animate-rise">
            <div className="mb-4 flex justify-center sm:mb-5">
              <PandaSitting className="h-[130px] w-[104px] sm:h-[190px] sm:w-[152px]" />
            </div>
            <h1 className="mb-6 text-center text-[28px] font-semibold tracking-tight text-[var(--text)] sm:mb-8 sm:text-4xl">
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

            <div className="mt-6 flex flex-wrap justify-center gap-2 sm:mt-8" aria-label={t("chat.suggestionsLabel")} role="group">
              {suggestions.map((s) => {
                const text = t(s.key, s.vars);
                return (
                  <button
                    key={s.id}
                    onClick={() => void send(text)}
                    aria-label={text}
                    className="tap inline-flex items-center rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:px-3.5 md:text-xs"
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-6 overflow-x-hidden px-3 py-6 sm:px-4 sm:py-8">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  {m.role === "assistant" && (
                    <PandaSitting
                      className="mr-1.5 h-[34px] w-[27px] shrink-0 sm:mr-3 sm:h-[46px] sm:w-[37px]"
                      bamboo={false}
                      idle={m.streaming !== true}
                    />
                  )}
                  <div className={m.role === "user" ? "min-w-0 max-w-[88%] sm:max-w-[85%]" : "min-w-0 flex-1"}>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap justify-end gap-2">
                        {m.attachments.map((a) =>
                          a.dataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={a.id}
                              src={a.dataUrl}
                              alt={a.name}
                              className="max-h-40 max-w-full rounded-xl border border-[var(--line)] object-cover sm:max-h-48"
                            />
                          ) : (
                            <span
                              key={a.id}
                              className="flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--text-dim)] md:text-xs"
                            >
                              <FileIcon className="h-3.5 w-3.5" />
                              {a.name}
                            </span>
                          ),
                        )}
                      </div>
                    )}

                    {/* An error no longer hides the text. A reply that broke
                        mid-stream keeps everything that arrived and gets a
                        notice underneath; only a turn that failed before
                        saying anything is shown as a bare error box, because
                        there it is genuinely all there is. */}
                    {m.error && !showsText(m) ? (
                      <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                        {m.error}
                      </div>
                    ) : showsText(m) ? (
                      <div
                        className={
                          // --chat-text is the Appearance text-size setting.
                          // It was declared in globals.css and never consumed,
                          // so the small/large choice did nothing to the one
                          // surface it names; the weight pass is the moment to
                          // hook it up rather than hard-code 15px again.
                          m.role === "user"
                            ? "rounded-3xl bg-[var(--bubble-user)] px-4 py-2.5 text-[length:var(--chat-text)] leading-relaxed text-[var(--text)]"
                            : "text-[length:var(--chat-text)] text-[var(--text)]"
                        }
                      >
                        <MessageText content={m.content} streaming={m.streaming} />
                        {/* Copy sits on every finished reply, not just the
                            newest: the answer a student wants in their notes is
                            usually a few turns back by the time they decide to
                            keep it. Never while streaming — half a reply
                            copied silently is worse than no button. */}
                        {/* Citations as their own block, below the prose —
                            never woven into the sentence, which is why the
                            route sends them as data in the first place. */}
                        {m.role === "assistant" && sources[m.id] && <Sources items={sources[m.id]} />}
                        {/* The cut-short notice. Quiet rather than alarming:
                            what is above it is a real, usable piece of an
                            answer, and a red box over the top would tell the
                            student to distrust text that is perfectly good as
                            far as it goes. "Continue" is the way forward that
                            matters — the text is already in history, so Panda
                            can pick the sentence back up instead of making the
                            student retype the question and read it all again.
                            A silent auto-retry was rejected: the chain does not
                            replay words already read, so it would land the
                            student in the middle of a second, different
                            explanation with no idea why. */}
                        {isCutShort(m) && (
                          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-dim)]">
                            <span className="min-w-0 flex-1">{m.error}</span>
                            <button
                              onClick={() => void send(CONTINUE_PROMPT)}
                              disabled={loading}
                              className="tap inline-flex shrink-0 items-center rounded-full border border-[var(--line-strong)] px-3.5 py-1.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface)] disabled:opacity-50 md:text-xs"
                            >
                              {t("action.continue")}
                            </button>
                          </div>
                        )}
                        {m.role === "assistant" && !m.streaming && <CopyButton content={m.content} />}
                        {m.role === "assistant" && !m.streaming && m.id === lastAssistantId && (
                          <MessageActions
                            replyLocale={replyLocale}
                            showTranslate={replyLocale !== "en"}
                            showHint={messages.length > 1}
                            disabled={loading}
                            followUps={followUps}
                            // Derived chips carry their own prompt and are not
                            // MessageActions, so they deliberately bypass the
                            // insights `record` above: we know the student
                            // asked about a formula, which is curiosity, not
                            // the struggle signal that path is scored for.
                            onFollowUp={(f: FollowUp) => void send(f.prompt)}
                            onAction={(action: MessageAction) => {
                              if (NEUTRAL_ACTIONS.includes(action)) {
                                useInsightsStore.getState().record(
                                  signalFromAction(action, {
                                    topic: GENERAL_TOPIC,
                                    sessionId: activeThread?.id,
                                  }),
                                );
                              }
                              void send(actionPrompt(action, findLocale(replyLocale)?.englishName ?? "English"), {
                                simplify: action === "simplify" || action === "different",
                              });
                            }}
                          />
                        )}
                      </div>
                    ) : null}

                    {/* Copy under the student's own message too. Asking the
                        same question a different way means retyping it, and a
                        long prompt retyped from memory comes back shorter and
                        vaguer — which is usually why the second answer is
                        worse than the first. Not shown on an errored turn:
                        there is nothing there to copy. */}
                    {m.role === "user" && m.content && !m.error && (
                      <CopyButton content={m.content} variant="own" />
                    )}
                  </div>
                </div>
              ))}

              {(loading || streaming || activity) && (
                <div className="flex flex-wrap items-center gap-3">
                  {/* Replaces the three bouncing dots. The dots were the same
                      shape whether Panda was composing a sentence or waiting
                      on a web search, which is what made the wait feel like a
                      hang. */}
                  <Activity state={activity} />
                  <button
                    onClick={stop}
                    className="tap inline-flex items-center rounded-full border border-[var(--line-strong)] px-4 py-1.5 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:px-3 md:text-xs"
                  >
                    {t("chat.stop")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* The dock. `pb` carries the home-indicator inset on top of its own
              padding, because `viewportFit: cover` means the bottom of the dvh
              box is under the indicator on a modern iPhone. */}
          <div className="shrink-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4 sm:pb-5">
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
