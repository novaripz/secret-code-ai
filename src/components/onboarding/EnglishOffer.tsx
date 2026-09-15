"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import localforage from "localforage";

import { useI18n, findLocale } from "@/lib/i18n";
import { CONFIDENT_ENGLISH_EVIDENCE } from "@/lib/insights";
import { accountScope } from "@/store/useAuthStore";
import { useInsightsStore } from "@/store/useInsightsStore";
import { useProfileStore } from "@/store/useProfileStore";
import { XIcon } from "@/components/icons";

// Offering the interface in English to a student whose English has got good
// enough for it.
//
// THE ONE THING THIS FILE MUST NOT DO IS SWITCH ANYTHING BY ITSELF. A student
// who opens Panda and finds the buttons in a different language does not think
// "my English improved", they think the app broke, and the fix — finding the
// language setting — is in the language they can no longer read. So this asks,
// once, and the default answer is no: if the card is closed, ignored, or never
// seen, nothing changes.
//
// WHICH SETTING THIS TOUCHES, AND WHY ONLY THAT ONE.
// Interface language only. Never the reply language. Those are separate
// settings for a reason that matters most for exactly this student: buttons
// are eight words they have already learned by position, while an explanation
// of quadratic factoring is the hard thing they came here for. Being able to
// read "Save" is no evidence at all that they want the maths in English, and
// the moment we treat it as evidence we have taken away the one place they
// were allowed to not understand. If they want English answers too, the
// setting is right there and it is theirs to change.
//
// WHEN IT IS ALLOWED TO ASK.
// `estimateEnglishLevel` deliberately caps its confidence at "likely" — it
// refuses to be certain about a person's English from button presses, and it
// is right to. So "likely" is the ceiling we ask at, never a floor we wait to
// exceed. On top of the engine's own bar we add one of our own: the estimate
// has to have reached "confident" on at least three different days. The
// engine's writing samples are in-memory and reset each session by design, so
// without this a single good afternoon would be enough, and one good afternoon
// is not a trend — it is a student who happened to be working on an English
// assignment.
//
// AND WHEN IT IS NEVER ALLOWED TO ASK AGAIN.
// Once. A decision either way is written down and this component never renders
// again on that account. Repeatedly telling a fourteen year old that their
// English is now good enough is the exact failure mode this feature has to
// avoid; a second ask would be worse than never having built it.

/** The estimate has to look this good on this many separate days. */
const REQUIRED_CONFIDENT_DAYS = 3;

/**
 * Stored per account, alongside the insights store, for the same reason that
 * one does it: two students share a school laptop, and one of them being
 * offered English must never spend the other one's single ask.
 */
const store = localforage.createInstance({
  name: "ai-code-studio",
  storeName: `english-offer${accountScope().replace(/[^a-zA-Z0-9]/g, "_")}`,
});

const RECORD_KEY = "__english_offer__";

interface OfferRecord {
  /** Day stamps (YYYY-MM-DD) on which the estimate looked confident. */
  confidentDays: string[];
  /** Set once the student answers. Its presence is what closes the door. */
  decision?: "accepted" | "declined";
}

const EMPTY: OfferRecord = { confidentDays: [] };

