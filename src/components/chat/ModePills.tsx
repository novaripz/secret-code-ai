"use client";

import { useProfileStore } from "@/store/useProfileStore";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";

// The modes, under the composer where they started. Outline-only pills that
// go green when on. When Explain is on a second compact row appears with the
// depth chips, so the slider has a home without taking a whole side panel.

const DEPTHS: { key: ExplainDepth; label: string }[] = [
  { key: "minimal", label: "Minimal" },
  { key: "fair", label: "Fair" },
  { key: "normal", label: "Normal" },
  { key: "extra", label: "Extra" },
  { key: "overload", label: "Overload" },
];

const MODES = [
  {
    key: "explainMode",
    label: "Explain",
    title: "Adds the why behind an answer. Off gives you the answer alone.",
  },
  {
    key: "humanize",
    label: "Humanize",
    title: "Plain, everyday writing for essays and emails",
  },
  {
    key: "aiHomie",
    label: "AI Homie",
    title: "Talks to you like a friend, not an assistant",
  },
] as const;

export function ModePills({ className = "" }: { className?: string }) {
  const modes = useProfileStore((s) => s.modes);
  const setModes = useProfileStore((s) => s.setModes);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {MODES.map(({ key, label, title }) => {
          const on = modes[key];
          return (
            <button
              key={key}
              onClick={() => setModes({ [key]: !on })}
              title={title}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-[var(--success)] text-[var(--success)]"
                  : "border-[var(--line-strong)] text-[var(--text-faint)] hover:border-[var(--text-faint)] hover:text-[var(--text-dim)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {modes.explainMode && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span className="mr-1 text-[11px] text-[var(--text-faint)]">How much</span>
          {DEPTHS.map((d) => {
            const on = modes.explainDepth === d.key;
            return (
              <button
                key={d.key}
                onClick={() => setModes({ explainDepth: d.key })}
                aria-pressed={on}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  on
                    ? "bg-[var(--surface-3)] font-medium text-[var(--text)]"
                    : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
