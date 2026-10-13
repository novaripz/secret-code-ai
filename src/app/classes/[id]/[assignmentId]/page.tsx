"use client";

import { use, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useFocusStore } from "@/store/useFocusStore";
import { accountScope } from "@/store/useAuthStore";
import { useI18n } from "@/lib/i18n";
import { findLocale } from "@/lib/i18n/locales";
import { streamChat, type StreamHandle } from "@/lib/ai/streamChat";
import { MessageText } from "@/components/chat/MessageText";
import { MessageActions, actionPrompt, type MessageAction } from "@/components/chat/MessageActions";
import { CopyButton } from "@/components/chat/CopyButton";
import { PandaSitting } from "@/components/Panda";
import { DEFAULT_RULES, type AssignmentRules } from "@/lib/school/types";
import { FOCUS_PRESETS } from "@/lib/school/focus";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  LockIcon,
  RefreshIcon,
  SendIcon,
  StarIcon,
  StopIcon,
  TimerIcon,
} from "@/components/icons";
import { useInsightsStore } from "@/store/useInsightsStore";
import { signalFromAction, signalFromText, topicForAssignment } from "@/lib/insights";
import { AssignmentResources } from "@/components/home/AssignmentResources";
import { Subtasks } from "@/components/home/Subtasks";
import { BackLink, DueBadge, LiftChip, PAGE_WIDTH } from "@/components/home/SchoolKit";
import { FocusPill, useFocusHydrated } from "@/components/home/FocusTimer";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { isDateOnly } from "@/lib/school/due";

// One assignment, with a Panda that can actually see it.
//
// This is the other half of the permission boundary: the chat here receives
// the assignment text and the teacher's rules, and the general chat never
// does. The rules are applied here rather than only being described to the
// model, so translation being switched off actually removes the button.
//
// The assignment stays in view. Its instructions, links and the student's own
// steps used to scroll away with the first message, which is exactly when a
// student needs to look back at what the question asked. On a wide screen they
// sit in a column beside the chat; on a phone they are a panel above it that
// folds away once the conversation starts, and opens again with one tap.
//
// The conversation is kept, per assignment, in this browser. Coming back to
// an essay the next evening and finding Panda had forgotten the outline the
// two of you agreed on was the commonest complaint about this page.

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
}

/** Enough to pick a conversation back up, small enough to never matter. */
const KEEP_MESSAGES = 40;

function chatKey(assignmentId: string) {
  return `sca:assignment-chat:v1${accountScope()}:${assignmentId}`;
}

function loadChat(assignmentId: string): Msg[] {
  try {
    const raw = window.localStorage.getItem(chatKey(assignmentId));
    const parsed = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ ...m, streaming: false }))
      : [];
  } catch {
    return [];
  }
}

function saveChat(assignmentId: string, messages: Msg[]) {
  try {
    const kept = messages.filter((m) => !m.streaming && (m.content || m.error)).slice(-KEEP_MESSAGES);
    if (kept.length === 0) window.localStorage.removeItem(chatKey(assignmentId));
    else window.localStorage.setItem(chatKey(assignmentId), JSON.stringify(kept));
  } catch {
    // Storage blocked or full. The conversation still works for this visit.
  }
}

/**
 * The deadline in plain English for the model: the day, and the time only
 * when there is a real one. The student's own language is for the screen;
 * the context the model reads is always English.
 */
