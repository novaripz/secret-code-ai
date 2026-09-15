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
import { useEffect, useMemo, useState } from "react";
import {
  isSafeResourceUrl,
  type AssignmentResource,
  type AssignmentRules,
  type GradeCategory,
} from "@/lib/school/types";
import { useTeacherStore, type AssignmentDraft } from "./store";
import { useDialog } from "@/components/ui/Dialog";
import {
  ActionErrorNote,
  Crumb,
  buttonClass,
  cardClass,
  fieldClass,
  labelClass,
  quietButtonClass,
  toDateInput,
} from "./primitives";
import { RuleChips } from "./RuleChips";

// A zustand selector has to return the *same* reference when nothing changed,
// and `?? []` returns a fresh array on every snapshot — which React reads as a
// new value forever and turns into "Maximum update depth exceeded". One frozen
// empty array, shared, so the no-categories case is a stable reference rather
// than a render loop. This is the case a teacher who has not set any weights
// hits, which is most of them.
const NO_CATEGORIES: readonly GradeCategory[] = Object.freeze([]);

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
  const categories = useTeacherStore((s) => s.categories[classId] ?? NO_CATEGORIES);
  const loadGradebook = useTeacherStore((s) => s.loadGradebook);
  const saveAssignment = useTeacherStore((s) => s.saveAssignment);
  const deleteAssignment = useTeacherStore((s) => s.deleteAssignment);
  const actionError = useTeacherStore((s) => s.actionError);
  const clearActionError = useTeacherStore((s) => s.clearActionError);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<AssignmentDraft>(() => ({
    title: existing?.title ?? "",
    instructions: existing?.instructions ?? "",
    due: toDateInput(existing?.dueAt ?? null),
    points: existing?.points !== undefined ? String(existing.points) : "",
    categoryId: existing?.categoryId ?? "",
    teacherPinned: existing?.teacherPinned ?? false,
    resources: existing?.resources ?? [],
    rules: existing?.rules ?? { answers: "guided", translation: "allowed", simplification: "allowed" },
  }));

  // The category list is part of the gradebook load rather than the class load,
  // because most of the teacher's screens have no use for it. Asking for it
  // here is cheap and means the select is never empty for a teacher who came
  // straight to this form from a bookmark.
  useEffect(() => {
    void loadGradebook(classId);
  }, [classId, loadGradebook]);

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

  // Navigating away only after the write lands: leaving early and letting the
  // rollback happen on a screen the teacher is no longer looking at would mean
  // they find out their assignment vanished the next time they teach.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    const id = await saveAssignment(classId, assignmentId, draft);
    setSaving(false);
    if (id) router.push(`/teacher/classes/${classId}/assignments`);
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
      await deleteAssignment(classId, assignmentId);
      router.push(`/teacher/classes/${classId}/assignments`);
    }
  }

  const base = `/teacher/classes/${classId}`;

  return (
    <form onSubmit={(e) => void submit(e)}>
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

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Category</span>
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
              className={fieldClass}
            >
              {/* "No category" is a real choice and the default, not a prompt to
                  pick something. An assignment that is not filed still counts —
                  it lands in its own bucket in the grade breakdown. */}
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.weight}%
                </option>
              ))}
            </select>
            <span className="text-[11px] leading-relaxed text-[var(--text-faint)]">
              {categories.length === 0 ? (
                <>
                  This class has no categories yet, so grades are plain points across everything
                  marked. Add weights on the Grades tab when you want tests to count for more.
                </>
              ) : (
                <>Decides which weight this counts under when a grade is worked out.</>
              )}
            </span>
          </label>

          {/* The pin lives here, in the same card as the due date and the
              points, because it is a fact about the work rather than a
              preference about the app — and because a teacher deciding "this is
              the one that matters this week" is deciding it while they look at
              when it is due and what it is worth.

              The sentence underneath is the honest one, and it is deliberately
              not "students see this first". src/lib/school/planner.ts lifts a
              pinned assignment by two days and clamps the lift at today, so
              genuinely overdue work still sits above it. A teacher who pins
              three things expecting three things at the top, and finds last
              week's lab report above them, concludes the pin is broken — so the
              control says what the planner actually does. */}
          <div className="border-t border-[var(--line)] pt-4">
            <Toggle
              label="Priority"
              onWord="on"
              offWord="off"
              help="Moves it up each student's plan by about two days. It never moves above work that's already overdue — late work stays first."
              on={draft.teacherPinned}
              onChange={(on) => setDraft((d) => ({ ...d, teacherPinned: on }))}
            />
          </div>

          <ResourceEditor
            resources={draft.resources}
            onChange={(resources) => setDraft((d) => ({ ...d, resources }))}
          />
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

      <ActionErrorNote error={actionError} onDismiss={clearActionError} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonClass} disabled={!canSave || saving}>
          {saving ? "Saving…" : assignmentId ? "Save changes" : "Create assignment"}
        </button>
        <button type="button" onClick={() => router.push(`${base}/assignments`)} className={quietButtonClass}>
          Cancel
        </button>
        {assignmentId && (
          <button
            type="button"
            onClick={remove}
            className="tap inline-flex items-center ml-auto rounded-xl px-3.5 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
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
  onWord = "allowed",
  offWord = "off",
}: {
  label: string;
  help: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** The state read aloud. "allowed/off" suits a rule; a pin is "on/off". */
  onWord?: string;
  offWord?: string;
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
          {label}: {on ? onWord : offWord}
        </span>
        <span className="block text-xs leading-relaxed text-[var(--text-faint)]">{help}</span>
      </span>
    </button>
  );
}

