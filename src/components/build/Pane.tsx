"use client";

import type { ReactNode } from "react";
import { XIcon } from "@/components/icons";

// Every pane's title bar, drawn by the pane itself.
//
// Panes used to be wrapped in a generic frame with its own title bar, and then
// drew a header of their own inside it — so the screen read "AGENT" above
// "AGENT", "FILES" above "YOUR FILES", "PREVIEW" above a row of tabs. Now
// there is one bar per pane, and it carries the pane's name, its actions and
// its close button together. Closing lives on the pane itself rather than only
// on the rail because "make this go away" is a thought you have while looking
// at the thing you want gone.

export function PaneHeader({
  title,
  icon,
  actions,
  onClose,
  closeLabel,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  /** Buttons on the right, before the close button. */
  actions?: ReactNode;
  /** No close button when absent — the pane cannot be closed from here. */
  onClose?: () => void;
  /** Spoken label — "Close" alone tells a screen reader nothing about what closes. */
  closeLabel?: string;
  /** Replaces the title entirely, for panes whose header is a row of tabs. */
  children?: ReactNode;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--line)] bg-[var(--surface-0)] pl-3 pr-1.5">
      {children ?? (
        <h2 className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {icon && <span className="flex shrink-0 text-[var(--text-faint)] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          <span className="eyebrow truncate">{title}</span>
        </h2>
      )}
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel ?? "Close"}
          title={closeLabel ?? "Close"}
          className="icon-btn icon-btn-sm tap-sq tap-pad"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
