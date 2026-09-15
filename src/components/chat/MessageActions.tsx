"use client";

import { useI18n } from "@/lib/i18n";
import { findLocale } from "@/lib/i18n/locales";

// The row of follow-ups under an assistant reply.
//
// Only what is useful right now is shown. Translate appears only when the
// student reads another language, and "check my work" only once there is a
// conversation worth checking — a row of eight buttons under every message is
// noise, and noise gets ignored.

export type MessageAction =
  | "simplify"
  | "translate"
  | "hint"
  | "different"
  | "check"
  | "example";

export function MessageActions({
  onAction,
  replyLocale,
  showTranslate,
  showHint,
  disabled,
}: {
  onAction: (action: MessageAction) => void;
  replyLocale: string;
  showTranslate: boolean;
  showHint: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const language = findLocale(replyLocale)?.nativeName ?? replyLocale;

  const actions: { key: MessageAction; label: string; show: boolean }[] = [
    { key: "simplify", label: `🤔 ${t("chat.dontUnderstand")}`, show: true },
    { key: "translate", label: `🌐 ${t("chat.translate", { language })}`, show: showTranslate },
    { key: "hint", label: `💡 ${t("chat.hint")}`, show: showHint },
    { key: "different", label: `🧠 ${t("chat.explainDifferently")}`, show: true },
    { key: "check", label: `✏️ ${t("chat.checkMyWork")}`, show: true },
    { key: "example", label: `📖 ${t("chat.example")}`, show: false },
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-2 sm:gap-1.5">
      {actions
        .filter((a) => a.show)
        .map((a) => (
          <button
            key={a.key}
            onClick={() => onAction(a.key)}
            disabled={disabled}
            // These are the buttons a stuck student reaches for, so they are
            // the last thing that should be fiddly. 44px tall and 14px type on
            // a phone; the old 30px/12px read fine at desk distance and not at
            // all at arm's length on a bus.
            className="tap inline-flex items-center rounded-full border border-[var(--line)] px-4 py-1.5 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40 sm:px-3 md:text-xs"
          >
            {a.label}
          </button>
        ))}
    </div>
  );
}

/**
 * What pressing an action actually sends.
 *
 * These are written as the student would say them, because they land in the
 * transcript as the student's turn — a follow-up should read like part of the
 * conversation, not like the UI talking to itself.
 */
export function actionPrompt(action: MessageAction, language: string): string {
  switch (action) {
    case "simplify":
      return "I don't understand that. Say it in a simpler way — same idea, easier words.";
    case "translate":
      return `Say that again in ${language}.`;
    case "hint":
      return "Give me a hint, not the answer.";
    case "different":
      return "Explain that a different way. Not the same explanation reworded.";
    case "check":
      return "Check my work and tell me the first thing that's wrong, not everything.";
    case "example":
      return "Show me an example.";
  }
}
