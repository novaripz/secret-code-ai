"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "@/components/icons";

// A dialog for the workspace's own sheets (shortcuts, editor settings, a new
// project). The app's Dialog provider covers prompt/confirm/alert; these hold
// real content, so they get their own frame — with the same promises: focus
// goes in when it opens, Tab stays inside, Escape closes, and focus returns to
// whatever opened it.

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  if (!open) return null;
  return (
    <Frame onClose={onClose} title={title} description={description} icon={icon} footer={footer} size={size}>
      {children}
    </Frame>
  );
}

function Frame({
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size,
}: {
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size: "md" | "lg" | "xl";
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const box = boxRef.current;
      const first = box?.querySelector<HTMLElement>("[data-autofocus]") ?? box?.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
      first?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      opener?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(
      boxRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex='-1'])") ?? [],
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const width = size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ide-modal-title"
        onKeyDown={onKeyDown}
        className={`animate-rise flex max-h-[92dvh] w-full ${width} flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--line-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-pop)] sm:rounded-[var(--radius-xl)]`}
      >
        <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5">
          {icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--accent-text)] [&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="ide-modal-title" className="text-[18px] tracking-tight text-[var(--text)]">
              {title}
            </h2>
            {description && <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-dim)]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="icon-btn tap-sq -mr-1.5 -mt-1">
            <XIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-0)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
