"use client";

import { useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { XIcon } from "@/components/icons";

// A way to say "this is wrong" that does not require finding an adult.
//
// The categories include "I think a rule is unfair" on purpose: a student who
// disagrees with how the tool is treating them should have somewhere to put
// that, rather than only being able to report bugs.

const CATEGORIES: { key: string; label: StringKey }[] = [
  { key: "wrongInfo", label: "report.wrongInfo" },
  { key: "disrespectful", label: "report.disrespectful" },
  { key: "assignmentWrong", label: "report.assignmentWrong" },
  { key: "unexpected", label: "report.unexpected" },
  { key: "languageMissing", label: "report.languageMissing" },
  { key: "unfair", label: "report.unfair" },
  { key: "other", label: "report.other" },
];

export function ReportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, details }),
      });
    } catch {
      // Even if the network drops, the student should not be left staring at
      // a spinner. The report is lost, but saying so helps nobody here.
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("report.title")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-rise rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text)]">{t("report.title")}</h2>
          <button onClick={onClose} aria-label={t("action.cancel")}
            className="rounded-lg p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)]">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <>
            <p className="text-sm leading-relaxed text-[var(--text-dim)]">{t("report.thanks")}</p>
            <button onClick={onClose}
              className="mt-4 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-contrast)]">
              {t("action.done")}
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="flex flex-col gap-1.5">
              {CATEGORIES.map((c) => (
                <label key={c.key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                    category === c.key
                      ? "border-[var(--text)] bg-[var(--surface-2)] text-[var(--text)]"
                      : "border-[var(--line)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                  }`}>
                  <input type="radio" name="category" value={c.key} checked={category === c.key}
                    onChange={() => setCategory(c.key)} className="sr-only" />
                  {t(c.label)}
                </label>
              ))}
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs text-[var(--text-faint)]">{t("report.details")}</span>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3}
                className="w-full resize-y rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]" />
            </label>

            <button type="submit" disabled={busy}
              className="mt-4 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40">
              {t("report.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
