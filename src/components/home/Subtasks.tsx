"use client";

// A student's own checklist for one assignment: "outline, draft, edit".
//
// Breaking a big piece of work into steps is the single most useful thing a
// student can do with it, and the planner uses the result: the time left is
// the unticked steps, and the plan names the next one. The steps are the
// student's own and stay on this device, on teacher-set assignments too --
// how someone chooses to tackle their homework is nobody else's business.

import { useState } from "react";
import { nanoid } from "nanoid";
import { useI18n } from "@/lib/i18n";
import { useSchoolStore } from "@/store/useSchoolStore";
import type { Subtask } from "@/lib/school/types";
import { CheckIcon, PlusIcon, XIcon } from "@/components/icons";

const NO_STEPS: readonly Subtask[] = Object.freeze([]);

export function Subtasks({ assignmentId }: { assignmentId: string }) {
  const { t } = useI18n();
  const steps = useSchoolStore((s) => s.steps[assignmentId] ?? NO_STEPS);
  const setSteps = useSchoolStore((s) => s.setSteps);
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("");

  const done = steps.filter((s) => s.done).length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const m = Number(minutes);
    setSteps(assignmentId, [...steps, { id: nanoid(8), text: text.trim(), minutes: m > 0 ? Math.round(m) : undefined, done: false }]);
    setText("");
    setMinutes("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="eyebrow">{t("classes.stepsTitle")}</h3>
        {steps.length > 0 && (
          <span className="text-xs tabular-nums text-ink-faint">{t("classes.stepsCount", { done, total: steps.length })}</span>
        )}
      </div>
      {steps.length > 0 && (
        <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      )}
      {steps.length === 0 && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{t("classes.stepsEmpty")}</p>}

      {steps.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {steps.map((step) => (
            <li key={step.id} className="group flex items-center gap-2 py-1">
              <button
                type="button"
                aria-pressed={step.done}
                aria-label={t("classes.stepToggle", { step: step.text })}
                onClick={() => setSteps(assignmentId, steps.map((s) => (s.id === step.id ? { ...s, done: !s.done } : s)))}
                className="tap-sq -m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-sm hover:bg-surface-2"
              >
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 ${
                    step.done ? "border-success bg-success text-bg" : "border-line-strong"
                  }`}
                >
                  {step.done && <CheckIcon className="h-3 w-3" strokeWidth={3} aria-hidden />}
                </span>
              </button>
              <span className={`min-w-0 flex-1 text-sm ${step.done ? "text-ink-faint line-through" : "text-ink"}`}>{step.text}</span>
              {step.minutes !== undefined && <span className="shrink-0 text-xs tabular-nums text-ink-faint">{t("plan.minutes", { minutes: step.minutes })}</span>}
              <button
                type="button"
                aria-label={t("classes.stepRemove", { step: step.text })}
                title={t("classes.stepRemove", { step: step.text })}
                onClick={() => setSteps(assignmentId, steps.filter((s) => s.id !== step.id))}
                className="icon-btn icon-btn-sm tap-pad md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <XIcon aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-2.5 flex gap-1.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("classes.stepNew")}</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("classes.stepPlaceholder")} className="input h-9 text-[13px]" />
        </label>
        <label className="w-[4.5rem] shrink-0">
          <span className="sr-only">{t("classes.stepMinutes")}</span>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
            type="number"
            min={0}
            placeholder={t("plan.minShort")}
            className="input h-9 px-2.5 text-[13px]"
          />
        </label>
        <button type="submit" className="icon-btn shrink-0 border border-line" disabled={!text.trim()} aria-label={t("classes.stepAdd")} title={t("classes.stepAdd")}>
          <PlusIcon aria-hidden />
        </button>
      </form>
    </div>
  );
}
