"use client";

// The header and section links shared by every screen about one class.
//
// It exists so the class name, the colour and the "where am I" links are
// rendered identically on every route instead of slightly differently on each.
// The sections are links rather than local state because a teacher mid-lesson
// should be able to bookmark "Algebra II analytics" and land there -- so they
// are a nav with aria-current, not a tablist: a tablist promises arrow-key
// tabs that switch panels in place, and these are pages.
//
// Loading is handled here once for all of them. Three cases, kept apart:
// nothing cached yet (a skeleton in the frame's own shape, never "this class
// isn't here" while a request is still out), a refresh of a class already on
// screen (the cached version stays visible, with no flicker), and a read that
// finished and found nothing (then, and only then, "not here").

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTeacherStore } from "./store";
import { LoadNote, Scroller } from "./primitives";
import { BackLink } from "@/components/home/SchoolKit";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { ChartColumn, ClipboardList, Users } from "lucide-react";
import { GraduationCapIcon, HomeIcon, ListTodoIcon } from "@/components/icons";

// Glyphs not in the shared set come straight from Lucide, with the app's
// stroke and hidden from assistive tech like every other icon here.
const RosterGlyph = (p: { className?: string }) => <Users aria-hidden="true" strokeWidth={1.85} {...p} />;
const GradesGlyph = (p: { className?: string }) => <ClipboardList aria-hidden="true" strokeWidth={1.85} {...p} />;
const AnalyticsGlyph = (p: { className?: string }) => <ChartColumn aria-hidden="true" strokeWidth={1.85} {...p} />;

const SECTIONS = [
  { slug: "", label: "Overview", icon: HomeIcon },
  { slug: "roster", label: "Roster", icon: RosterGlyph },
  { slug: "assignments", label: "Assignments", icon: ListTodoIcon },
  { slug: "grades", label: "Grades", icon: GradesGlyph },
  { slug: "analytics", label: "Analytics", icon: AnalyticsGlyph },
] as const;

/** Which section a path belongs to. A student's page is part of the roster. */
function sectionFor(pathname: string, base: string): string {
  const rest = pathname.slice(base.length).replace(/^\//, "");
  const first = rest.split("/")[0] ?? "";
  if (first === "students") return "roster";
  return SECTIONS.some((s) => s.slug === first) ? first : "";
}

function FrameSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading this class">
      <Skeleton className="mb-4 h-5 w-24" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-11 w-11 rounded-ui" />
        <div className="flex-1">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
      </div>
      <Skeleton className="mt-6 h-10 w-full max-w-lg rounded-ui" />
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-ui-lg" />
        ))}
      </div>
    </div>
  );
}

export function ClassFrame({ classId, children }: { classId: string; children: React.ReactNode }) {
  const klass = useTeacherStore((s) => s.classes.find((c) => c.id === classId));
  const state = useTeacherStore((s) => s.classState[classId]);
  const loadClass = useTeacherStore((s) => s.loadClass);
  const pathname = usePathname();

  // Every section under this frame needs the same class, so it is fetched once
  // here rather than by each of them.
  useEffect(() => {
    void loadClass(classId);
  }, [classId, loadClass]);

  if (!klass) {
    if (state?.error) {
      return (
        <>
          <BackLink href="/teacher">Your classes</BackLink>
          <LoadNote state={state} what="this class" onRetry={() => void loadClass(classId)} />
        </>
      );
    }
    // Not asked yet, or asked and not answered: either way, not an answer.
    if (!state?.loaded) return <FrameSkeleton />;
    return (
      <>
        <BackLink href="/teacher">Your classes</BackLink>
        <EmptyState
          icon={<GraduationCapIcon />}
          title="That class isn't here"
          description="It may have been deleted, or it belongs to another teacher."
          action={
            <Link href="/teacher" className="btn btn-secondary">
              Back to your classes
            </Link>
          }
        />
      </>
    );
  }

  const base = `/teacher/classes/${classId}`;
  const current = sectionFor(pathname, base);

  return (
    <>
      <BackLink href="/teacher">Your classes</BackLink>

      <header className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui text-lg font-[var(--weight-strong)] text-white"
          style={{ background: klass.color ?? "var(--surface-3)" }}
        >
          {klass.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl tracking-tight text-ink md:text-[26px]">{klass.name}</h1>
          <p className="mt-0.5 text-sm text-ink-dim">
            {klass.period ? `${klass.period} · ` : ""}
            {klass.studentCount === 1 ? "1 student" : `${klass.studentCount} students`}
          </p>
        </div>
      </header>

      <Scroller>
        <nav aria-label="Class sections" className="mt-5 border-b border-line">
          <ul className="flex gap-1">
            {SECTIONS.map(({ slug, label, icon: Icon }) => {
              const href = slug ? `${base}/${slug}` : base;
              const active = current === slug;
              return (
                <li key={label}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`tap relative inline-flex items-center gap-2 whitespace-nowrap px-3 pb-3 pt-1.5 text-sm transition-colors ${
                      active ? "font-[var(--weight-strong)] text-ink" : "text-ink-dim hover:text-ink"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-accent-text" : ""}`} />
                    {label}
                    {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Scroller>

      {state?.error && (
        // A refresh failed but the class is still on screen from before. Say
        // so, quietly, rather than replacing a usable page with an error.
        <p role="status" className="mt-3 text-sm text-warn">
          Couldn&apos;t refresh this class just now; showing what was loaded before.{" "}
          <button type="button" className="tap font-[var(--weight-ui)] underline underline-offset-4" onClick={() => void loadClass(classId)}>
            Try again
          </button>
        </p>
      )}

      <div className="mt-6">{children}</div>
    </>
  );
}
