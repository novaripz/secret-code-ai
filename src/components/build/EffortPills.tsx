"use client";

import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore } from "@/store/useProfileStore";
import { BUILD_EFFORTS, type BuildEffort } from "@/lib/ai/systemPrompt";

// The dial under the studio composer.
//
// It used to be the Explain scale, which was the wrong dial in the wrong place.
// In chat, "how much" is a question about the answer's length. In the studio the
// student is not asking how much prose they want -- they are asking how much
// PROJECT they want, and "Minimal" ought to mean a surgical change rather than
// a terse paragraph about a sprawling one.
//
// Five steps rather than a toggle, because there is no sensible "off": every
// build turn is made at some level of ambition, and hiding that behind a
// default only means the student cannot move it. The words are the same five
// the Explain scale uses, on purpose -- someone who has learned what "Extra"
// means two tabs away should not have to learn a second vocabulary here.
//
// Each step says what it does underneath. The scale is meaningless otherwise:
// "Fair" and "Normal" are not self-evident, and a student guessing between them
// will pick one at random and never touch it again.

const NOTES: Record<BuildEffort, StringKey> = {
  minimal: "effort.minimalNote",
  fair: "effort.fairNote",
  normal: "effort.normalNote",
  extra: "effort.extraNote",
  overload: "effort.overloadNote",
};

const LABELS: Record<BuildEffort, StringKey> = {
  minimal: "effort.minimal",
  fair: "effort.fair",
  normal: "effort.normal",
  extra: "effort.extra",
  overload: "effort.overload",
};

export function EffortPills({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const effort = useProfileStore((s) => s.modes.buildEffort);
  const setModes = useProfileStore((s) => s.setModes);
  const current = effort ?? "normal";

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div
        className="flex flex-wrap items-center justify-center gap-1"
        role="radiogroup"
        aria-label={t("mode.effortTitle")}
      >
        <span className="mr-1 text-[13px] text-[var(--text-faint)] sm:text-[11px]">{t("mode.effort")}</span>
        {BUILD_EFFORTS.map((level) => {
          const on = current === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setModes({ buildEffort: level })}
              title={t(NOTES[level])}
              // `tap` for the 44px floor: five chips sharing one row is the
              // easiest thing on this panel to hit by accident.
              className={`tap inline-flex items-center rounded-full px-3 py-1 text-[13px] transition-colors motion-reduce:transition-none sm:px-2.5 sm:text-[11px] ${
                on
                  ? "bg-[var(--surface-3)] font-medium text-[var(--text)]"
                  : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
              }`}
            >
              {t(LABELS[level])}
            </button>
          );
        })}
      </div>
      {/* The chosen level, spelled out. A scale whose steps are five adjectives
          tells a student nothing about what moving it would do. */}
      <p className="px-2 text-center text-[12px] leading-snug text-[var(--text-faint)] sm:text-[11px]">
        {t(NOTES[current])}
      </p>
    </div>
  );
}
