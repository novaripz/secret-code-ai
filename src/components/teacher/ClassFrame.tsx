"use client";

// The header and tab strip shared by every screen about one class.
//
// It exists so the class name, the colour and the "where am I" tabs are
// rendered identically on four routes instead of four times slightly
// differently. The tabs are links rather than local state because a teacher
// mid-lesson should be able to bookmark "Algebra II analytics" and land there.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeacherStore } from "./store";
import { Crumb, Scroller, cardClass } from "./primitives";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "roster", label: "Roster" },
  { slug: "assignments", label: "Assignments" },
  { slug: "analytics", label: "Analytics" },
] as const;

export function ClassFrame({ classId, children }: { classId: string; children: React.ReactNode }) {
  const klass = useTeacherStore((s) => s.classes.find((c) => c.id === classId));
  const pathname = usePathname();

  if (!klass) {
    return (
      <div className={`${cardClass} p-6`}>
        <h1 className="text-lg font-semibold text-[var(--text)]">That class isn&apos;t here</h1>
        <p className="mt-1.5 text-sm text-[var(--text-dim)]">
          It may have been deleted, or it belongs to another teacher.
        </p>
        <Link href="/teacher" className="mt-3 inline-block text-sm text-[var(--text-dim)] underline underline-offset-4">
          Back to your classes
        </Link>
      </div>
    );
  }

  const base = `/teacher/classes/${classId}`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs">
        <Crumb href="/teacher">Classes</Crumb>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text-dim)]">{klass.name}</span>
      </nav>

      <header className="mt-2 flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 h-8 w-1 shrink-0 rounded-full"
          style={{ background: klass.color ?? "var(--line-strong)" }}
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--text)]">{klass.name}</h1>
          <p className="mt-0.5 text-xs text-[var(--text-faint)]">
            {klass.period ? `${klass.period} · ` : ""}
            {klass.studentCount} students
          </p>
        </div>
      </header>

      <Scroller>
        <div
          role="tablist"
          aria-label="Class sections"
          className="mt-5 flex gap-1 border-b border-[var(--line)] pb-2"
        >
          {TABS.map(({ slug, label }) => {
            const href = slug ? `${base}/${slug}` : base;
            const active = slug
              ? pathname.startsWith(href)
              : pathname === base;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-[var(--surface-2)] font-medium text-[var(--text)]"
                    : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </Scroller>

      <div className="mt-5">{children}</div>
    </>
  );
}