function dueForModel(dueAt: number): string {
  const opts: Intl.DateTimeFormatOptions = isDateOnly(dueAt)
    ? { weekday: "long", month: "long", day: "numeric" }
    : { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" };
  return new Date(dueAt).toLocaleString("en-US", opts);
}

/** What the model is told about this assignment, rules included. */
function buildContext(
  title: string,
  className: string,
  instructions: string | undefined,
  dueText: string | null,
  rules: AssignmentRules,
  fromTeacher: boolean,
): string {
  const lines = [`Class: ${className}`, `Assignment: ${title}`];
  if (dueText) lines.push(`Due: ${dueText}`);
  if (instructions) lines.push(`\nWhat it asks for:\n${instructions}`);

  if (!fromTeacher) {
    // A student's own reminder has no teacher behind it, so there are no
    // teacher's rules to quote -- only the coaching default every chat has.
    lines.push("\nThe student added this assignment themselves. Teach the way you normally would: guide them rather than handing over finished work.");
    return lines.join("\n");
  }

  const teacher: string[] = [];
  if (rules.pandaInstructions) teacher.push(rules.pandaInstructions);
  if (rules.answers === "guided") {
    teacher.push("Do not give the final answer. Guide them to it.");
  } else if (rules.answers === "afterUnderstanding") {
    teacher.push("Reveal the answer only once they have shown they understand.");
  } else {
    teacher.push("Direct answers are allowed for this assignment.");
  }
  if (rules.translation === "disabled") {
    teacher.push("Translation is switched off here. Stay in the assignment's language, and say so plainly if asked.");
  }
  if (rules.simplification === "disabled") {
    teacher.push("Do not simplify the wording of the source text.");
  }
  if (rules.restrictionReason) teacher.push(`Reason given: ${rules.restrictionReason}`);

  lines.push(`\nTeacher's rules for this assignment:\n- ${teacher.join("\n- ")}`);
  return lines.join("\n");
}

/** The teacher's rules, said to the student. Every policy has its own sentence now. */
function RulesNotice({ rule }: { rule: AssignmentRules }) {
  const { t } = useI18n();
  const lines: string[] = [];
  if (rule.answers === "guided") lines.push(t("rules.guided"));
  if (rule.answers === "afterUnderstanding") lines.push(t("classes.ruleAfterUnderstanding"));
  if (rule.translation === "disabled") lines.push(t("rules.translationOff"));
  if (rule.simplification === "disabled") lines.push(t("rules.noSimplify"));
  if (lines.length === 0 && !rule.restrictionReason) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-ui border border-line bg-surface-1 px-3 py-2.5 text-[13px] leading-relaxed text-ink-dim">
      <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      <div className="min-w-0">
        <p className="font-[var(--weight-ui)] text-ink">{t("classes.rulesTitle")}</p>
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {rule.restrictionReason && <p className="mt-1 italic">{rule.restrictionReason}</p>}
      </div>
    </div>
  );
}

