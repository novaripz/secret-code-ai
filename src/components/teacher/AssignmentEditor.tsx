"use client";

// Create or edit one assignment, including the rules Panda has to obey.
//
// Two decisions worth defending. First, the rules sit in the same form as the
// title and the due date rather than behind a "settings" disclosure: they are
// part of designing the task, not a preference. Second, turning something off
// asks for a reason, and the reason is shown to the student. A rule a student
// cannot see the logic of reads as the app being broken, and the next thing
// they do is stop using it — so the box is right there, with the sentence they
// will read previewed underneath.

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AssignmentRules } from "@/lib/school/types";
import { useTeacherStore, type AssignmentDraft } from "./store";
import { useDialog } from "@/components/ui/Dialog";
import {
  Crumb,
  buttonClass,
  cardClass,
  fieldClass,
  labelClass,
  quietButtonClass,
  toDateInput,
} from "./primitives";
import { RuleChips } from "./RuleChips";

const ANSWER_CHOICES: { value: AssignmentRules["answers"]; label: string; blurb: string }[] = [
  { value: "guided", label: "Guided only", blurb: "Panda asks questions and gives hints. It never states the answer." },
  { value: "afterUnderstanding", label: "After understanding", blurb: "Panda works through it first, then will confirm the answer." },
  { value: "allowed", label: "Allowed", blurb: "Panda can answer directly. Right for review and for checking work." },
];

