"use client";

import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore } from "@/store/useProfileStore";
import type { ExplainDepth } from "@/lib/ai/systemPrompt";

// The modes, under the composer where they started. Outline-only pills that
// go green when on. When Explain is on a second compact row appears with the
// depth chips, so the slider has a home without taking a whole side panel.
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
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {MODES.map(({ key, label, title }) => {
          const on = modes[key];
          return (
            <button
              key={key}
              onClick={() => setModes({ [key]: !on })}
              title={t(title)}
              aria-label={`${t(label)} — ${t(title)}`}
              aria-pressed={on}
              className={`tap inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors sm:px-3 md:text-xs ${
                on
                  ? "border-[var(--success)] text-[var(--success)]"
                  : "border-[var(--line-strong)] text-[var(--text-faint)] hover:border-[var(--text-faint)] hover:text-[var(--text-dim)]"
              }`}
            >
              {t(label)}
            </button>
          );
        })}
      </div>

      {modes.explainMode && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span className="mr-1 text-[13px] text-[var(--text-faint)] sm:text-[11px]">{t("mode.howMuch")}</span>
          {DEPTHS.map((d) => {
            const on = modes.explainDepth === d.key;
            return (
              <button
                key={d.key}
                onClick={() => setModes({ explainDepth: d.key })}
                aria-pressed={on}
                // The depth chips were 24px tall and five of them shared one
                // row — the smallest thing on the chat screen and the easiest
                // to hit by accident. `tap` gives them the 44px floor; the row
                // wraps to two lines on a narrow phone, which is the right
                // trade for being able to hit the one you meant.
                className={`tap inline-flex items-center rounded-full px-3 py-1 text-[13px] transition-colors sm:px-2.5 sm:text-[11px] ${
                  on
                    ? "bg-[var(--surface-3)] font-medium text-[var(--text)]"
                    : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-dim)]"
                }`}
              >
                {t(d.label)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
