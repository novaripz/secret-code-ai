"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  isCutShort,
  restoreAttachment,
  showsText,
  usableAsHistory,
  useAssistantStore,
  type AssistantMessage,
} from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { attachmentsToPromptText, type Attachment } from "@/lib/attachments";
import { useI18n } from "@/lib/i18n";
import { findLocale } from "@/lib/i18n/locales";
import { useInsightsStore } from "@/store/useInsightsStore";
import { NEUTRAL_ACTIONS, actionableFindings, signalFromAction, type Topic } from "@/lib/insights";
import { Priorities } from "@/components/home/Priorities";
import { ArrowUpIcon } from "@/components/icons";
import { Composer } from "./Composer";
import { ModePills } from "./ModePills";
import { MessageActions, actionPrompt, type MessageAction } from "./MessageActions";
import { buildSuggestions } from "./suggestions";
import { deriveFollowUps, type FollowUp } from "./followUps";
import { ActivityAnnouncer } from "./Activity";
import { ChatHero, ChatSuggestions } from "./ChatLanding";
import { ChatMessages } from "./ChatMessages";
import { ChatHeader } from "./ChatHeader";
import { runReply } from "./runner";
import { useReadAloud, useStopSpeakingOnUnmount } from "./speech";

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

/**
 * "Quiz me on this". Written as the student would say it, like the other
 * canned prompts, and specific about pacing: a quiz that dumps five questions
 * and their answers in one message is a worksheet with the key stapled on.
 */
const QUIZ_PROMPT =
  "Quiz me on what you just explained. Ask me 3 to 5 short practice questions, one at a time, and wait for my answer before the next one. Don't tell me the answers until I've tried.";

/**
 * The key the Watch tab (and anything else) leaves a draft under before
 * sending the student here: `{ text: string, newThread?: boolean }`. Read once
 * on arrival, put in the composer — never sent on the student's behalf — and
 * removed, so a reload does not paste it twice.
 */
const PENDING_DRAFT_KEY = "panda:pending-draft";

/** The handed-over draft, if there is a well-formed one waiting. */
function readPendingDraft(): { text: string; newThread: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text?: unknown; newThread?: unknown };
    if (typeof parsed.text !== "string") return null;
    return { text: parsed.text, newThread: parsed.newThread === true };
  } catch {
    return null;
  }
}

interface SendOptions {
  /** Sent with the message; defaults to none. The composer passes its own. */
  attachments?: Attachment[];
  simplify?: boolean;
  /** The student typed this, so it counts as their writing. Buttons don't. */
  typed?: boolean;
  /** Drop this message and everything after it first (edit, regenerate). */
  replaceFrom?: string;
}

export function AssistantChat() {
  // `useSearchParams` needs a Suspense boundary above it, or a prerendered
  // route bails out to client rendering all the way up to the nearest one.
  return (
    <Suspense fallback={null}>
      <ChatScreen />
    </Suspense>
  );
}

/** Desktop only: on a phone, focusing pops the keyboard over the greeting. */
function focusIfPointer(el: HTMLElement | null) {
  if (el && window.matchMedia("(pointer: fine)").matches) el.focus({ preventScroll: true });
}

function ChatScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("c");

  const activeThread = useAssistantStore((s) => s.activeThread);
  const hydrated = useAssistantStore((s) => s.hydrated);
  const hydrate = useAssistantStore((s) => s.hydrate);
  const openThread = useAssistantStore((s) => s.openThread);
  const newThread = useAssistantStore((s) => s.newThread);
  const stopRequest = useAssistantStore((s) => s.stopRequest);
  const sources = useAssistantStore((s) => s.sources);
  const activeId = activeThread?.id;
  // One "busy" for the open chat: from the moment it was sent until the stream
  // has closed. Composer, chips and edit all read this one flag.
  const busy = useAssistantStore((s) => !!(s.activeThread && s.pending[s.activeThread.id]));
  const activity = useAssistantStore((s) => (s.activeThread ? (s.activity[s.activeThread.id] ?? null) : null));

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

  // A draft handed over from elsewhere (see PENDING_DRAFT_KEY), read once as
  // the screen mounts so it is in the composer on the very first frame.
  const [draft] = useState(readPendingDraft);
  const [input, setInput] = useState(() => draft?.text ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Which chat the "jump to newest" button is showing for. Keyed by chat, so
  // opening another one hides it without anything having to reset it.
  const [jumpFor, setJumpFor] = useState<string | null>(null);
  const showJump = jumpFor !== null && jumpFor === activeThread?.id;
  const { stop: stopReading } = useReadAloud();
  useStopSpeakingOnUnmount();

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Loaded once, well before the first send, so the adaptation string can be
  // computed synchronously from memory when a message actually goes out.
  useEffect(() => {
    if (!insightsHydrated) void hydrateInsights();
  }, [insightsHydrated, hydrateInsights]);

  // ---- The address bar names the chat -------------------------------------
  //
  // Every chat link used to be "/", so a reload opened an empty chat and Back
  // never moved between conversations. Now `?c=<id>` is the open chat: a link
  // in the sidebar, Back and Forward, and a reload all go through here.
  useEffect(() => {
    if (!hydrated) return;
    if (requested) {
      if (useAssistantStore.getState().activeThread?.id === requested) return;
      let cancelled = false;
      void openThread(requested).then((found) => {
        // A link to a chat that is not on this device (deleted, or made on
        // another one) lands on a fresh chat rather than an error.
        if (!found && !cancelled) router.replace("/", { scroll: false });
      });
      return () => {
        cancelled = true;
      };
    }
    // No chat named: the student asked for a fresh one ("New chat", the
    // logo). One that is already fresh is kept rather than replaced.
    const current = useAssistantStore.getState().activeThread;
    if (current && current.messages.length > 0) newThread();
  }, [requested, hydrated, openThread, newThread, router]);

  // A new chat gets its address the moment it has something in it. Replace,
  // not push: Back from here should go to where the student was before, not to
  // the empty version of this same chat.
  const hasMessages = (activeThread?.messages.length ?? 0) > 0;
  useEffect(() => {
    if (!activeId || !hasMessages || requested === activeId) return;
    router.replace(`/?c=${activeId}`, { scroll: false });
    // `requested` is left out on purpose: this follows the store to the URL;
    // the effect above follows the URL to the store, and reacting to both
    // here would bounce between two chats during a switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, hasMessages, router]);

  // ---- A draft handed over from elsewhere ----------------------------------
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.removeItem(PENDING_DRAFT_KEY);
    } catch {
      // Nothing to clean up if storage is blocked.
    }
    if (draft.newThread) {
      newThread();
      if (requested) router.replace("/", { scroll: false });
    }
    // Focused on every device here, unlike the landing: the student pressed a
    // button that said "ask Panda", so the keyboard is what they came for.
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(raf);
    // Once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Scrolling ----------------------------------------------------------
  const messages = useMemo(() => activeThread?.messages ?? [], [activeThread]);
  const empty = messages.length === 0;
  // Total length changes on every chunk, so this runs as the reply grows.
  const streamedLength = messages.reduce((n, m) => n + m.content.length, 0);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // A small slack, so being a pixel or two off the bottom still counts.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = atBottom;
    setJumpFor(atBottom ? null : (activeThread?.id ?? null));
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setJumpFor(null);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // A different chat starts at its newest message, following along. It used
  // to inherit "the student scrolled up" from whichever chat was open before,
  // so a fresh conversation could open frozen halfway up.
  useEffect(() => {
    stickToBottom.current = true;
    stopReading();
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (useAssistantStore.getState().activeThread?.messages.length === 0) focusIfPointer(inputRef.current);
  }, [activeId, stopReading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    // `auto` rather than `smooth`: a smooth scroll retargeted many times a
    // second never settles and the view visibly lags the text.
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [streamedLength, messages.length, activity]);

  // ---- Sending ------------------------------------------------------------
  function send(text: string, opts: SendOptions = {}) {
    const store = useAssistantStore.getState();
    const current = store.activeThread;
    // One reply at a time per chat. Enter mid-reply used to start a second
    // request on top of the first and orphan the first one's Stop button.
    if (current && store.pending[current.id]) return;
    const typed = text.trim();
    const outgoing = opts.attachments ?? [];
    if (!typed && outgoing.length === 0) return;

    if (opts.replaceFrom) store.truncateFrom(opts.replaceFrom);
    // History is what came BEFORE this message. It used to be read after the
    // message was added and then trimmed with `.slice(-20, -1)` — which, for a
    // message with only an attachment (no text, so not in history at all),
    // cut Panda's previous reply instead.
    const before = useAssistantStore.getState().activeThread?.messages ?? [];
    const history = usableAsHistory(before)
      .slice(-19)
      .map((m) => ({ role: m.role, content: m.content }));

    useAssistantStore.getState().addUserMessage(typed, outgoing);
    const threadId = useAssistantStore.getState().activeThread?.id;
    if (!threadId) return;
    stickToBottom.current = true;
    setJumpFor(null);

    const insights = useInsightsStore.getState();
    // Only what the student typed themselves. A button's canned prompt is our
    // sentence, not theirs, and counting it would flatter the English estimate.
    if (opts.typed && typed) insights.noteWriting(typed);

    void runReply({
      threadId,
      prompt: [typed, attachmentsToPromptText(outgoing)].filter(Boolean).join("\n\n"),
      images: outgoing
        .filter((a) => a.kind === "image" && a.base64 && a.mimeType)
        .map((a) => ({ data: a.base64!, mimeType: a.mimeType! })),
      history,
      simplify: opts.simplify,
      explainMode: modes.explainMode,
      explainDepth: modes.explainDepth,
      replyLanguage,
      studentProfile: memoryBlock(),
      // Pure arithmetic over signals already in memory — no await, so this
      // adds nothing measurable before the request leaves.
      adaptation: insights.adaptation(),
      messages: { chatFailed: t("error.chatFailed"), emptyReply: t("error.emptyReply"), offline: t("error.offline") },
      // A student who says "my name is Santi, not S" has corrected Panda for
      // every future conversation. `addMemory` is the same list Settings shows
      // and lets them delete, which is what makes writing to it acceptable.
      onRemember: (facts) => facts.forEach((fact) => addMemory(fact, "chat")),
    });
  }

  function sendFromComposer() {
    const text = input;
    const outgoing = attachments;
    if (busy || (!text.trim() && outgoing.length === 0)) return;
    setInput("");
    setAttachments([]);
    send(text, { attachments: outgoing, typed: true });
  }

  /** The last thing the student sent, and the answer to it, asked again. */
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  function resend(message: AssistantMessage, text: string) {
    send(text, {
      attachments: message.attachments?.map(restoreAttachment),
      replaceFrom: message.id,
      typed: text !== message.content,
    });
  }

  // ---- What sits under the newest reply -----------------------------------
  const name = profileHydrated ? displayName() : "";
  // Actions belong on the newest reply only; older ones are history. A
  // cut-short reply still anchors them: it is the newest thing Panda said and
  // it is on screen. Only a turn with no text at all is skipped.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && showsText(m));
  // Chips derived from the reply they sit under. Memoised on the finished text
  // so the parse does not run on every token: while streaming this stays an
  // empty list — a chip about a numbered list is a lie until the list has
  // finished arriving. Cut short counts as unfinished too.
  const finishedReply =
    lastAssistant && !lastAssistant.streaming && !isCutShort(lastAssistant) ? lastAssistant.content : "";
  const followUps: FollowUp[] = useMemo(() => deriveFollowUps(finishedReply), [finishedReply]);

  // A link to a chat that is still being read off disk shows a quiet
  // placeholder rather than flashing the empty greeting first.
  const opening = !!requested && activeId !== requested;
  const landing = empty && !opening;

  return (
    // ONE composer, at the same place in the tree whether the chat is empty or
    // not. There used to be two — one under the greeting, one docked — so the
    // first send unmounted the textarea the student was typing in, dropped
    // focus, and on a phone closed the keyboard mid-thought.
    <div className={`relative flex h-full flex-col ${landing ? "overflow-y-auto" : ""}`}>
      <ActivityAnnouncer state={activity} />
      <ChatHeader />

      <div
        ref={landing ? undefined : scrollRef}
        onScroll={landing ? undefined : onScroll}
        className={landing ? "mt-auto shrink-0" : "min-h-0 flex-1 overflow-y-auto"}
      >
        {landing ? (
          <ChatHero name={name} />
        ) : opening ? (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-8 sm:px-6" aria-hidden="true">
            <div className="skeleton ms-auto h-10 w-1/2 rounded-[var(--radius-lg)]" />
            <div className="space-y-2.5">
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-4/5" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            sources={sources}
            activity={activity}
            busy={busy}
            replyLocale={replyLocale}
            lastAssistantId={lastAssistant?.id}
            handlers={{
              onContinue: () => send(CONTINUE_PROMPT),
              onRegenerate: lastUser ? () => resend(lastUser, lastUser.content) : undefined,
              onEdit: (id, text) => {
                const message = messages.find((m) => m.id === id);
                if (message) resend(message, text);
              },
            }}
            actions={(m, tools) => (
              <MessageActions
                replyLocale={replyLocale}
                showTranslate={replyLocale !== "en"}
                showHint={messages.length > 1}
                disabled={busy}
                followUps={followUps}
                tools={tools}
                onQuiz={isCutShort(m) ? undefined : () => send(QUIZ_PROMPT)}
                // Derived chips carry their own prompt and are not
                // MessageActions, so they deliberately bypass the insights
                // `record` below: we know the student asked about a formula,
                // which is curiosity, not the struggle signal that path scores.
                onFollowUp={(f: FollowUp) => send(f.prompt)}
                onAction={(action: MessageAction) => {
                  if (NEUTRAL_ACTIONS.includes(action)) {
                    useInsightsStore.getState().record(
                      signalFromAction(action, {
                        topic: GENERAL_TOPIC,
                        sessionId: activeThread?.id,
                      }),
                    );
                  }
                  send(actionPrompt(action, replyLanguage), {
                    simplify: action === "simplify" || action === "different",
                  });
                }}
              />
            )}
          />
        )}
      </div>

      {/* The dock. `pb` carries the home-indicator inset on top of its own
          padding, because `viewportFit: cover` means the bottom of the dvh box
          is under the indicator on a modern iPhone. */}
      <div className={landing ? "shrink-0 px-4" : "relative shrink-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-0 sm:pb-5"}>
        {showJump && !landing && (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label={t("chat.jumpToLatest")}
            title={t("chat.jumpToLatest")}
            className="jump-latest"
          >
            <ArrowUpIcon className="h-4 w-4 rotate-180" />
          </button>
        )}
        {/* Same width and inset as the messages above it, so the composer
            lines up with the text it continues. */}
        <div className={`mx-auto ${landing ? "max-w-2xl" : "max-w-3xl sm:px-6"}`}>
          <Composer
            inputRef={inputRef}
            value={input}
            onChange={setInput}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onSend={sendFromComposer}
            loading={busy}
            onStop={activeId ? () => stopRequest(activeId) : undefined}
            voiceLang={replyLocale}
            placeholder={t("chat.placeholder")}
            footer={landing ? <ModePills /> : undefined}
          />
        </div>
      </div>

      <div className={landing ? "mb-auto shrink-0 px-4 pb-10" : "hidden"}>
        {landing && (
          <>
            <Priorities />
            <ChatSuggestions suggestions={suggestions} onPick={(text) => send(text)} />
          </>
        )}
      </div>
    </div>
  );
}