export function AssignmentEditor({ classId, assignmentId }: { classId: string; assignmentId: string | null }) {
  const router = useRouter();
  const dialog = useDialog();
  const existing = useTeacherStore((s) =>
    assignmentId ? (s.assignments[classId] ?? []).find((a) => a.id === assignmentId) : undefined,
  );
  const saveAssignment = useTeacherStore((s) => s.saveAssignment);
  const deleteAssignment = useTeacherStore((s) => s.deleteAssignment);

  const [draft, setDraft] = useState<AssignmentDraft>(() => ({
    title: existing?.title ?? "",
    instructions: existing?.instructions ?? "",
    due: toDateInput(existing?.dueAt ?? null),
    points: existing?.points !== undefined ? String(existing.points) : "",
    rules: existing?.rules ?? { answers: "guided", translation: "allowed", simplification: "allowed" },
  }));

  const restricted = draft.rules.translation === "disabled" || draft.rules.simplification === "disabled";
  const canSave = draft.title.trim().length > 0;

  const setRules = (patch: Partial<Omit<AssignmentRules, "assignmentId">>) =>
    setDraft((d) => ({ ...d, rules: { ...d.rules, ...patch } }));

  const preview = useMemo(() => {
    const off = [
      draft.rules.translation === "disabled" ? "translate" : null,
      draft.rules.simplification === "disabled" ? "simplify the wording" : null,
    ].filter(Boolean);
    if (off.length === 0) return null;
    return `On this assignment Panda can't ${off.join(" or ")}. ${draft.rules.restrictionReason?.trim() || "Your teacher hasn't given a reason yet."}`;
  }, [draft.rules]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    saveAssignment(classId, assignmentId, draft);
    router.push(`/teacher/classes/${classId}/assignments`);
  }

  async function remove() {
    if (!assignmentId) return;
    const ok = await dialog.confirm({
      title: "Delete this assignment?",
      description: `"${existing?.title ?? "It"}" disappears from every student's list, along with its rules.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) {
      deleteAssignment(classId, assignmentId);
      router.push(`/teacher/classes/${classId}/assignments`);
    }
  }

  const base = `/teacher/classes/${classId}`;

  return (
    <form onSubmit={submit}>
      <nav aria-label="Breadcrumb" className="text-xs">
        <Crumb href="/teacher">Classes</Crumb>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <Crumb href={`${base}/assignments`}>Assignments</Crumb>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text-dim)]">{assignmentId ? "Edit" : "New"}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
        {assignmentId ? "Edit assignment" : "New assignment"}
      </h1>

      <section className={`${cardClass} mt-5 p-4`}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Title</span>
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Factoring quadratics — practice set B"
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Instructions for students</span>
            <textarea
              rows={4}
              value={draft.instructions}
              onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
              placeholder="Problems 1–18. Show the factored form and the check."
              className={`${fieldClass} resize-y`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Due date</span>
              <input
                type="date"
                value={draft.due}
                onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Points</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={draft.points}
                onChange={(e) => setDraft((d) => ({ ...d, points: e.target.value }))}
                placeholder="20"
                className={fieldClass}
              />
            </label>
          </div>
        </div>
      </section>

      <section className={`${cardClass} mt-4 p-4`}>
        <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">What Panda may do here</h2>
        <p className="mt-0.5 text-xs text-[var(--text-faint)]">
          Enforced on the server, not suggested in a prompt. Students see these before they start.
        </p>

        <fieldset className="mt-4">
          <legend className={labelClass}>Answers</legend>
          <div className="mt-2 flex flex-col gap-2">
            {ANSWER_CHOICES.map((c) => {
              const active = draft.rules.answers === c.value;
              return (
                <label
                  key={c.value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                    active
                      ? "border-[var(--text)] bg-[var(--surface-1)]"
                      : "border-[var(--line)] hover:bg-[var(--surface-1)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="answers"
                    className="mt-0.5 accent-[var(--text)]"
                    checked={active}
                    onChange={() => setRules({ answers: c.value })}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)]">{c.label}</span>
                    <span className="block text-xs leading-relaxed text-[var(--text-dim)]">{c.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Translation"
            help="Reading the problem in their own language."
            on={draft.rules.translation === "allowed"}
            onChange={(on) => setRules({ translation: on ? "allowed" : "disabled" })}
          />
          <Toggle
            label="Simplifying"
            help="Rewriting the wording in plainer English."
            on={draft.rules.simplification === "allowed"}
            onChange={(on) => setRules({ simplification: on ? "allowed" : "disabled" })}
          />
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className={labelClass}>Instructions for Panda</span>
          <textarea
            rows={3}
            value={draft.rules.pandaInstructions ?? ""}
            onChange={(e) => setRules({ pandaInstructions: e.target.value })}
            placeholder="Don't give the factored form. Ask what two numbers multiply to c and add to b."
            className={`${fieldClass} resize-y`}
          />
          <span className="text-xs text-[var(--text-faint)]">
            Folded into Panda&apos;s instructions for this assignment. Students don&apos;t see this.
          </span>
        </label>

        {restricted && (
          <label className="mt-4 flex flex-col gap-1.5">
            <span className={labelClass}>Reason students see</span>
            <textarea
              rows={2}
              value={draft.rules.restrictionReason ?? ""}
              onChange={(e) => setRules({ restrictionReason: e.target.value })}
              placeholder="The exam is in English and this is the practice for it."
              className={`${fieldClass} resize-y`}
            />
          </label>
        )}

        {preview && (
          <div
            className="mt-3 rounded-xl border border-[var(--line)] p-3 text-sm leading-relaxed text-[var(--text-dim)]"
            style={{ background: "var(--surface-1)" }}
          >
            <p className={labelClass}>Preview — what the student reads</p>
            <p className="mt-1.5">{preview}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <RuleChips rules={draft.rules} />
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonClass} disabled={!canSave}>
          {assignmentId ? "Save changes" : "Create assignment"}
        </button>
        <button type="button" onClick={() => router.push(`${base}/assignments`)} className={quietButtonClass}>
          Cancel
        </button>
        {assignmentId && (
          <button
            type="button"
            onClick={remove}
            className="ml-auto rounded-xl px-3.5 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * A switch rather than a checkbox, because "allowed / disabled" is a state the
 * teacher should be able to read from across the room without parsing a label.
 */
function Toggle({
  label,
  help,
  on,
  onChange,
}: {
  label: string;
  help: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3 text-left transition-colors hover:bg-[var(--surface-1)]"
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors"
        style={{ background: on ? "var(--success)" : "var(--surface-3)" }}
      >
        <span
          className="h-4 w-4 rounded-full transition-transform"
          style={{ background: "var(--surface-0)", transform: on ? "translateX(16px)" : "none" }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text)]">
          {label}: {on ? "allowed" : "off"}
        </span>
        <span className="block text-xs leading-relaxed text-[var(--text-faint)]">{help}</span>
      </span>
    </button>
  );
}
