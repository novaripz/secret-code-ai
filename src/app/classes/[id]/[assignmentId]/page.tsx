"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useSchoolStore } from "@/store/useSchoolStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useI18n } from "@/lib/i18n";
import { findLocale } from "@/lib/i18n/locales";
import { streamChat, type StreamHandle } from "@/lib/ai/streamChat";
import { MessageText } from "@/components/chat/MessageText";
import { MessageActions, actionPrompt, type MessageAction } from "@/components/chat/MessageActions";
import { PandaSitting } from "@/components/Panda";
import { dueLabel } from "../../page";
import { isOverdue, type AssignmentRules } from "@/lib/school/types";
import { LockIcon, SendIcon } from "@/components/icons";

// One assignment, with a Panda that can actually see it.
//
// This is the other half of the permission boundary: the chat here receives
// the assignment text and the teacher's rules, and the general chat never
// does. The rules are applied here rather than only being described to the
// model, so translation being switched off actually removes the button.

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
}

/** What the model is told about this assignment, rules included. */
function buildContext(
  title: string,
  className: string,
  instructions: string | undefined,
  dueAt: number | null,
  rules: AssignmentRules,
): string {
  const lines = [`Class: ${className}`, `Assignment: ${title}`];
  if (dueAt !== null) lines.push(`Due: ${new Date(dueAt).toDateString()}`);
  if (instructions) lines.push(`\nWhat it asks for:\n${instructions}`);

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

export default function AssignmentPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id, assignmentId } = use(params);
  const { hydrated, hydrate, classes, assignments, rules, setStatus } = useSchoolStore();
  const profileModes = useProfileStore((s) => s.modes);
  const memoryBlock = useProfileStore((s) => s.memoryBlock);
  const languages = useProfileStore((s) => s.languages);
  const { t } = useI18n();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<StreamHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const cls = classes.find((c) => c.id === id);
  const assignment = assignments.find((a) => a.id === assignmentId);
  const rule = rules.find((r) => r.assignmentId === assignmentId) ?? {
    assignmentId,
    answers: "guided" as const,
    translation: "allowed" as const,
    simplification: "allowed" as const,
  };

  const replyLocale = languages.reply === "auto" ? languages.interface : languages.reply;
  const replyLanguage = findLocale(replyLocale)?.englishName ?? "English";

  const total = messages.reduce((n, m) => n + m.content.length, 0);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [total, messages.length]);

  function send(text: string, opts?: { simplify?: boolean }) {
    const prompt = text.trim();
    if (!prompt || busy || !assignment || !cls) return;

    setInput("");
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: prompt };
    const replyId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: replyId, role: "assistant", content: "", streaming: true }]);
    setBusy(true);

    const history = messages.filter((m) => m.content && !m.error).slice(-16).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    streamRef.current = streamChat(
      {
        prompt,
        history,
        studentProfile: memoryBlock(),
        explainMode: profileModes.explainMode,
        explainDepth: profileModes.explainDepth,
        humanize: profileModes.humanize,
        aiHomie: profileModes.aiHomie,
        // The teacher's answer policy chooses the mode; the student cannot
        // pick "answers" for an assignment set to guided.
        learningMode: rule.answers === "allowed" ? "answers" : "coaching",
        simplify: rule.simplification === "disabled" ? false : opts?.simplify === true,
        replyLanguage,
        assignmentContext: buildContext(
          assignment.title,
          cls.name,
          assignment.instructions,
          assignment.dueAt,
          rule,
        ),
      },
      {
        onChunk: (chunk) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, content: m.content + chunk } : m)),
          ),
        onDone: (error) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, streaming: false, error } : m)),
          );
          setBusy(false);
          streamRef.current = null;
        },
      },
    );
  }

  if (!hydrated) {
    return <AppShell><p className="p-8 text-sm text-[var(--text-faint)]">{t("empty.loading")}</p></AppShell>;
  }

  if (!cls || !assignment) {
    return (
      <AppShell>
        <div className="p-8">
          <p className="text-sm text-[var(--text-dim)]">{t("empty.unavailable")}</p>
          <Link href="/classes" className="mt-3 inline-block text-sm underline">{t("classes.title")}</Link>
        </div>
      </AppShell>
    );
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.error && !m.streaming);
  const restricted = rule.translation === "disabled" || rule.simplification === "disabled" || rule.answers !== "allowed";

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
          <div className="mx-auto w-full max-w-3xl">
            <Link href={`/classes/${cls.id}`} className="text-xs text-[var(--text-faint)] hover:text-[var(--text-dim)]">
              ← {cls.name}
            </Link>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-[var(--text)]">{assignment.title}</h1>

            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--text-faint)]">
              {assignment.dueAt !== null && (
                <span className={isOverdue(assignment) ? "text-[var(--danger)]" : ""}>
                  {dueLabel(assignment.dueAt, t)}
                </span>
              )}
              {assignment.points !== undefined && <span>{t("assignments.points", { points: assignment.points })}</span>}
              <button
                onClick={() => setStatus(assignment.id, assignment.status === "done" ? "todo" : "done")}
                className="rounded-full border border-[var(--line-strong)] px-2.5 py-1 transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                {assignment.status === "done" ? t("assignments.done") : t("assignments.markDone")}
              </button>
            </div>

            {restricted && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3 py-2 text-xs leading-relaxed text-[var(--text-faint)]">
                <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {rule.answers === "guided" && "Panda will guide you rather than hand over the answer. "}
                  {rule.translation === "disabled" && "Translation is off for this one. "}
                  {rule.simplification === "disabled" && "The wording can't be simplified here. "}
                  {rule.restrictionReason}
                </span>
              </p>
            )}
          </div>
        </div>

        <div ref={scrollRef} onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
            {assignment.instructions && messages.length === 0 && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-4">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  What it asks for
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-dim)]">
                  {assignment.instructions}
                </p>
              </div>
            )}

            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <PandaSitting className="h-[120px] w-[96px]" />
                <p className="max-w-sm text-sm text-[var(--text-faint)]">
                  Panda can see this assignment. Ask what it means, or show it what you&apos;ve got.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex gap-3"}>
                {m.role === "assistant" && (
                  <PandaSitting className="h-[42px] w-[34px] shrink-0" bamboo={false} idle={!m.streaming} />
                )}
                <div className={m.role === "user" ? "max-w-[85%]" : "min-w-0 flex-1"}>
                  {m.error ? (
                    <p className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                      {m.error}
                    </p>
                  ) : (
                    <div
                      className={
                        m.role === "user"
                          ? "rounded-3xl bg-[var(--bubble-user)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)]"
                          : "text-[15px] text-[var(--text)]"
                      }
                    >
                      <MessageText content={m.content} streaming={m.streaming} />
                      {m.role === "assistant" && m.id === lastAssistant?.id && (
                        <MessageActions
                          replyLocale={replyLocale}
                          showTranslate={rule.translation === "allowed" && replyLocale !== "en"}
                          showHint
                          disabled={busy}
                          onAction={(action: MessageAction) =>
                            send(actionPrompt(action, replyLanguage), {
                              simplify: action === "simplify" || action === "different",
                            })
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <button
                onClick={() => streamRef.current?.stop()}
                className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
              >
                {t("chat.stop")}
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto w-full max-w-3xl"
          >
            <div className="flex items-center gap-2 rounded-3xl border border-[var(--line-strong)] bg-[var(--surface-1)] py-2 pl-5 pr-2 focus-within:border-[var(--focus)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("chat.placeholder")}
                aria-label={t("chat.placeholder")}
                className="flex-1 bg-transparent py-2 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-30"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
