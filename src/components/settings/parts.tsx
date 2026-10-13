"use client";

import { useId } from "react";

// The pieces every Settings section is built from, so a card, a labelled field
// and a switch look and behave the same in all of them.

/** A section card: a title, a line on what it is for, and the controls. */
export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h3 className="cursor-default select-none text-[15px] text-[var(--text)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-[65ch] cursor-default select-none text-[13.5px] leading-relaxed text-[var(--text-faint)]">
          {description}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** A labelled control. The label names its input with `htmlFor`, so tapping it focuses the field. */
export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label cursor-default select-none">
        {label}
      </label>
      {hint && <p className="field-hint cursor-default select-none">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** A labelled group of several controls, which no single `htmlFor` can name. */
export function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="field-label cursor-default select-none">
        {label}
      </p>
      {hint && <p className="field-hint cursor-default select-none">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export function ToggleRow({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p id={id} className="cursor-default select-none text-sm font-medium text-[var(--text)]">
          {label}
        </p>
        <p className="mt-1 cursor-default select-none text-[13px] leading-relaxed text-[var(--text-faint)]">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} onClick={() => onChange(!on)} className="switch mt-0.5">
        <span className="switch-knob" />
      </button>
    </div>
  );
}
