"use client";

import { useProfileStore } from "@/store/useProfileStore";
import { BookIcon, LightbulbIcon, SparkleIcon } from "@/components/icons";

// The three conversation modes, toggleable from anywhere the user is chatting.
// They're stored on the profile, so a mode stays on across chats and projects.

const MODES = [
  {
    key: "explainMode",
    label: "Explain mode",
    icon: LightbulbIcon,
    title: "Extra-simple, step-by-step explanations",
  },
  {
    key: "homeworkHelp",
    label: "Homework help",
    icon: BookIcon,
    title: "Walks you through it instead of handing over the answer",
  },
  {
    key: "aiHomie",
    label: "AI homie",
    icon: SparkleIcon,
    title: "Casual, chill, talks to you like a friend",
  },
] as const;

export function ModePills({ className = "" }: { className?: string }) {
  const modes = useProfileStore((s) => s.modes);
  const setModes = useProfileStore((s) => s.setModes);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {MODES.map(({ key, label, icon: Icon, title }) => {
        const on = modes[key];
        return (
          <button
            key={key}
            onClick={() => setModes({ [key]: !on })}
            title={title}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              on
                ? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "border-[var(--line-strong)] text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
