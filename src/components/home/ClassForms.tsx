"use client";

// The two forms a student fills in themselves: a class, and an assignment.
//
// A student can make their own classes again. That was taken away when
// teachers got real classes, on the reasoning that a student-made class would
// sit next to the teacher's under the same heading and confuse both. But it
// also left every guest -- and every student whose school does not use the
// teacher side -- with an app that could not hold a single piece of homework.
// So they are back, and kept clearly apart: anything a student made is theirs
// to edit and delete and lives only on this device; anything from a teacher is
// marked as such and cannot be edited here.

import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CLASS_COLORS } from "@/lib/school/types";
import { dueFromInputs, toDateInput, toTimeInput } from "@/lib/school/due";
import { useSchoolStore } from "@/store/useSchoolStore";
import { CheckIcon, XIcon } from "@/components/icons";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-[var(--weight-ui)] text-ink-dim">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export function AddClassForm({ onDone }: { onDone: (id: string | null) => void }) {
  const { t } = useI18n();
  const addClass = useSchoolStore((s) => s.addClass);
  const count = useSchoolStore((s) => s.classes.length);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [color, setColor] = useState(CLASS_COLORS[count % CLASS_COLORS.length]);
  const groupId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const cls = addClass({ name, teacher, color });
    onDone(cls.id);
  }

  return (
    <form onSubmit={submit} className="card animate-rise p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-[var(--weight-strong)] text-ink">{t("classes.add")}</h2>
        <button type="button" onClick={() => onDone(null)} aria-label={t("action.cancel")} title={t("action.cancel")} className="icon-btn">
          <XIcon aria-hidden />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("classes.name")}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("classes.namePlaceholder")} className="input" />
        </Field>
        <Field label={t("classes.teacherOptional")}>
          <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder={t("classes.teacherPlaceholder")} className="input" />
        </Field>
      </div>
      <fieldset className="mt-4">
        <legend id={groupId} className="mb-2 text-[13px] font-[var(--weight-ui)] text-ink-dim">
          {t("classes.color")}
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={groupId}>
          {CLASS_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={t("classes.colorN", { n: i + 1 })}
              onClick={() => setColor(c)}
              className="tap-sq flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105"
              style={{ background: c, borderColor: color === c ? "var(--text)" : "transparent" }}
            >
              {color === c && <CheckIcon className="h-4 w-4 text-white" aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="mt-4 text-xs text-ink-faint">{t("classes.deviceOnly")}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>
          {t("action.cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          {t("classes.create")}
        </button>
      </div>
    </form>
  );
}

export interface AssignmentDraft {
  title: string;
  date: string;
  time: string;
  points: string;
  minutes: string;
  instructions: string;
}

export function AssignmentForm({
  classId,
  existingId,
  onDone,
}: {
  classId: string;
  /** Editing one of the student's own assignments rather than adding one. */
  existingId?: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const addAssignment = useSchoolStore((s) => s.addAssignment);
  const updateAssignment = useSchoolStore((s) => s.updateAssignment);
  const existing = useSchoolStore((s) => (existingId ? s.assignments.find((a) => a.id === existingId) : undefined));
  const [draft, setDraft] = useState<AssignmentDraft>(() => ({
    title: existing?.title ?? "",
    date: toDateInput(existing?.dueAt ?? null),
    time: toTimeInput(existing?.dueAt ?? null),
    points: existing?.points !== undefined ? String(existing.points) : "",
    minutes: existing?.estimateMinutes !== undefined ? String(existing.estimateMinutes) : "",
    instructions: existing?.instructions ?? "",
  }));
  const set = (patch: Partial<AssignmentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const fields = {
      title: draft.title.trim(),
      instructions: draft.instructions.trim() || undefined,
      dueAt: dueFromInputs(draft.date, draft.time),
      points: draft.points ? Number(draft.points) : undefined,
      estimateMinutes: draft.minutes ? Number(draft.minutes) : undefined,
    };
    if (existing) updateAssignment(existing.id, fields);
    else addAssignment({ classId, ...fields });
    onDone();
  }

  return (
    <form onSubmit={submit} className="card animate-rise p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-[var(--weight-strong)] text-ink">{existing ? t("classes.editAssignment") : t("assignments.add")}</h2>
        <button type="button" onClick={onDone} aria-label={t("action.cancel")} title={t("action.cancel")} className="icon-btn">
          <XIcon aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <Field label={t("assignments.titleLabel")}>
          <input autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("assignments.titlePlaceholder")} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t("assignments.due")}>
            <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className="input" />
          </Field>
          <Field label={t("classes.timeOptional")}>
            <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} disabled={!draft.date} className="input" />
          </Field>
          <Field label={t("assignments.pointsLabel")}>
            <input type="number" min={0} inputMode="decimal" value={draft.points} onChange={(e) => set({ points: e.target.value })} placeholder="100" className="input" />
          </Field>
          <Field label={t("assignments.minutes")}>
            <input type="number" min={0} step={5} inputMode="numeric" value={draft.minutes} onChange={(e) => set({ minutes: e.target.value })} placeholder="45" className="input" />
          </Field>
        </div>
        <Field label={t("assignments.instructions")}>
          <textarea
            value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            placeholder={t("classes.instructionsPlaceholder")}
            rows={3}
            className="input resize-y"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            {t("action.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!draft.title.trim()}>
            {t("action.save")}
          </button>
        </div>
      </div>
    </form>
  );
}
