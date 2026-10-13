"use client";

// One line in, one assignment out: "bio lab fri 45m".
//
// The preview is the important part. Every field the parser pulled out is
// shown as a chip before anything is saved, so a misread ("fri" taken as the
// due day when it was part of the title) is visible and fixable rather than
// quietly wrong in the planner. When no class was named, a picker says where
// it will go, defaulting to the student's own "My tasks" list, which is
// created the first time it is needed.

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { parseQuickAdd } from "@/lib/school/quickAdd";
import { PERSONAL_CLASS_ID, useSchoolStore } from "@/store/useSchoolStore";
import { CLASS_COLORS } from "@/lib/school/types";
import { BookIcon, ClockIcon, PlusIcon, SparkleSmallIcon, StarIcon } from "@/components/icons";
import { useDue } from "./SchoolKit";

export function QuickAdd({ defaultClassId, autoFocus = false }: { defaultClassId?: string; autoFocus?: boolean }) {
  const { t } = useI18n();
  const due = useDue();
  const classes = useSchoolStore((s) => s.classes);
  const addAssignment = useSchoolStore((s) => s.addAssignment);
  const addClass = useSchoolStore((s) => s.addClass);
  const removeAssignment = useSchoolStore((s) => s.removeAssignment);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string>("");
  const [added, setAdded] = useState<{ id: string; title: string; className: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only classes a student can file things under. A teacher's class can hold
  // the student's own reminders too -- they stay on this device either way.
  const choices = useMemo(() => classes.filter((c) => c.id !== PERSONAL_CLASS_ID), [classes]);
  const parsed = useMemo(() => parseQuickAdd(text, choices), [text, choices]);

  const fallback = defaultClassId ?? PERSONAL_CLASS_ID;
  const classId = parsed?.classId ?? (picked || fallback);
  const className =
    classId === PERSONAL_CLASS_ID ? t("classes.personal") : (classes.find((c) => c.id === classId)?.name ?? t("classes.personal"));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed || !parsed.title) return;
    if (classId === PERSONAL_CLASS_ID && !classes.some((c) => c.id === PERSONAL_CLASS_ID)) {
      addClass({ id: PERSONAL_CLASS_ID, name: t("classes.personal"), color: CLASS_COLORS[5] });
    }
    const a = addAssignment({
      classId,
      title: parsed.title,
      dueAt: parsed.dueAt,
      estimateMinutes: parsed.minutes,
      points: parsed.points,
    });
    setAdded({ id: a.id, title: a.title, className });
    setText("");
    setPicked("");
    inputRef.current?.focus();
  }

  const showPreview = parsed !== null && text.trim().length > 0;

  return (
    <form onSubmit={submit} className="card p-3 sm:p-4" aria-label={t("classes.quickAddLabel")}>
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("classes.quickAddLabel")}</span>
          <SparkleSmallIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-text" aria-hidden />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setAdded(null);
            }}
            placeholder={t("classes.quickAddPlaceholder")}
            aria-describedby="quick-add-help"
            className="input pl-9"
            enterKeyHint="done"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn btn-primary shrink-0" disabled={!parsed?.title}>
          <PlusIcon aria-hidden />
          <span className="hidden sm:inline">{t("classes.quickAddSubmit")}</span>
          <span className="sr-only sm:hidden">{t("classes.quickAddSubmit")}</span>
        </button>
      </div>

      <div id="quick-add-help" className="mt-2.5 min-h-[1.75rem]" aria-live="polite">
        {showPreview ? (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="eyebrow mr-1">{t("classes.quickAddPreview")}</span>
            <span className="badge badge-accent max-w-full truncate">{parsed.title || t("classes.quickAddNeedsTitle")}</span>
            {parsed.classId ? (
              <span className="badge">
                <BookIcon aria-hidden />
                {className}
              </span>
            ) : (
              <label className="inline-flex items-center gap-1.5">
                <span className="sr-only">{t("classes.quickAddClass")}</span>
                <BookIcon className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
                <select
                  value={picked || fallback}
                  onChange={(e) => setPicked(e.target.value)}
                  className="h-8 rounded-full border border-line bg-surface-2 px-2.5 text-xs text-ink"
                >
                  <option value={PERSONAL_CLASS_ID}>{t("classes.personal")}</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {parsed.dueAt !== null && <span className="badge badge-info">{due(parsed.dueAt).text}</span>}
            {parsed.minutes !== undefined && (
              <span className="badge">
                <ClockIcon aria-hidden />
                {t("plan.minutes", { minutes: parsed.minutes })}
              </span>
            )}
            {parsed.points !== undefined && (
              <span className="badge">
                <StarIcon aria-hidden />
                {t("assignments.points", { points: parsed.points })}
              </span>
            )}
          </div>
        ) : added ? (
          <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-ink-dim">
            <span>{t("classes.quickAddDone", { title: added.title, className: added.className })}</span>
            <button
              type="button"
              onClick={() => {
                removeAssignment(added.id);
                setAdded(null);
              }}
              className="tap inline-flex items-center font-[var(--weight-ui)] text-accent-text underline-offset-4 hover:underline"
            >
              {t("classes.undo")}
            </button>
          </p>
        ) : (
          <p className="text-[13px] text-ink-faint">{t("classes.quickAddHint")}</p>
        )}
      </div>
    </form>
  );
}
