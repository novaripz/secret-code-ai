"use client";

import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore } from "@/store/useProfileStore";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";
import { CheckIcon, LightbulbIcon } from "@/components/icons";

// The modes, under the composer where they started. One toggle for Explain,
// and when it is on, a segmented control beside it for how much explaining.
//
// Humanize and Chill mode used to sit alongside Explain and are gone. The row
// is written as a list rather than collapsed into a single hard-coded button
// because Explain is not special — it is simply the one mode left, and the next
// one to arrive should cost one line here, not a rewrite of the layout.

const DEPTHS: { key: ExplainDepth; label: StringKey }[] = [
  { key: "minimal", label: "depth.minimal" },
  { key: "fair", label: "depth.fair" },
  { key: "normal", label: "depth.normal" },
  { key: "extra", label: "depth.extra" },
  { key: "overload", label: "depth.overload" },
];

const MODES = [
  { key: "explainMode", label: "mode.explain", title: "mode.explainTitle" },
] as const satisfies readonly { key: "explainMode"; label: StringKey; title: StringKey }[];

export function ModePills({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const modes = useProfileStore((s) => s.modes);
  const setModes = useProfileStore((s) => s.setModes);

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      {MODES.map(({ key, label, title }) => {
        const on = modes[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => setModes({ [key]: !on })}
            title={t(title)}
            aria-label={`${t(label)} — ${t(title)}`}
            aria-pressed={on}
            className="mode-toggle tap"
          >
            {on ? <CheckIcon className="h-3.5 w-3.5" /> : <LightbulbIcon className="h-3.5 w-3.5" />}
            {t(label)}
          </button>
        );
      })}

      {modes.explainMode && (
        <div role="group" aria-label={t("mode.howMuch")} className="flex max-w-full items-center gap-1.5">
          <span className="hidden text-[12.5px] text-[var(--text-faint)] sm:inline">{t("mode.howMuch")}</span>
          {/* The depth chips were 24px tall and five of them shared one row —
              the smallest thing on the chat screen and the easiest to hit by
              accident. The segmented control scrolls sideways on a narrow
              phone instead of shrinking them. */}
          <div className="segmented scroll-x max-w-full">
            {DEPTHS.map((d) => {
              const on = modes.explainDepth === d.key;
              return (
                <button key={d.key} type="button" onClick={() => setModes({ explainDepth: d.key })} aria-pressed={on} className="tap shrink-0">
                  {t(d.label)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