/**
 * The links and materials a student can open from this assignment.
 *
 * Kept as a list of label-and-URL pairs rather than free text with links in it,
 * because the student's page renders these as buttons they can tap on a phone,
 * and because a URL we have parsed is a URL we can refuse. `javascript:` and
 * `data:` never make it to an anchor — the check is here for the teacher's
 * benefit (it tells them why the row is marked), in the data layer because that
 * is the last code before the write, and again on the way out of the database
 * because rows can be written by hand.
 *
 * No file upload, and that is a decision rather than an omission. Panda has no
 * storage bucket: building one that a teacher could trust with a worksheet
 * means a private bucket, policies mirroring the class rules, a progress and
 * failure story for a 20MB PDF on school wifi, and a server-side check on what
 * the file actually is. A half-built uploader that swallows a worksheet is
 * worse than a link field that works, and nearly every worksheet a teacher has
 * is already in Drive or Classroom with a link attached. So this makes the link
 * route obvious and quick instead of pretending to be something else — see the
 * note under the heading, which says outright that files are not stored here.
 *
 * The two bits of help below are for what teachers actually paste. A copied
 * Drive URL arrives complete; a typed one arrives as "docs.google.com/..." with
 * no scheme, which `isSafeResourceUrl` rejects and `cleanResources` then drops
 * on save — a silently missing resource. So a bare host gets https:// on blur.
 * And a pasted link with an empty label gets the host as a starting point,
 * because an unlabelled resource is dropped on save too.
 */
/**
 * What a teacher's pasted link needs before it can be saved, or null when it
 * needs nothing. Runs on blur rather than on every keystroke: rewriting a URL
 * under someone mid-type is how a field starts fighting its user.
 *
 * Only ever adds https:// to something with no scheme at all. A link that says
 * ftp:// or javascript: is left exactly as typed, so the validation below still
 * shows it as rejected instead of us quietly turning it into something else.
 */
function repairLink(url: string, label: string): Partial<AssignmentResource> | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const fixed = hasScheme ? trimmed : `https://${trimmed}`;
  if (!isSafeResourceUrl(fixed)) return null;

  const patch: Partial<AssignmentResource> = {};
  if (fixed !== url) patch.url = fixed;
  // An unlabelled resource is dropped on save, so a host is a better starting
  // point than nothing — and it is a suggestion the teacher can type over.
  if (label.trim().length === 0) {
    patch.label = new URL(fixed).hostname.replace(/^www\./, "");
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function ResourceEditor({
  resources,
  onChange,
}: {
  resources: AssignmentResource[];
  onChange: (next: AssignmentResource[]) => void;
}) {
  const set = (index: number, patch: Partial<AssignmentResource>) =>
    onChange(resources.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  // Order is the teacher's, and it is information: "read this first, then the
  // slides" is a sentence they should not have to write in the instructions
  // because the list already says it. Two buttons rather than drag-and-drop —
  // dragging has no keyboard story worth the name, and this list is three items
  // long on the days it exists at all.
  const move = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= resources.length) return;
    const next = [...resources];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  return (
    <fieldset className="border-t border-[var(--line)] pt-4">
      <legend className="sr-only">Resources</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={labelClass}>Resources</span>
        <button
          type="button"
          onClick={() => onChange([...resources, { label: "", url: "" }])}
          className="tap inline-flex items-center rounded-lg px-2 py-1 text-sm md:text-xs text-[var(--text-dim)] underline underline-offset-4 transition-colors hover:text-[var(--text)]"
        >
          Add a link
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
        The reading, the slide deck, the practice set. Students see these on the assignment.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
        Panda doesn&apos;t store files. To share a worksheet or a photo of the board, put it in
        Drive, Classroom or OneDrive, set it so anyone with the link can view, and paste that link
        here.
      </p>

      {resources.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {resources.map((r, i) => {
            const bad = r.url.trim().length > 0 && !isSafeResourceUrl(r.url);
            return (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <input
                  value={r.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                  placeholder="Chapter 4 reading"
                  aria-label={`Resource ${i + 1} label`}
                  className={`${fieldClass} min-w-0 flex-1 sm:max-w-[14rem]`}
                />
                <div className="min-w-0 flex-1">
                  <input
                    value={r.url}
                    onChange={(e) => set(i, { url: e.target.value })}
                    onBlur={(e) => {
                      const patch = repairLink(e.target.value, r.label);
                      if (patch) set(i, patch);
                    }}
                    placeholder="Paste a Drive or Classroom link"
                    inputMode="url"
                    aria-label={`Resource ${i + 1} link`}
                    aria-invalid={bad || undefined}
                    className={fieldClass}
                    style={bad ? { borderColor: "var(--danger)" } : undefined}
                  />
                  {bad && (
                    <p className="mt-1 text-[11px] text-[var(--danger)]">
                      Only http:// and https:// links can be shown to students. This one will not be
                      saved.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Labelled by position and by what the link is called, so a
                      screen reader announces "Move Chapter 4 reading up" rather
                      than four identical arrows. */}
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${r.label.trim() || `resource ${i + 1}`} up`}
                    className="tap inline-flex items-center rounded-lg border border-[var(--line-strong)] px-2 py-2.5 text-sm md:text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === resources.length - 1}
                    aria-label={`Move ${r.label.trim() || `resource ${i + 1}`} down`}
                    className="tap inline-flex items-center rounded-lg border border-[var(--line-strong)] px-2 py-2.5 text-sm md:text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(resources.filter((_, j) => j !== i))}
                    aria-label={`Remove ${r.label.trim() || `resource ${i + 1}`}`}
                    className="tap inline-flex items-center rounded-lg border border-[var(--line-strong)] px-2.5 py-2.5 text-sm md:text-xs text-[var(--text-faint)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