/** The composer: grows with what is typed, Enter sends, Shift+Enter is a new line. */
function Composer({ value, onChange, onSend, busy, onStop }: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; onStop: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="shrink-0 px-4 pb-4 pt-2 sm:px-6"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="composer-shell flex items-end gap-2 rounded-[22px] border bg-surface-1 py-1.5 pl-4 pr-1.5 shadow-ui-1">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={t("classes.chatPlaceholder")}
            aria-label={t("classes.chatPlaceholder")}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[length:var(--chat-text)] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          />
          {busy ? (
            <button type="button" onClick={onStop} aria-label={t("chat.stop")} title={t("chat.stop")} className="icon-btn mb-0.5 rounded-full bg-surface-3 text-ink">
              <StopIcon aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label={t("composer.send")}
              title={t("composer.send")}
              className="icon-btn mb-0.5 rounded-full bg-accent text-accent-contrast hover:!bg-accent-hover hover:!text-accent-contrast disabled:!bg-surface-3 disabled:!text-ink-faint disabled:!opacity-100"
            >
              <SendIcon aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-1.5 hidden text-center text-xs text-ink-faint md:block">{t("classes.chatHint")}</p>
      </div>
    </form>
  );
}

export default function AssignmentPage({ params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const { id, assignmentId } = use(params);
  const hydrated = useSchoolStore((s) => s.hydrated);
  const hydrate = useSchoolStore((s) => s.hydrate);
  const sync = useSchoolStore((s) => s.sync);
  const cls = useSchoolStore((s) => s.classes.find((c) => c.id === id));
  const assignment = useSchoolStore((s) => s.assignments.find((a) => a.id === assignmentId));
  const storedRule = useSchoolStore((s) => s.rules.find((r) => r.assignmentId === assignmentId));
  const setStatus = useSchoolStore((s) => s.setStatus);
  const profileModes = useProfileStore((s) => s.modes);
  const memoryBlock = useProfileStore((s) => s.memoryBlock);
  const languages = useProfileStore((s) => s.languages);
  const startFocus = useFocusStore((s) => s.start);
  const focusing = useFocusStore((s) => s.session !== null);
  const focusReady = useFocusHydrated();
  const { t } = useI18n();
  const insightsHydrated = useInsightsStore((s) => s.hydrated);
  const hydrateInsights = useInsightsStore((s) => s.hydrate);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const streamRef = useRef<StreamHandle | null>(null);
  // One chat session per visit to this page. Repetition inside one sitting is
  // much weaker evidence than the same trouble coming back another day, and the
  // aggregator can only tell those apart if we give it a session id.
  const sessionId = useRef(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Ahead of the first message, so the adaptation is readable from memory when
  // one is sent rather than awaited on the way out.
  useEffect(() => {
    if (!insightsHydrated) void hydrateInsights();
  }, [insightsHydrated, hydrateInsights]);

  // The saved conversation, read after mount so the server render and the
  // first client render agree. A conversation already under way starts with
  // the details folded on a phone; they are one tap away.
  useEffect(() => {
    const saved = loadChat(assignmentId);
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser storage once, after hydration */
    setMessages(saved);
    if (saved.length > 0) setDetailsOpen(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [assignmentId]);

  useEffect(() => {
    if (!busy) saveChat(assignmentId, messages);
  }, [assignmentId, messages, busy]);

  const fromTeacher = assignment?.origin === "school";
  const rule: AssignmentRules = storedRule ?? { assignmentId, ...DEFAULT_RULES };

  const replyLocale = languages.reply === "auto" ? languages.interface : languages.reply;
  const replyLanguage = findLocale(replyLocale)?.englishName ?? "English";

  const total = messages.reduce((n, m) => n + m.content.length, 0);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [total, messages.length]);

  function send(text: string, opts?: { simplify?: boolean; fromAction?: MessageAction }) {
    const prompt = text.trim();
    if (!prompt || busy || !assignment || !cls) return;

    setInput("");
    stick.current = true;
    if (messages.length === 0) setDetailsOpen(false);

    const insights = useInsightsStore.getState();
    // Here we have a topic a teacher would recognise: the assignment they set,
    // with its own title, rather than a subject guessed out of the chat.
    const topic = topicForAssignment(assignment, cls);
    if (!opts?.fromAction) {
      insights.noteWriting(prompt);
      insights.record(signalFromText(prompt, { topic, sessionId: sessionId.current }));
    }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: prompt };
    const replyId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: replyId, role: "assistant", content: "", streaming: true }]);
    setBusy(true);

    const history = messages
      .filter((m) => m.content && !m.error)
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    streamRef.current = streamChat(
      {
        prompt,
        history,
        studentProfile: memoryBlock(),
        explainMode: profileModes.explainMode,
        explainDepth: profileModes.explainDepth,
        // The teacher's answer policy chooses the mode; the student cannot
        // pick "answers" for an assignment set to guided.
        learningMode: fromTeacher && rule.answers === "allowed" ? "answers" : "coaching",
        simplify: rule.simplification === "disabled" ? false : opts?.simplify === true,
        replyLanguage,
        // Computed synchronously from signals already in state. Nothing on this
        // path awaits storage; time-to-first-token stays where it is.
        adaptation: insights.adaptation(),
        assignmentContext: buildContext(
          assignment.title,
          cls.name,
          assignment.instructions,
          assignment.dueAt !== null ? dueForModel(assignment.dueAt) : null,
          rule,
          fromTeacher,
        ),
      },
      {
        onChunk: (chunk) => setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content: m.content + chunk } : m))),
        onDone: (error) => {
          setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, streaming: false, error } : m)));
          setBusy(false);
          streamRef.current = null;
        },
      },
    );
  }

  const waiting = !hydrated || (!assignment && (sync.kind === "idle" || sync.kind === "syncing"));

  if (waiting) {
    return (
      <AppShell>
        <div className={PAGE_WIDTH}>
          <Skeleton className="mb-4 h-5 w-28" />
          <Skeleton className="h-8 w-3/4 max-w-md" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-8 h-40 w-full rounded-ui-lg" />
        </div>
      </AppShell>
    );
  }

  if (!cls || !assignment) {
    return (
      <AppShell>
        <div className={PAGE_WIDTH}>
          <BackLink href="/classes">{t("classes.title")}</BackLink>
          <EmptyState
            icon={<FileTextIcon />}
            title={t("classes.missingAssignmentTitle")}
            description={t("classes.missingAssignmentBody")}
            action={
              <Link href={cls ? `/classes/${cls.id}` : "/classes"} className="btn btn-secondary">
                {cls ? t("classes.backTo", { name: cls.name }) : t("classes.backToClasses")}
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  const done = assignment.status === "done";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.error && !m.streaming);
  const starters = [t("classes.starterExplain"), t("classes.starterPlan"), t("classes.starterCheck")];

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-line px-4 pb-4 pt-4 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <BackLink href={`/classes/${cls.id}`}>{cls.name}</BackLink>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl leading-snug tracking-tight text-ink sm:text-2xl">{assignment.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DueBadge dueAt={assignment.dueAt} done={done} />
                  {assignment.teacherPinned && !done && <LiftChip kind="pinned" />}
                  {assignment.points !== undefined && (
                    <span className="badge">
                      <StarIcon aria-hidden />
                      {t("assignments.points", { points: assignment.points })}
                    </span>
                  )}
                  {assignment.estimateMinutes !== undefined && (
                    <span className="badge">
                      <ClockIcon aria-hidden />
                      {t("plan.minutes", { minutes: assignment.estimateMinutes })}
                    </span>
                  )}
                  {fromTeacher && (
                    <span className="badge badge-accent">
                      <GraduationCapIcon aria-hidden />
                      {t("classes.fromTeacher")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {focusReady && focusing ? (
                  <FocusPill />
                ) : (
                  !done && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        startFocus({ kind: "focus", minutes: FOCUS_PRESETS.focus, title: assignment.title, assignmentId: assignment.id, classId: cls.id })
                      }
                    >
                      <TimerIcon aria-hidden />
                      {t("plan.startFocus")}
                    </button>
                  )
                )}
                {done ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="badge badge-success h-8 px-3 text-[13px]">
                      <CheckIcon aria-hidden />
                      {t("classes.markedDone")}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm tap" onClick={() => setStatus(assignment.id, "todo")}>
                      {t("classes.undo")}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm tap" onClick={() => setStatus(assignment.id, "done")}>
                    <CheckIcon aria-hidden />
                    {t("assignments.markDone")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]">
          {/* The assignment, kept in view. */}
          <aside
            aria-label={t("classes.detailsTitle")}
            className="shrink-0 border-b border-line bg-surface-0 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-l"
          >
            <button
              type="button"
              className="tap flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-[var(--weight-ui)] text-ink-dim hover:text-ink sm:px-6 lg:hidden"
              aria-expanded={detailsOpen}
              aria-controls="assignment-details"
              onClick={() => setDetailsOpen((v) => !v)}
            >
              <FileTextIcon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{t("classes.detailsTitle")}</span>
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            <div
              id="assignment-details"
              className={`${detailsOpen ? "flex" : "hidden"} max-h-[42vh] flex-col gap-5 overflow-y-auto px-4 pb-4 sm:px-6 lg:flex lg:max-h-none lg:overflow-visible lg:p-5`}
            >
              {fromTeacher && <RulesNotice rule={rule} />}
              <section>
                <h3 className="eyebrow">{t("classes.instructionsTitle")}</h3>
                {assignment.instructions ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">{assignment.instructions}</p>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-faint">{fromTeacher ? t("classes.noInstructionsSchool") : t("classes.noInstructionsOwn")}</p>
                )}
              </section>
              <AssignmentResources assignmentId={assignment.id} resources={assignment.resources} />
              <Subtasks assignmentId={assignment.id} />
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col lg:col-start-1 lg:row-start-1">
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <PandaSitting className="h-[110px] w-[88px]" />
                    <p className="max-w-sm text-[15px] leading-relaxed text-ink-dim">{t("classes.chatIntro")}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {starters.map((s) => (
                        <button key={s} type="button" className="chip tap" onClick={() => send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setMessages([])}
                      className="btn btn-ghost btn-sm"
                    >
                      <RefreshIcon aria-hidden />
                      {t("classes.chatClear")}
                    </button>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "flex flex-col items-end gap-1" : "flex gap-3"}>
                    {m.role === "assistant" && <PandaSitting className="h-[42px] w-[34px] shrink-0" bamboo={false} idle={!m.streaming} />}
                    <div className={m.role === "user" ? "max-w-[85%]" : "min-w-0 flex-1"}>
                      {m.error && !m.content ? (
                        <p className="rounded-ui-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{m.error}</p>
                      ) : (
                        <div
                          className={
                            m.role === "user"
                              ? "rounded-3xl bg-[var(--bubble-user)] px-4 py-2.5 text-[length:var(--chat-text)] leading-relaxed text-ink"
                              : "text-[length:var(--chat-text)] text-ink"
                          }
                        >
                          <MessageText content={m.content} streaming={m.streaming} />
                          {m.error && <p className="mt-3 rounded-ui border border-line bg-surface-2 px-3 py-2 text-sm text-ink-dim">{m.error}</p>}
                          {m.role === "assistant" && !m.streaming && <CopyButton content={m.content} />}
                          {m.role === "assistant" && m.id === lastAssistant?.id && (
                            <MessageActions
                              replyLocale={replyLocale}
                              showTranslate={rule.translation === "allowed" && replyLocale !== "en"}
                              showHint
                              disabled={busy}
                              onAction={(action: MessageAction) => {
                                useInsightsStore
                                  .getState()
                                  .record(signalFromAction(action, { topic: topicForAssignment(assignment, cls), sessionId: sessionId.current }));
                                send(actionPrompt(action, replyLanguage), {
                                  simplify: action === "simplify" || action === "different",
                                  fromAction: action,
                                });
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    {m.role === "user" && m.content && !m.error && <CopyButton content={m.content} variant="own" />}
                  </div>
                ))}
              </div>
            </div>

            <Composer value={input} onChange={setInput} onSend={() => send(input)} busy={busy} onStop={() => streamRef.current?.stop()} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
