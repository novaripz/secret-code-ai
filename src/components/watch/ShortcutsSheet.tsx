"use client";

import { useEffect, useRef } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { KeyboardIcon, XIcon } from "@/components/icons";
import { Kbd } from "@/components/ui/primitives";

// The "?" sheet: every Watch shortcut in one place, so nobody has to guess.

export const SHORTCUTS: { keys: string[]; label: StringKey }[] = [
  { keys: ["/"], label: "watch.kbSearch" },
  { keys: ["k"], label: "watch.kbPlayPause" },
  { keys: ["j"], label: "watch.kbBack" },
  { keys: ["l"], label: "watch.kbForward" },
  { keys: ["m"], label: "watch.kbMute" },
  { keys: ["t"], label: "watch.kbTheater" },
  { keys: ["Shift", "N"], label: "watch.kbNext" },
  { keys: ["w"], label: "watch.kbLater" },
  { keys: ["a"], label: "watch.kbAsk" },
  { keys: ["Esc"], label: "watch.kbEscape" },
  { keys: ["?"], label: "watch.kbHelp" },
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A small modal, behaving like one: focus moves in, Tab stays in, Escape
  // closes, and focus goes back to wherever it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-shortcuts-title"
        className="animate-rise w-full max-w-md rounded-t-ui-xl border border-line bg-surface-1 p-5 shadow-ui-pop sm:rounded-ui-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-ui-sm bg-accent-soft text-accent-text">
            <KeyboardIcon className="h-[18px] w-[18px]" />
          </span>
          <h2 id="watch-shortcuts-title" className="flex-1 text-[17px] font-semibold text-ink">
            {t("watch.shortcuts")}
          </h2>
          <button ref={closeRef} type="button" className="icon-btn tap-sq" aria-label={t("watch.close")} onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <dl className="mt-4 divide-y divide-line">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-[14px] text-ink-dim">{t(s.label)}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-faint">{t("watch.shortcutsNote")}</p>
      </div>
    </div>
  );
}
