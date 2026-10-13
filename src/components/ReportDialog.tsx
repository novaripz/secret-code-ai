"use client";

import { useId, useState } from "react";
import { create } from "zustand";
import { authHeader, authReady, deviceHeader } from "@/lib/security/device";
import { useI18n, type StringKey } from "@/lib/i18n";
import { Modal, ModalHeader } from "@/components/ui/Dialog";
import { CheckIcon, CircleCheckIcon } from "@/components/icons";

// A way to say "this is wrong" that does not require finding an adult.
//
// The categories include "I think a rule is unfair" on purpose: a student who
// disagrees with how the tool is treating them should have somewhere to put
// that, rather than only being able to report bugs.
//
// It can be opened from anywhere — the sidebar, the command palette, or the
// flag under one of Panda's replies — so it is driven by a tiny store and drawn
// once by the shell, rather than living inside whichever button opened it.

const CATEGORIES: { key: string; label: StringKey }[] = [
  { key: "wrongInfo", label: "report.wrongInfo" },
  { key: "disrespectful", label: "report.disrespectful" },
  { key: "assignmentWrong", label: "report.assignmentWrong" },
  { key: "unexpected", label: "report.unexpected" },
  { key: "languageMissing", label: "report.languageMissing" },
  { key: "unfair", label: "report.unfair" },
  { key: "other", label: "report.other" },
];

/** What a caller can fill in before the student sees the form. */
export interface ReportPreset {
  category?: string;
  /** The reply being flagged. Sent with the report, shown as a quote. */
  excerpt?: string;
}

interface ReportState {
  open: boolean;
  /** Bumped on every open, so a second flag starts a fresh form. */
  nonce: number;
  preset: ReportPreset;
  show: (preset?: ReportPreset) => void;
  hide: () => void;
}

export const useReportDialog = create<ReportState>((set) => ({
  open: false,
  nonce: 0,
  preset: {},
  show: (preset = {}) => set((s) => ({ open: true, preset, nonce: s.nonce + 1 })),
  hide: () => set({ open: false }),
}));

/** Long replies are cut so the report stays well inside the route's body limit. */
const EXCERPT_CHARS = 1200;

/** Mounted once by the shell. */
export function ReportDialogHost() {
  const open = useReportDialog((s) => s.open);
  const preset = useReportDialog((s) => s.preset);
  const hide = useReportDialog((s) => s.hide);
  const nonce = useReportDialog((s) => s.nonce);
  if (!open) return null;
  return <ReportDialog key={nonce} onClose={hide} preset={preset} />;
}

export function ReportDialog({ onClose, preset = {} }: { onClose: () => void; preset?: ReportPreset }) {
  const { t } = useI18n();
  const titleId = useId();
  const [category, setCategory] = useState(preset.category ?? CATEGORIES[0].key);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const excerpt = preset.excerpt?.trim().slice(0, EXCERPT_CHARS);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = excerpt ? `${details.trim()}\n\n--- The reply being reported ---\n${excerpt}`.trim() : details;
    try {
      await authReady();
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceHeader(), ...authHeader() },
        body: JSON.stringify({ category, details: body }),
      });
    } catch {
      // Even if the network drops, the student should not be left staring at
      // a spinner. The report is lost, but saying so helps nobody here.
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} labelledBy={titleId} className="max-w-md p-5">
      <ModalHeader
        id={titleId}
        title={t("report.title")}
        description={sent ? undefined : t("report.intro")}
        onClose={onClose}
        closeLabel={t("nav.close")}
      />

      {sent ? (
        <div className="mt-5 flex flex-col items-center gap-3 text-center" role="status">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <CircleCheckIcon className="h-6 w-6" />
          </span>
          <p className="text-sm leading-relaxed text-[var(--text-dim)]">{t("report.thanks")}</p>
          <button type="button" onClick={onClose} className="btn btn-primary mt-2 w-full">
            {t("action.done")}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4">
          {excerpt && (
            <blockquote className="mb-4 max-h-28 overflow-hidden rounded-[var(--radius)] border-l-2 border-[var(--accent)] bg-[var(--surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-dim)] [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
              {excerpt}
            </blockquote>
          )}

          <fieldset>
            <legend className="eyebrow mb-2">{t("report.whatKind")}</legend>
            <div className="flex flex-col gap-1.5">
              {CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  // The radio stays a real radio, visually hidden, so arrow keys
                  // move between options as they should; `has-[:focus-visible]`
                  // draws the ring on the row, which is the thing a keyboard
                  // user is looking at. Before, the hidden radio took focus and
                  // nothing on screen showed it.
                  <label
                    key={c.key}
                    className={`tap flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border px-3.5 py-2.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
                      on
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                        : "border-[var(--line)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={c.key}
                      checked={on}
                      onChange={() => setCategory(c.key)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--line-strong)]"
                      }`}
                    >
                      {on && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    {t(c.label)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm text-[var(--text)]">{t("report.details")}</span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder={t("report.detailsPlaceholder")}
              className="input resize-y"
            />
          </label>

          <button type="submit" disabled={busy} className="btn btn-primary mt-4 w-full">
            {t("report.submit")}
          </button>
        </form>
      )}
    </Modal>
  );
}
