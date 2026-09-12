"use client";

import type { ReactNode } from "react";
import { XIcon } from "@/components/icons";

// Every pane wears the same slim title bar, and every title bar carries the
// close button. Closing lives on the pane itself rather than only in the rail
// because "make this go away" is a thought you have while looking at the thing
// you want gone, not while scanning a toolbar for the switch that controls it.

export function Pane({
  title,
  closeLabel,
  onClose,
  actions,
  children,
}: {
  title: string;
  /** Spoken label — "Close" alone tells a screen reader nothing about what closes. */
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-0)]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--line)] px-2">
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          {title}
        </h2>
        {actions}
        <button
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
          className="shrink-0 rounded p-1 text-[var(--text-faint)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
