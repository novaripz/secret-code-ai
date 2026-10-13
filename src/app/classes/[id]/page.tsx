"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useSchoolStore, type AssignmentSnapshot } from "@/store/useSchoolStore";
import { urgencyScore, type Assignment } from "@/lib/school/types";
import { EmptyState, Section, Skeleton } from "@/components/ui/primitives";
import { Button, IconButton } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/Dialog";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  GraduationCapIcon,
  ListTodoIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from "@/components/icons";
import { MyGrades } from "@/components/home/MyGrades";
import { BackLink, DueBadge, LiftChip, SchoolPage } from "@/components/home/SchoolKit";
import { AssignmentForm } from "@/components/home/ClassForms";
import { SyncNote } from "@/components/home/SyncNote";

// One class: what is due, and a way in to ask Panda about each piece of it.
//
// Done work drops into its own folded list rather than staying in line with a
// strike through it, so the list a student scans is only what is left. Ticking
// something off keeps a constant label -- "Done: Lab report" -- with the state
// carried by aria-pressed, rather than a label that changes under the finger
// that pressed it.
//
// Deleting asks first, and then offers an undo, because a thumb on a phone
// hits the wrong row more often than anyone means to delete homework.

function DoneToggle({ a }: { a: Assignment }) {
  const { t } = useI18n();
  const setStatus = useSchoolStore((s) => s.setStatus);
  const done = a.status === "done";
  return (
    <button
      type="button"
      onClick={() => setStatus(a.id, done ? "todo" : "done")}
      aria-pressed={done}
      aria-label={t("classes.doneToggle", { title: a.title })}
      title={t("classes.doneToggle", { title: a.title })}
      className="tap-sq -m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-sm transition-colors hover:bg-surface-2"
    >
      <span
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-2 transition-colors ${
          done ? "border-success bg-success text-bg" : "border-line-strong"
        }`}
      >
        {done && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}

function Row({ a, steps, onDelete, onEdit }: { a: Assignment; steps?: { done: boolean }[]; onDelete?: () => void; onEdit?: () => void }) {
  const { t } = useI18n();
  const done = a.status === "done";
  const stepsDone = steps?.filter((s) => s.done).length ?? 0;

  return (
    <li className="group flex items-start gap-3 px-4 py-3.5">
      <DoneToggle a={a} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/classes/${a.classId}/${a.id}`}
          className={`block text-[15px] leading-snug underline-offset-4 hover:underline ${done ? "text-ink-faint line-through" : "font-[var(--weight-ui)] text-ink"}`}
        >
          {a.title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {!done && <DueBadge dueAt={a.dueAt} />}
          {!done && a.teacherPinned && <LiftChip kind="pinned" />}
          {a.points !== undefined && (
            <span className="badge">
              <StarIcon aria-hidden />
              {t("assignments.points", { points: a.points })}
            </span>
          )}
          {a.estimateMinutes !== undefined && !done && (
            <span className="badge">
              <ClockIcon aria-hidden />
              {t("plan.minutes", { minutes: a.estimateMinutes })}
            </span>
          )}
          {steps && steps.length > 0 && !done && (
            <span className="badge">
              <ListTodoIcon aria-hidden />
              {t("classes.stepsCount", { done: stepsDone, total: steps.length })}
            </span>
          )}
        </div>
      </div>
      {onEdit && (
        <IconButton
          label={t("classes.editAssignmentNamed", { title: a.title })}
          size="sm"
          onClick={onEdit}
          className="tap-pad text-ink-faint md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <PencilIcon aria-hidden />
        </IconButton>
      )}
      {onDelete && (
        <IconButton
          label={t("classes.deleteAssignment", { title: a.title })}
          size="sm"
          onClick={onDelete}
          className="tap-pad text-ink-faint hover:!text-danger md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <TrashIcon aria-hidden />
        </IconButton>
      )}
    </li>
  );
}

