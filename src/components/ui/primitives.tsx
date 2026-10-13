import type { ComponentProps, ReactNode } from "react";

// Small building blocks shared by every screen. Kept dumb on purpose: they
// carry the look, the caller carries the behaviour.

export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`kbd ${className}`}>{children}</kbd>;
}

export type BadgeTone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

export function Badge({ tone = "neutral", className = "", children, ...rest }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span className={`badge ${tone === "neutral" ? "" : `badge-${tone}`} ${className}`} {...rest}>
      {children}
    </span>
  );
}

export function Skeleton({ className = "", ...rest }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={`skeleton ${className}`} {...rest} />;
}

/** A page's title row: an optional icon tile, the title, a line under it, and
    actions on the right that wrap below on a phone. */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start gap-x-4 gap-y-3 ${className}`}>
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--accent-text)] [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl tracking-tight text-[var(--text)] md:text-[26px]">{title}</h1>
        {description && <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-dim)] md:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** What a list says when it has nothing in it: an icon, a sentence on what
    would be here, and the one action that would put something there. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-6 py-12 text-center ${className}`}
    >
      {icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)] [&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </span>
      )}
      <p className="text-base font-[var(--weight-strong)] text-[var(--text)]">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--text-dim)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A labelled group inside a page: small caps heading, optional trailing link. */
export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
