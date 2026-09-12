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
// Everything draws from the tokens in globals.css — no hex here — which is what
// makes light and dark both work without a second set of components.

import Link from "next/link";
import type { Severity } from "./types";

/** The clock the teacher screens format against. See exampleData for why it is fixed. */
export const NOW_REF = Date.UTC(2026, 8, 12, 15, 0, 0);

export const fieldClass =
  "w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--focus)]";

export const labelClass = "text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]";

export const cardClass = "rounded-2xl border border-[var(--line)] bg-[var(--surface-0)]";

/** Severity to tokens. One lookup, so a stripe and a chip never disagree. */
const SEVERITY: Record<Severity, { text: string; soft: string; word: string }> = {
  critical: { text: "var(--danger)", soft: "var(--danger-soft)", word: "Needs a lesson" },
  warning: { text: "var(--warn)", soft: "var(--warn-soft)", word: "Worth a look" },
  watch: { text: "var(--text-dim)", soft: "var(--surface-2)", word: "Steady" },
};

export function severityWord(severity: Severity): string {
  return SEVERITY[severity].word;
}

export function SeverityStripe({ severity }: { severity: Severity }) {
  return (
    <span
      aria-hidden
      className="w-1 shrink-0 self-stretch rounded-full"
      style={{ background: SEVERITY[severity].text }}
    />
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: s.soft, color: s.text }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.text }} />
      {s.word}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const tones = {
    neutral: { background: "var(--surface-2)", color: "var(--text-dim)" },
    good: { background: "var(--success-soft)", color: "var(--success)" },
    warn: { background: "var(--warn-soft)", color: "var(--warn)" },
    bad: { background: "var(--danger-soft)", color: "var(--danger)" },
  } as const;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={tones[tone]}
    >
      {children}
    </span>
  );
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
  const color =
    tone === "good" ? "var(--success)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--danger)" : "var(--text)";
  return (
    <div className={`${cardClass} px-4 py-3.5`}>
      <p className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-[var(--text-dim)]">{label}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-[var(--text-faint)]">{hint}</p>}
    </div>
  );
}

export function SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-[var(--text-faint)]">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50";

export const quietButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]";

/**
 * Tables and anything else that can outgrow a phone get their own scroller, so
 * the page body never slides sideways under the teacher's thumb.
 */
export function Scroller({ children }: { children: React.ReactNode }) {
  // No negative margin here: bleeding past the padded column is what makes
  // the *page* scroll sideways, which is the exact thing this is meant to stop.
  return <div className="max-w-full overflow-x-auto">{children}</div>;
}

/**
 * Said out loud on every screen that still shows one: these numbers are
 * fixtures. A dashboard that quietly invents data is worse than one that has
 * none. The rosters, classes and assignments read the database now and have
 * dropped this note; the learning signals have nowhere to read from yet and
 * keep it.
 */
export function DataSourceNote({ what }: { what: string }) {
  return (
    <p className="mt-3 rounded-xl border border-dashed border-[var(--line-strong)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
      Example data — {what} is rendered from a local fixture. Struggle signals are recorded in each
      student&apos;s own browser and the shared database has nowhere to store them yet, so there is
      nothing real here to show. The shapes are final; only the source changes.
    </p>
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
      <div
        role="alert"
        className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
        style={{ borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}
      >
        <p className="font-medium">We couldn&apos;t load {what}</p>
        <p className="mt-1">{state.error}</p>
        <p className="mt-1">
          This is not the same as having none — nothing below is a picture of your class right now.
        </p>
        {onRetry && (
          <button onClick={onRetry} className={`${quietButtonClass} mt-3`}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (state.loading && !state.loaded) {
    return <p className="text-sm text-[var(--text-faint)]">Loading {what}…</p>;
  }
  return null;
}

/** A failed write, after its optimistic version was already on screen. */
export function ActionErrorNote({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mt-3 flex flex-wrap items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm"
      style={{ borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}
    >
      <span className="min-w-0 flex-1 leading-relaxed">{error} Nothing was saved.</span>
      <button onClick={onDismiss} className="shrink-0 text-xs underline underline-offset-4">
        Dismiss
      </button>
    </div>
  );
}

export function Crumb({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded text-[var(--text-faint)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:underline"
    >
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------- formatting

export function formatDue(dueAt: number | null, now = NOW_REF): { text: string; tone: "neutral" | "warn" | "bad" } {
  if (dueAt === null) return { text: "No due date", tone: "neutral" };
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "Due yesterday" : `${-days} days overdue`, tone: "bad" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  if (days === 1) return { text: "Due tomorrow", tone: "warn" };
  return { text: `Due in ${days} days`, tone: "neutral" };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2h ago" / "9 days ago" / "Never". Coarse on purpose — precision implies surveillance. */
export function formatLastActive(ms: number | null, now = NOW_REF): string {
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
  if (ms === null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
