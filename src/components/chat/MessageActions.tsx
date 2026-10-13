"use client";

import type { ReactNode } from "react";
import { ListChecks, Shuffle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { findLocale } from "@/lib/i18n/locales";
import {
  BookIcon,
  ChatIcon,
  CircleCheckIcon,
  CodeIcon,
  HelpIcon,
  LanguagesIcon,
  LightbulbIcon,
  ListIcon,
  SigmaIcon,
} from "@/components/icons";
import type { FollowUp } from "./followUps";

// The row of follow-ups under an assistant reply.
//
// Only what is useful right now is shown. Translate appears only when the
// student reads another language, and "check my work" only once there is a
// conversation worth checking — a row of eight buttons under every message is
// noise, and noise gets ignored.
//
// Most of the row is now derived from the reply above it (./followUps.ts), so
// the chips refer to the numbered list or the formula the student is actually
// looking at. Two rules survive that change unchanged, and both matter more
// than the new chips do:
//
//  1. "I don't understand" is always first and always present. It is the
//     single clearest thing a stuck student can say, and AssistantChat records
//     that press into the insights store as struggle evidence a teacher later
//     reads. Dropping it for a cleverer chip would not just cost a button, it
//     would quietly thin the data the teacher view is built on.
//  2. Derived chips are reported through their own callback and never pretend
//     to be a MessageAction, so the signal path above cannot mistake one for a
//     press it should score.
//
// With nothing derived — short reply, plain prose — the generic row is what
// comes back, byte for byte what shipped before. A generic chip is a fine
// thing to show; a fake-specific one is not.

export type MessageAction =
  | "simplify"
  | "translate"
  | "hint"
  | "different"
  | "check"
  | "example";

/** Four chips is a row; more is a menu nobody reads. */
const MAX_CHIPS = 4;

// Icons, not emoji. The row used to lead every chip with an emoji, and a
// screen reader reads those out by name — "thinking face, I don't
// understand" — on every reply. The glyphs here are decorative, so the chip
// is announced as just its words.
const glyph = "h-4 w-4 shrink-0 md:h-3.5 md:w-3.5";
const ShuffleIcon = () => <Shuffle aria-hidden="true" strokeWidth={1.85} className={glyph} />;
const QuizIcon = () => <ListChecks aria-hidden="true" strokeWidth={1.85} className={glyph} />;

/** The glyph for a chip derived from the reply, by the kind of thing it names. */
function followUpIcon(id: string): ReactNode {
  switch (id) {
    case "term":
      return <BookIcon className={glyph} />;
    case "steps":
      return <ListIcon className={glyph} />;
    case "code":
      return <CodeIcon className={glyph} />;
    case "formula":
      return <SigmaIcon className={glyph} />;
    default:
      return <ChatIcon className={glyph} />;
  }
}

export function MessageActions({
  onAction,
  onFollowUp,
  followUps = [],
  replyLocale,
  showTranslate,
  showHint,
  disabled,
  onQuiz,
  tools,
}: {
  onAction: (action: MessageAction) => void;
  /**
   * A chip derived from this reply. Separate from `onAction` on purpose.
   *
   * Both of these are optional so the class-assignment chat, which renders
   * this same row and is not part of this work, keeps the generic four it has
   * always had rather than being half-migrated from a file it does not own.
   */
  onFollowUp?: (followUp: FollowUp) => void;
  followUps?: FollowUp[];
  replyLocale: string;
  showTranslate: boolean;
  showHint: boolean;
  disabled?: boolean;
  /**
   * "Quiz me on this". Not a MessageAction on purpose: asking to be tested is
   * the opposite of a struggle signal, and the insights path that scores
   * MessageActions must never count it as one. Pinned beside "I don't
   * understand" when given; the row stays four chips long.
   */
  onQuiz?: () => void;
  /** Icon buttons drawn at the end of the same row (copy, read aloud…). */
  tools?: ReactNode;
}) {
  const { t } = useI18n();
  const language = findLocale(replyLocale)?.nativeName ?? replyLocale;

  type Chip = { id: string; label: string; icon: ReactNode; onPress: () => void };

  // Order is priority, because the tail is what gets cut at MAX_CHIPS.
  // "I don't understand" is pinned at the front and so can never be cut.
  // Translate is next and is need-based rather than generic — it only renders
  // for a student reading a second language, and for them it is the most
  // useful button on screen. Then the derived chips, then the generic ones as
  // filler for a reply that earned none.
  const pinned: Chip[] = [
    {
      id: "simplify",
      label: t("chat.dontUnderstand"),
      icon: <HelpIcon className={glyph} />,
      onPress: () => onAction("simplify"),
    },
    ...(onQuiz ? [{ id: "quiz", label: t("chat.quizMe"), icon: <QuizIcon />, onPress: onQuiz }] : []),
  ];

  const optional: Chip[] = [
    ...(showTranslate
      ? [
          {
            id: "translate",
            label: t("chat.translate", { language }),
            icon: <LanguagesIcon className={glyph} />,
            onPress: () => onAction("translate"),
          },
        ]
      : []),
    // The label is translated because it is UI text; the prompt it sends is
    // not, and the term interpolated into it stays in whatever language the
    // reply used, which is the language the student just read it in.
    ...(onFollowUp ? followUps : []).map((f) => ({
      id: `derived:${f.id}`,
      label: t(f.key, f.vars),
      icon: followUpIcon(f.id),
      onPress: () => onFollowUp?.(f),
    })),
    { id: "different", label: t("chat.explainDifferently"), icon: <ShuffleIcon />, onPress: () => onAction("different") },
    ...(showHint
      ? [{ id: "hint", label: t("chat.hint"), icon: <LightbulbIcon className={glyph} />, onPress: () => onAction("hint") }]
      : []),
    { id: "check", label: t("chat.checkMyWork"), icon: <CircleCheckIcon className={glyph} />, onPress: () => onAction("check") },
  ];

  const chips = [...pinned, ...optional].slice(0, MAX_CHIPS);

  return (
    // One row: the chips that move the conversation on, then the tools that
    // act on this reply. They used to be two rows — Copy alone above, chips
    // below — which read as two unrelated toolbars.
    <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-1.5">
      {chips.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onPress}
          disabled={disabled}
          // These are the buttons a stuck student reaches for, so they are
          // the last thing that should be fiddly. 44px tall and 14px type on
          // a phone; the old 30px/12px read fine at desk distance and not at
          // all at arm's length on a bus.
          className="reply-chip tap"
        >
          {a.icon}
          {a.label}
        </button>
      ))}
      {tools && <div className="ms-auto flex items-center gap-0.5">{tools}</div>}
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
