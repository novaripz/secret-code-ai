"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useSchoolStore } from "@/store/useSchoolStore";
import { isOverdue, urgencyScore, type Assignment, type SchoolClass } from "@/lib/school/types";
import { EmptyState, Section, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { AlertIcon, BookIcon, ChevronRightIcon, GraduationCapIcon, PlusIcon } from "@/components/icons";
import { MyGrades } from "@/components/home/MyGrades";
import { DueBadge, SchoolHeader, SchoolPage } from "@/components/home/SchoolKit";
import { SyncNote } from "@/components/home/SyncNote";
import { AddClassForm } from "@/components/home/ClassForms";
import { CalendarExport } from "@/components/home/CalendarExport";
import { FocusPill } from "@/components/home/FocusTimer";

// Classes, and what is due in each.
//
// The list is ordered by what is most urgent inside each class rather than
// alphabetically, because the question this page answers is "what do I need to
// deal with", not "what am I enrolled in".
//
// Two kinds of class live here, kept visibly apart. A teacher's class arrives
// from the class database when the student is signed in, carries a "From your
// teacher" badge and cannot be edited or deleted from here. A class the
// student adds is theirs, lives on this device, and is the whole story for a
// guest. Before, the student side could do neither: teacher classes never
// arrived, and adding your own had been taken away, so the page was a dead end
// under a grades card that already knew about the real classes.

function ClassCard({ cls, assignments }: { cls: SchoolClass; assignments: Assignment[] }) {
  const { t } = useI18n();
  const mine = assignments.filter((a) => a.classId === cls.id).sort((x, y) => urgencyScore(x) - urgencyScore(y));
  const open = mine.filter((a) => a.status !== "done");
  const late = open.filter((a) => isOverdue(a)).length;
  const done = mine.length - open.length;
  const next = open[0];

  return (
    <Link href={`/classes/${cls.id}`} className="card card-interactive group relative flex flex-col overflow-hidden p-4 pt-5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: cls.color ?? "var(--line-strong)" }} />
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-[var(--weight-strong)] text-ink">{cls.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-faint">
            {cls.teacher && <span className="truncate">{cls.teacher}</span>}
            {cls.origin === "school" && (
              <span className="badge badge-accent">
                <GraduationCapIcon aria-hidden />
                {t("classes.fromTeacher")}
              </span>
            )}
          </span>
        </span>
        <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>

      <span className="mt-4 block min-h-[3.25rem]">
        {next ? (
          <>
            <span className="eyebrow block">{t("classes.nextUp")}</span>
            <span className="mt-1 block truncate text-sm text-ink">{next.title}</span>
            <span className="mt-1.5 block">
              <DueBadge dueAt={next.dueAt} />
            </span>
          </>
        ) : (
          <span className="flex h-full items-center text-sm text-ink-dim">{mine.length === 0 ? t("classes.nothingYet") : t("classes.allDone")}</span>
        )}
      </span>

      <span className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[13px] text-ink-dim">
        <span>{t(open.length === 1 ? "classes.openOne" : "classes.open", { count: open.length })}</span>
        {late > 0 && (
          <span className="inline-flex items-center gap-1 text-danger">
            <AlertIcon className="h-3.5 w-3.5" aria-hidden />
            {t(late === 1 ? "classes.lateOne" : "classes.late", { count: late })}
          </span>
        )}
        {mine.length > 0 && (
          <span className="ml-auto flex items-center gap-2" title={t("classes.doneOf", { done, total: mine.length })}>
            <span className="sr-only">{t("classes.doneOf", { done, total: mine.length })}</span>
            <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-success" style={{ width: `${(done / mine.length) * 100}%` }} />
            </span>
            <span aria-hidden className="tabular-nums text-ink-faint">
              {done}/{mine.length}
            </span>
          </span>
        )}
      </span>
    </Link>
  );
}

export default function ClassesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useSchoolStore((s) => s.hydrated);
  const hydrate = useSchoolStore((s) => s.hydrate);
  const classes = useSchoolStore((s) => s.classes);
  const assignments = useSchoolStore((s) => s.assignments);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Classes with the most pressing work first; a class with nothing open
  // sinks, alphabetical among equals.
  const ordered = useMemo(() => {
    const best = (c: SchoolClass) =>
      Math.min(Number.MAX_SAFE_INTEGER, ...assignments.filter((a) => a.classId === c.id).map((a) => urgencyScore(a)));
    return [...classes].sort((a, b) => best(a) - best(b) || a.name.localeCompare(b.name));
  }, [classes, assignments]);

  return (
    <SchoolPage>
      <SchoolHeader
        icon={<BookIcon />}
        title={t("classes.title")}
        description={t("classes.subtitle")}
        actions={
          <>
            {hydrated && classes.length > 0 && <CalendarExport className="btn-sm" />}
            {!adding && (
              <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                {t("classes.add")}
              </Button>
            )}
          </>
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SyncNote offerSignIn />
        <FocusPill />
      </div>

      {adding && (
        <div className="mt-6">
          <AddClassForm
            onDone={(id) => {
              setAdding(false);
              if (id) router.push(`/classes/${id}`);
            }}
          />
        </div>
      )}

      {/* Grades come from the class database, and only ever the reader's own.
          It renders nothing for a guest, and a skeleton of its own while it
          loads, so the class list below does not jump when it arrives. */}
      <div className="mt-6">
        <MyGrades />
      </div>

      <Section title={t("classes.listTitle")} className="mt-8">
        {!hydrated ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={t("empty.loading")}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[184px] rounded-ui-lg" />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <EmptyState
            icon={<BookIcon />}
            title={t("classes.none")}
            description={t("classes.noneHint")}
            action={
              !adding && (
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
                  {t("classes.addFirst")}
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((c) => (
              <ClassCard key={c.id} cls={c} assignments={assignments} />
            ))}
          </div>
        )}
      </Section>
    </SchoolPage>
  );
}
