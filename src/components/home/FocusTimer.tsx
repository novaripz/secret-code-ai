"use client";

// The focus timer, on screen.
//
// Two shapes. `FocusPanel` is the full timer on the plan: a ring, the clock,
// and the controls a student actually reaches for -- pause, five more
// minutes, "I finished it", and a break when the chime goes. `FocusPill` is
// the one-line version for the other school screens and the home strip, so a
// running session is never out of sight and never more than one tap away.
//
// The clock comes from the store, which keeps time from when the session ends
// rather than by counting; see lib/school/focus.ts for why that matters.

import Link from "next/link";
import { useEffect } from "react";
import { Coffee, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useFocusStore } from "@/store/useFocusStore";
import { FOCUS_PRESETS, formatClock, isPaused, progressFraction, remainingMs } from "@/lib/school/focus";
import { CheckIcon, PauseIcon, PlayIcon, PlusIcon, StopIcon, TimerIcon } from "@/components/icons";

/** Loads the saved session once per page. Cheap; safe to call from anywhere. */
export function useFocusHydrated(): boolean {
  const hydrated = useFocusStore((s) => s.hydrated);
  const hydrate = useFocusStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);
  return hydrated;
}

function Ring({ fraction, children }: { fraction: number; children: React.ReactNode }) {
  // A progress ring is a picture of the number next to it, so it is hidden
  // from assistive tech; the clock carries the meaning.
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0 sm:h-44 sm:w-44">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 900ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Starting points when no session is running: the two presets, no assignment attached. */
export function FocusStarter() {
  const { t } = useI18n();
  const start = useFocusStore((s) => s.start);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => start({ kind: "focus", minutes: FOCUS_PRESETS.focus, title: t("plan.focusFree") })}
      >
        <TimerIcon aria-hidden />
        {t("plan.focusPreset", { minutes: FOCUS_PRESETS.focus })}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => start({ kind: "break", minutes: FOCUS_PRESETS.break, title: "" })}>
        <Coffee aria-hidden="true" strokeWidth={1.85} />
        {t("plan.breakPreset", { minutes: FOCUS_PRESETS.break })}
      </button>
    </div>
  );
}

export function FocusPanel() {
  const { t } = useI18n();
  const hydrated = useFocusHydrated();
  const session = useFocusStore((s) => s.session);
  const now = useFocusStore((s) => s.now);
  const sound = useFocusStore((s) => s.sound);
  const { pause, resume, extend, finish, startBreak, setSound, start } = useFocusStore.getState();

  if (!hydrated || !session) return null;

  const left = remainingMs(session, now);
  const ended = session.finishedAt !== null;
  const paused = isPaused(session);
  const isBreak = session.kind === "break";

  return (
    <section aria-labelledby="focus-heading" className="card relative overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: "var(--brand-gradient)" }} />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        <Ring fraction={ended ? 1 : progressFraction(session, now)}>
          <span className="eyebrow">{isBreak ? t("plan.focusBreak") : t("focus.title")}</span>
          <span
            className="mt-1 font-mono text-[34px] font-[var(--weight-strong)] tabular-nums tracking-tight text-ink sm:text-[38px]"
            role="timer"
            aria-live="off"
          >
            {formatClock(left)}
          </span>
          {paused && <span className="text-xs text-ink-faint">{t("plan.focusPaused")}</span>}
        </Ring>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 id="focus-heading" className="eyebrow">
            {ended ? (isBreak ? t("plan.focusBreakOver") : t("plan.focusTimeUp")) : isBreak ? t("plan.focusBreakNow") : t("focus.goal")}
          </h2>
          <p className="mt-1.5 text-lg font-[var(--weight-strong)] leading-snug text-ink">
            {isBreak ? t("plan.focusBreakBody") : session.title}
          </p>
          {ended && !isBreak && <p className="mt-1 text-sm text-ink-dim">{t("plan.focusTimeUpBody")}</p>}

          {/* Announced once when the clock runs out, for anyone not looking. */}
          <p className="sr-only" role="status" aria-live="polite">
            {ended ? t("plan.focusTimeUp") : ""}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {ended ? (
              <>
                {!isBreak && session.assignmentId && (
                  <button type="button" className="btn btn-primary" onClick={() => finish({ markDone: true })}>
                    <CheckIcon aria-hidden />
                    {t("plan.focusMarkDone")}
                  </button>
                )}
                {!isBreak && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      finish();
                      startBreak();
                    }}
                  >
                    <Coffee aria-hidden="true" strokeWidth={1.85} />
                    {t("plan.breakPreset", { minutes: FOCUS_PRESETS.break })}
                  </button>
                )}
                {isBreak && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      finish();
                      start({ kind: "focus", minutes: FOCUS_PRESETS.focus, title: t("plan.focusFree") });
                    }}
                  >
                    <TimerIcon aria-hidden />
                    {t("plan.focusPreset", { minutes: FOCUS_PRESETS.focus })}
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => extend()}>
                  <PlusIcon aria-hidden />
                  {t("plan.focusMore")}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => finish()}>
                  {t("plan.focusClose")}
                </button>
              </>
            ) : (
              <>
                {paused ? (
                  <button type="button" className="btn btn-primary" onClick={resume}>
                    <PlayIcon aria-hidden />
                    {t("plan.focusResume")}
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={pause}>
                    <PauseIcon aria-hidden />
                    {t("focus.pause")}
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => extend()}>
                  <PlusIcon aria-hidden />
                  {t("plan.focusMore")}
                </button>
                {!isBreak && session.assignmentId && (
                  <button type="button" className="btn btn-outline" onClick={() => finish({ markDone: true })}>
                    <CheckIcon aria-hidden />
                    {t("plan.focusMarkDone")}
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => finish()}>
                  <StopIcon aria-hidden />
                  {t("plan.focusStop")}
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSound(!sound)}
            aria-pressed={sound}
            className="tap mt-3 inline-flex items-center gap-1.5 rounded-ui-sm px-1 text-[13px] text-ink-faint transition-colors hover:text-ink"
          >
            {sound ? <Volume2 className="h-4 w-4" aria-hidden="true" strokeWidth={1.85} /> : <VolumeX className="h-4 w-4" aria-hidden="true" strokeWidth={1.85} />}
            {t(sound ? "plan.focusSoundOn" : "plan.focusSoundOff")}
          </button>
        </div>
      </div>
    </section>
  );
}

/** "Focus 12:34" -- a running session, from anywhere, one tap from the full timer. */
export function FocusPill({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const hydrated = useFocusHydrated();
  const session = useFocusStore((s) => s.session);
  const now = useFocusStore((s) => s.now);
  if (!hydrated || !session) return null;
  const ended = session.finishedAt !== null;
  return (
    <Link
      href="/plan"
      className={`tap inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface-1 py-1.5 pl-2.5 pr-3.5 text-sm shadow-ui-1 transition-colors hover:border-line-strong ${className}`}
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${ended ? "bg-success-soft text-success" : "bg-accent-soft text-accent-text"}`}>
        {ended ? <CheckIcon className="h-3.5 w-3.5" aria-hidden /> : <TimerIcon className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="font-mono tabular-nums text-ink">{formatClock(remainingMs(session, now))}</span>
      <span className="min-w-0 truncate text-ink-dim">
        {ended ? t("plan.focusTimeUp") : session.kind === "break" ? t("plan.focusBreak") : session.title}
      </span>
    </Link>
  );
}
