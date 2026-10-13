"use client";

// The small vocabulary every school screen is built from, student side.
//
// One frame (so /classes, a class, the plan and the teacher screens are the
// same width with the same gutters), one due-date badge (so "Due Fri, 8:00 AM"
// looks and reads the same on every screen and in every language), and one
// pair of chips for why something was lifted up the plan. These used to be
// written out again on each page, and no two copies agreed.

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { Weight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AlertIcon, ArrowLeftIcon, CalendarIcon, CheckIcon, ClockIcon, PinIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import { formatDue, type DueLabel } from "@/lib/school/due";

/** The page column every school screen uses. */
export const PAGE_WIDTH = "mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-8";

/**
 * The one wider column, for a view that is a grid of days rather than a list
 * to read. Lists stay at the standard width, because a line of text that runs
 * the full width of a big monitor is a line nobody reads to the end.
 */
export const WIDE_PAGE_WIDTH = "mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pt-8";

export function SchoolPage({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className={wide ? WIDE_PAGE_WIDTH : PAGE_WIDTH}>{children}</div>
      </div>
    </AppShell>
  );
}

/** "← Classes". The one way back, the same everywhere, with a thumb-sized target. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="tap -ml-2 mb-3 inline-flex items-center gap-1.5 rounded-ui-sm px-2 py-1 text-sm text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <ArrowLeftIcon className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

// One shared clock for every due label and every plan on screen, moving on
// once a minute. Reading Date.now() during render made each re-render a
// slightly different answer; this makes "now" a value React can see change,
// so "Due today" becomes "Overdue since 8:00" on its own at 8:01.
let clock = typeof window === "undefined" ? 0 : Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  // A page opened long after this module loaded starts from the real time.
  clock = Date.now();
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clock = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => clock, () => clock);
}

/** A due-date formatter bound to the student's language and the shared clock. */
export function useDue(): (dueAt: number | null, now?: number) => DueLabel {
  const { t, locale } = useI18n();
  const current = useNow();
  return useCallback((dueAt, now) => formatDue(dueAt, { t, locale, now: now ?? current }), [t, locale, current]);
}

const DUE_TONE: Record<DueLabel["tone"], string> = {
  none: "",
  later: "",
  soon: "badge-info",
  today: "badge-warn",
  overdue: "badge-danger",
};

/**
 * A due date as a badge. Never colour alone: the icon changes with the
 * urgency (a warning sign for late work, a clock for today and tomorrow) and
 * the words say it outright.
 */
export function DueBadge({ dueAt, done = false, className = "" }: { dueAt: number | null; done?: boolean; className?: string }) {
  const due = useDue();
  const { t } = useI18n();
  if (done) {
    return (
      <span className={`badge badge-success ${className}`}>
        <CheckIcon aria-hidden />
        {t("assignments.done")}
      </span>
    );
  }
  const label = due(dueAt);
  const Icon = label.tone === "overdue" ? AlertIcon : label.tone === "today" || label.tone === "soon" ? ClockIcon : CalendarIcon;
  return (
    <span className={`badge ${DUE_TONE[label.tone]} ${className}`}>
      <Icon aria-hidden />
      {label.text}
    </span>
  );
}

/**
 * Why a row was lifted up the plan, in one word and one shape: a teacher
 * marked it a priority, or it is worth far more than the rest of its class.
 * The word is what a screen reader reads and what a colourblind student
 * reads; the tint only makes it findable at a glance.
 */
export function LiftChip({ kind }: { kind: "pinned" | "heavy" }) {
  const { t } = useI18n();
  if (kind === "pinned") {
    return (
      <span className="badge badge-accent">
        <PinIcon aria-hidden />
        {t("priority.teacherPick")}
      </span>
    );
  }
  return (
    <span className="badge">
      <Weight aria-hidden="true" strokeWidth={1.85} />
      {t("priority.bigPoints")}
    </span>
  );
}

/** A class's colour as a small round swatch. Identity, never status. */
export function ClassDot({ color, className = "h-2.5 w-2.5" }: { color?: string; className?: string }) {
  return <span aria-hidden className={`shrink-0 rounded-full ${className}`} style={{ background: color ?? "var(--line-strong)" }} />;
}
