"use client";

import { useProfileStore } from "@/store/useProfileStore";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";

// The mode rail that sits beside the chat.
//
// Explain and Humanize are outline-only boxes: no fill, green border and text
// when on, muted grey when off. The depth slider only exists while Explain is
// on, because there is nothing to set the depth of otherwise.

const DEPTHS: { key: ExplainDepth; label: string }[] = [
  { key: "minimal", label: "Minimal" },
  { key: "fair", label: "Fair" },
  { key: "normal", label: "Normal" },
  { key: "extra", label: "Extra" },
  { key: "overload", label: "Overload" },
];

function Pill({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
        on
          ? "border-[var(--success)] text-[var(--success)]"
          : "border-[var(--line-strong)] text-[var(--text-faint)] hover:border-[var(--text-faint)]"
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider">{on ? "On" : "Off"}</span>
    </button>
  );
}

function DepthSlider() {
  const depth = useProfileStore((s) => s.modes.explainDepth);
  const setModes = useProfileStore((s) => s.setModes);
  const index = Math.max(0, DEPTHS.findIndex((d) => d.key === depth));

  return (
    <div className="pt-0.5">
      <label htmlFor="explain-depth" className="mb-2.5 block text-xs text-[var(--text-dim)]">
        How much explaining
      </label>

      <input
        id="explain-depth"
        type="range"
        min={0}
        max={DEPTHS.length - 1}
        step={1}
        value={index}
        onChange={(e) => setModes({ explainDepth: DEPTHS[Number(e.target.value)].key })}
        className="depth-range w-full"
        aria-valuetext={DEPTHS[index].label}
      />

      <div className="mt-2 flex justify-between">
        {DEPTHS.map((d, i) => (
          <button
            key={d.key}
            onClick={() => setModes({ explainDepth: d.key })}
            className={`text-[10px] transition-colors ${
              i === index ? "font-semibold text-[var(--success)]" : "text-[var(--text-faint)] hover:text-[var(--text-dim)]"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModeRail({ className = "" }: { className?: string }) {
  const modes = useProfileStore((s) => s.modes);
  const setModes = useProfileStore((s) => s.setModes);

  return (
    <aside
      className={`flex w-[250px] shrink-0 flex-col gap-4 border-l border-[var(--line)] bg-[var(--surface-0)] p-4 ${className}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Modes</p>

      <div className="flex flex-col gap-3">
        <Pill
          label="Explain"
          on={modes.explainMode}
          onClick={() => setModes({ explainMode: !modes.explainMode })}
          title="Adds the why behind an answer"
        />
        {modes.explainMode ? (
          <DepthSlider />
        ) : (
          <p className="px-0.5 text-xs leading-relaxed text-[var(--text-faint)]">
            Off means the answer only. No workings, no build-up.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Pill
          label="Humanize"
          on={modes.humanize}
          onClick={() => setModes({ humanize: !modes.humanize })}
          title="Plain everyday writing for essays and emails"
        />
        <p className="px-0.5 text-xs leading-relaxed text-[var(--text-faint)]">
          Plain, everyday writing for essays and emails.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-4">
        <Pill
          label="Homework Help"
          on={modes.homeworkHelp}
          onClick={() => setModes({ homeworkHelp: !modes.homeworkHelp })}
          title="Walks you through it instead of handing over the answer"
        />
        <Pill
          label="AI Homie"
          on={modes.aiHomie}
          onClick={() => setModes({ aiHomie: !modes.aiHomie })}
          title="Casual and chill, talks to you like a friend"
        />
      </div>
    </aside>
  );
}
