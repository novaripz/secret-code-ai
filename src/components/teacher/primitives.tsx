"use client";

// The small vocabulary every teacher screen is built from.
//
// A teacher opens this between classes with about fifteen seconds to spare, so
// the design rule is: state is carried by shape as well as by number. A chip,
// a severity stripe and a weight change are readable in peripheral vision; a
// figure in a table is not. Semantic colour (good / warning / critical) is kept
// strictly separate from the accent so "needs attention" never competes with
// "this is a button".
//
// These are now thin names over the app's shared component classes (`.card`,
// `.btn`, `.input`, `.badge`) rather than a second, private set of styles, so
// the teacher screens and the student screens can no longer drift apart. The
// exports keep their old names because forty call sites use them.

import Link from "next/link";
import { translate } from "@/lib/i18n";
import { formatDue as formatDueLabel, toDateInput as dateInput } from "@/lib/school/due";
import { Skeleton } from "@/components/ui/primitives";
import { CircleAlertIcon, RefreshIcon, XIcon } from "@/components/icons";
import type { Severity } from "./types";

export const fieldClass = "input";

export const labelClass = "eyebrow";

export const cardClass = "card";

/** Severity to tokens. One lookup, so a stripe and a chip never disagree. */
const SEVERITY: Record<Severity, { text: string; badge: string; word: string }> = {
  critical: { text: "var(--danger)", badge: "badge-danger", word: "Needs a lesson" },
  warning: { text: "var(--warn)", badge: "badge-warn", word: "Worth a look" },
  watch: { text: "var(--text-faint)", badge: "", word: "Steady" },
};

export function severityWord(severity: Severity): string {
  return SEVERITY[severity].word;
}

export function SeverityStripe({ severity }: { severity: Severity }) {
  return <span aria-hidden className="w-1 shrink-0 self-stretch rounded-full" style={{ background: SEVERITY[severity].text }} />;
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span className={`badge shrink-0 ${s.badge}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.text }} />
      {s.word}
    </span>
  );
}

export type ChipTone = "neutral" | "good" | "warn" | "bad" | "accent";

const CHIP: Record<ChipTone, string> = {
  neutral: "",
  good: "badge-success",
  warn: "badge-warn",
  bad: "badge-danger",
  accent: "badge-accent",
};

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: ChipTone }) {
  return <span className={`badge ${CHIP[tone]}`}>{children}</span>;
}

/** A headline number with its own label. Summary before detail, literally. */
export function Stat({
  value,
  label,
  tone = "neutral",
  hint,
}: {
  value: React.ReactNode;
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  hint?: string;
}) {
  const color = tone === "good" ? "text-success" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className="card px-4 py-3.5">
      <p className={`text-2xl font-[var(--weight-strong)] tabular-nums tracking-tight ${color}`}>{value}</p>
      <p className="mt-0.5 text-[13px] font-[var(--weight-ui)] text-ink-dim">{label}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-ink-faint">{hint}</p>}
    </div>
  );
}

export function SectionHeading({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-[var(--weight-strong)] tracking-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ink-faint">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// Every teacher button funnels through these two. `.btn` already carries the
// 44px phone floor, so it is applied once in globals.css rather than here.
export const buttonClass = "btn btn-primary";

export const quietButtonClass = "btn btn-outline";

/**
 * Tables and anything else that can outgrow a phone get their own scroller, so
 * the page body never slides sideways under the teacher's thumb.
 */
export function Scroller({ children }: { children: React.ReactNode }) {
  // No negative margin here: bleeding past the padded column is what makes
  // the *page* scroll sideways, which is the exact thing this is meant to stop.
  return <div className="scroll-x max-w-full">{children}</div>;
}

/**
 * Said out loud on every screen that still shows one: these numbers are
 * fixtures. A dashboard that quietly invents data is worse than one that has
 * none.
 */
export function DataSourceNote({ what }: { what: string }) {
  return (
    <p className="mt-3 rounded-ui border border-dashed border-line-strong px-3 py-2 text-xs leading-relaxed text-ink-faint">
      Example data — {what} is rendered from a local fixture. The shapes are final; only the source changes.
    </p>
  );
}

/** Rows of grey in the shape of what is coming, so nothing jumps when it lands. */
export function ListSkeleton({ rows = 3, className = "h-20" }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`w-full rounded-ui-lg ${className}`} />
      ))}
    </div>
  );
}

/**
 * The three states a read can be in, said apart. "Nothing here" and "we
 * couldn't reach the database" are opposite messages to a teacher, and a
 * component that renders an empty list for both teaches them to distrust it.
 * Returns null once the data has loaded, so a caller can render it above the
 * real content and stop thinking about it.
 */
export function LoadNote({
  state,
  what,
  onRetry,
}: {
  state: { loading: boolean; error: string | null; loaded: boolean };
  what: string;
  onRetry?: () => void;
}) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-ui-lg border border-danger bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger">
        <p className="flex items-center gap-2 font-[var(--weight-strong)]">
          <CircleAlertIcon className="h-4 w-4 shrink-0" aria-hidden />
          We couldn&apos;t load {what}
        </p>
        <p className="mt-1">{state.error}</p>
        <p className="mt-1">This is not the same as having none — nothing below is a picture of your class right now.</p>
        {onRetry && (
          <button onClick={onRetry} className="btn btn-secondary btn-sm mt-3">
            <RefreshIcon aria-hidden />
            Try again
          </button>
        )}
      </div>
    );
  }
  if (!state.loaded) {
    return (
      <div role="status" aria-label={`Loading ${what}`}>
        <ListSkeleton />
      </div>
    );
  }
  return null;
}

/** A failed write, after its optimistic version was already on screen. */
export function ActionErrorNote({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-3 flex items-start gap-3 rounded-ui border border-danger bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 leading-relaxed">{error} Nothing was saved.</span>
      <button onClick={onDismiss} className="icon-btn icon-btn-sm tap-pad text-danger" aria-label="Dismiss" title="Dismiss">
        <XIcon aria-hidden />
      </button>
    </div>
  );
}

export function Crumb({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-ui-sm text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline">
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------- formatting

const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);

/**
 * A due date for the teacher screens: the same words and the same rule for
 * "overdue" as the student's own screens (see lib/school/due.ts), on the real
 * clock. This used to default to a fixed date in September 2026, and no
 * caller ever passed a clock, so every label was measured from that day.
 * Teacher screens are English for now, like the rest of their text.
 */
export function formatDue(dueAt: number | null, now = Date.now()): { text: string; tone: "neutral" | "warn" | "bad" } {
  const label = formatDueLabel(dueAt, { t: en, now, locale: "en-US" });
  return { text: label.text, tone: label.tone === "overdue" ? "bad" : label.tone === "today" || label.tone === "soon" ? "warn" : "neutral" };
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2h ago" / "9 days ago" / "Never". Coarse on purpose — precision implies surveillance. */
export function formatLastActive(ms: number | null, now = Date.now()): string {
  if (ms === null) return "Never opened Panda";
  const mins = Math.round((now - ms) / 60_000);
  if (mins < 60) return "Active just now";
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Active ${days} ${days === 1 ? "day" : "days"} ago`;
}

/** A date input wants `yyyy-mm-dd` in local time, which toISOString will not give. */
export function toDateInput(ms: number | null): string {
  return dateInput(ms);
}