export default function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const dialog = useDialog();
  const hydrated = useSchoolStore((s) => s.hydrated);
  const hydrate = useSchoolStore((s) => s.hydrate);
  const sync = useSchoolStore((s) => s.sync);
  const classes = useSchoolStore((s) => s.classes);
  const assignments = useSchoolStore((s) => s.assignments);
  const allSteps = useSchoolStore((s) => s.steps);
  const { removeClass, removeAssignment, restoreAssignment, updateClass } = useSchoolStore.getState();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [removed, setRemoved] = useState<AssignmentSnapshot | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const cls = classes.find((c) => c.id === id);
  const mine = useMemo(() => assignments.filter((a) => a.classId === id).sort((x, y) => urgencyScore(x) - urgencyScore(y)), [assignments, id]);
  const open = mine.filter((a) => a.status !== "done");
  const done = mine.filter((a) => a.status === "done");
  const own = cls !== undefined && cls.origin !== "school";

  async function deleteAssignment(a: Assignment) {
    const ok = await dialog.confirm({
      title: t("classes.deleteAssignmentTitle", { title: a.title }),
      description: t("classes.deleteAssignmentBody"),
      confirmLabel: t("classes.delete"),
      danger: true,
    });
    if (!ok) return;
    // Read at the moment of deleting, so the undo restores exactly what was there.
    const now = useSchoolStore.getState();
    setRemoved({ assignment: a, rules: now.rules.find((r) => r.assignmentId === a.id), steps: now.steps[a.id], doOn: now.doOn[a.id] });
    removeAssignment(a.id);
  }

  async function deleteClass() {
    if (!cls) return;
    const ok = await dialog.confirm({
      title: t("classes.deleteClassTitle", { name: cls.name }),
      description: t(mine.length === 1 ? "classes.deleteClassBodyOne" : "classes.deleteClassBody", { count: mine.length }),
      confirmLabel: t("classes.delete"),
      danger: true,
    });
    if (!ok) return;
    removeClass(cls.id);
    router.push("/classes");
  }

  async function rename() {
    if (!cls) return;
    const next = await dialog.prompt({ title: t("classes.renameTitle"), defaultValue: cls.name, confirmLabel: t("action.save") });
    if (next && next.trim()) updateClass(cls.id, { name: next.trim() });
  }

  // Still loading, or a teacher's class that the first refresh has not
  // brought in yet: a skeleton, not "this isn't here".
  const waiting = !hydrated || (!cls && (sync.kind === "idle" || sync.kind === "syncing"));

  if (waiting) {
    return (
      <SchoolPage>
        <Skeleton className="mb-4 h-5 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
        <div className="mt-8 flex flex-col gap-2" aria-busy="true" aria-label={t("empty.loading")}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-ui-lg" />
          ))}
        </div>
      </SchoolPage>
    );
  }

  if (!cls) {
    return (
      <SchoolPage>
        <BackLink href="/classes">{t("classes.title")}</BackLink>
        <EmptyState
          icon={<GraduationCapIcon />}
          title={t("classes.missingTitle")}
          description={t("classes.missingBody")}
          action={
            <Link href="/classes" className="btn btn-secondary">
              {t("classes.backToClasses")}
            </Link>
          }
        />
      </SchoolPage>
    );
  }

  return (
    <SchoolPage>
      <BackLink href="/classes">{t("classes.title")}</BackLink>

      {/* Title and actions side by side from `sm`; on a phone the actions take
          their own row, so three buttons never squeeze the class name. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui text-white"
            style={{ background: cls.color ?? "var(--surface-3)" }}
          >
            <span className="text-lg font-[var(--weight-strong)]">{cls.name.trim().charAt(0).toUpperCase()}</span>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl tracking-tight text-ink md:text-[26px]">{cls.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-ink-dim md:text-sm">
              {cls.teacher && <span>{cls.teacher}</span>}
              {cls.origin === "school" ? (
                <span className="badge badge-accent">
                  <GraduationCapIcon aria-hidden />
                  {t("classes.fromTeacher")}
                </span>
              ) : (
                <span className="badge">{t("classes.addedByYou")}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {!adding && (
            <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={() => setAdding(true)}>
              {t("assignments.add")}
            </Button>
          )}
          {own && (
            <>
              <IconButton label={t("classes.rename")} onClick={() => void rename()}>
                <PencilIcon aria-hidden />
              </IconButton>
              <IconButton label={t("classes.deleteClass")} onClick={() => void deleteClass()} className="hover:!text-danger">
                <TrashIcon aria-hidden />
              </IconButton>
            </>
          )}
        </div>
      </div>
      <div className="mt-3">
        <SyncNote />
      </div>

      {adding && (
        <div className="mt-6">
          <AssignmentForm classId={cls.id} onDone={() => setAdding(false)} />
        </div>
      )}

      {/* Keyed by the assignment, so switching from one edit to another
          starts from the right row rather than the last draft. */}
      {editing && (
        <div className="mt-6">
          <AssignmentForm key={editing} classId={cls.id} existingId={editing} onDone={() => setEditing(null)} />
        </div>
      )}

      {removed && (
        <p role="status" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ui border border-line bg-surface-1 px-4 py-2.5 text-sm text-ink-dim">
          {t("classes.deleted", { title: removed.assignment.title })}
          <button
            type="button"
            className="tap inline-flex items-center font-[var(--weight-ui)] text-accent-text underline-offset-4 hover:underline"
            onClick={() => {
              restoreAssignment(removed);
              setRemoved(null);
            }}
          >
            {t("classes.undo")}
          </button>
        </p>
      )}

      {/* Their own grade in this class, with the breakdown and the what-if
          behind it. Only ever theirs: the component reads the signed-in user
          and the database refuses a request for anyone else's marks. */}
      <div className="mt-6">
        <MyGrades classId={cls.id} />
      </div>

      <Section title={t("classes.todoTitle", { count: open.length })} className="mt-8">
        {mine.length === 0 ? (
          <EmptyState
            icon={<ListTodoIcon />}
            title={t("assignments.none")}
            description={cls.origin === "school" ? t("classes.emptySchool") : t("classes.emptyOwn")}
            action={
              !adding && (
                <Button variant="secondary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                  {t("assignments.add")}
                </Button>
              )
            }
          />
        ) : open.length === 0 ? (
          <div className="card flex items-center gap-3 px-4 py-4 text-sm text-ink-dim">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckIcon className="h-4 w-4" aria-hidden />
            </span>
            {t("classes.allDoneHere")}
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {open.map((a) => (
              <Row
                key={a.id}
                a={a}
                steps={allSteps[a.id]}
                onDelete={a.origin !== "school" ? () => void deleteAssignment(a) : undefined}
                onEdit={a.origin !== "school" ? () => setEditing(a.id) : undefined}
              />
            ))}
          </ul>
        )}
      </Section>

      {done.length > 0 && (
        <section className="mt-6">
          <button
            type="button"
            className="tap inline-flex items-center gap-1.5 rounded-ui-sm text-sm font-[var(--weight-ui)] text-ink-dim hover:text-ink"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${showDone ? "" : "-rotate-90"}`} aria-hidden />
            {t("classes.doneTitle", { count: done.length })}
          </button>
          {showDone && (
            <ul className="card mt-2 divide-y divide-line overflow-hidden">
              {done.map((a) => (
                <Row key={a.id} a={a} onDelete={a.origin !== "school" ? () => void deleteAssignment(a) : undefined} />
              ))}
            </ul>
          )}
        </section>
      )}
    </SchoolPage>
  );
}