function dayStamp(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function EnglishOffer() {
  const { t, locale, dir } = useI18n();
  const uiLanguage = useProfileStore((s) => s.languages.interface);
  const setLanguages = useProfileStore((s) => s.setLanguages);
  const replyLanguage = useProfileStore((s) => s.languages.reply);
  const profileHydrated = useProfileStore((s) => s.hydrated);

  const signals = useInsightsStore((s) => s.signals);
  const samples = useInsightsStore((s) => s.samples);
  const summary = useInsightsStore((s) => s.summary);

  const [record, setRecord] = useState<OfferRecord | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store
      .getItem<OfferRecord>(RECORD_KEY)
      .then((saved) => {
        if (cancelled) return;
        setRecord(saved && Array.isArray(saved.confidentDays) ? saved : EMPTY);
      })
      .catch(() => {
        // Private mode, or storage blocked. Treating an unreadable record as
        // "already decided" is the safe way round: the cost is a student who
        // is never offered English, and the alternative cost is a student who
        // is asked again every single session.
        if (!cancelled) setRecord({ ...EMPTY, decision: "declined" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const english = useMemo(
    () => summary().english,
    // Recomputed when the evidence moves, not on a timer: the estimate is a
    // pure function of these two and re-running it per render is waste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary, signals, samples],
  );

  /** What the engine is willing to claim, at the very top of its range. */
  const looksConfident =
    english.level === "confident" &&
    english.confidence === "likely" &&
    english.evidenceCount >= CONFIDENT_ENGLISH_EVIDENCE;

  // Record today as a confident day, at most once per day. This is bookkeeping
  // about the estimate, not about the student, and it holds no text.
  useEffect(() => {
    if (!record || record.decision || !looksConfident) return;
    const today = dayStamp(Date.now());
    if (record.confidentDays.includes(today)) return;
    const next: OfferRecord = {
      ...record,
      confidentDays: [...record.confidentDays, today].slice(-10),
    };
    // Written first and adopted only once it is on disk. A day that counted in
    // memory but not in storage would let a single session look like three,
    // which is the one thing this counter exists to prevent.
    store.setItem(RECORD_KEY, next).then(
      () => setRecord(next),
      () => {
        // A day that fails to persist simply does not count, which delays the
        // offer rather than repeating it. That is the right direction to fail.
      },
    );
  }, [record, looksConfident]);

  const earned =
    record !== null &&
    !record.decision &&
    looksConfident &&
    record.confidentDays.length >= REQUIRED_CONFIDENT_DAYS &&
    profileHydrated &&
    uiLanguage !== "en";

  // Held a beat behind the condition so the card never lands on top of the
  // first thing a student is reading when a screen opens.
  useEffect(() => {
    if (!earned) return;
    const id = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(id);
  }, [earned]);

  const decide = useCallback(
    (decision: "accepted" | "declined") => {
      setVisible(false);
      const next: OfferRecord = { ...(record ?? EMPTY), decision };
      setRecord(next);
      void store.setItem(RECORD_KEY, next).catch(() => {
        // Worst case this account gets asked once more in a future session.
        // Unpleasant, but it cannot loop: the card only returns if the
        // estimate is still this high on another day.
      });
      if (decision !== "accepted") return;
      // The separation of interface and reply language is only real if it
      // survives this button. Reply defaults to "auto", which *follows* the
      // interface — so moving the interface alone would quietly move the
      // answers too, and the student would have agreed to English buttons and
      // received English explanations of quadratic factoring. So the reply
      // language is pinned to what it resolved to a moment ago first. The
      // setting they never touched keeps behaving the way it did; only the
      // one they were asked about changes.
      setLanguages({
        interface: "en",
        reply: replyLanguage === "auto" ? uiLanguage : replyLanguage,
      });
    },
    [record, setLanguages, replyLanguage, uiLanguage],
  );

  if (!visible) return null;

  const current = findLocale(uiLanguage) ?? findLocale(locale);
  const currentName = current?.nativeName ?? uiLanguage;

  return (
    <div
      role="dialog"
      aria-label={t("english.offerLabel")}
      dir={dir}
      className="animate-rise fixed bottom-4 z-40 w-[calc(100vw-2rem)] max-w-[400px] rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-1)] p-4 shadow-2xl"
      // Logical inset so the card sits on the trailing edge in Arabic too,
      // rather than over the start of every line of text.
      style={{ insetInlineEnd: "1rem" }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">{t("english.offerTitle")}</h2>
        <button
          onClick={() => decide("declined")}
          aria-label={t("english.offerDismiss")}
          className="tap-sq inline-flex items-center justify-center -m-1 shrink-0 rounded-lg p-1 text-[var(--text-faint)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-dim)]">{t("english.offerBody")}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-faint)]">{t("english.offerRevert")}</p>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => decide("declined")}
          className="tap inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-[var(--text-dim)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          {t("english.offerDecline", { language: currentName })}
        </button>
        <button
          onClick={() => decide("accepted")}
          className="tap inline-flex items-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          {t("english.offerAccept")}
        </button>
      </div>
    </div>
  );
}
