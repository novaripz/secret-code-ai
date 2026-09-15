"use client";

// The links a teacher attached to an assignment, on the student's copy of it.
//
// It reads the assignment from the database by id rather than taking the links
// as a prop, because the rest of this page is drawn from the local school store
// — which is this browser's own copy and has never held anything a teacher
// typed. Resources belong to the teacher, so they come from where the teacher
// put them.
//
// Renders nothing at all when there is no database, nobody is signed in, the
// assignment is not one of theirs, or it simply has no links. An empty heading
// that says "Resources: none" is noise on every assignment that has none, which
// is most of them.
//
// Every href here has been through `isSafeResourceUrl` twice — once in the
// teacher's form and once in the data layer on the way out of the row — so a
// `javascript:` link cannot reach this anchor. `rel="noreferrer"` because a
// school worksheet host has no business being told which student came from
// which assignment.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase/browser";
import { getAssignment } from "@/lib/db";
import type { AssignmentResource } from "@/lib/school/types";

export function AssignmentResources({ assignmentId }: { assignmentId: string }) {
  const { t } = useI18n();
  const [resources, setResources] = useState<AssignmentResource[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = await getSupabase();
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const found = await getAssignment(supabase, assignmentId);
      if (!cancelled && found?.assignment.resources?.length) {
        setResources(found.assignment.resources);
      }
    })().catch(() => {
      // Silent on purpose, and the only place in this feature that is. A
      // failed read here means the extra links are missing from a page that is
      // otherwise complete and usable; an error banner over the student's
      // actual assignment would be louder than what was lost.
    });
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  if (resources.length === 0) return null;

  return (
    <section aria-labelledby="resources-heading" className="mt-6">
      <h2 id="resources-heading" className="text-sm font-medium text-[var(--text)]">
        {t("resources.title")}
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {resources.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="tap flex items-baseline justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3.5 py-2.5 text-sm text-[var(--text)] transition-colors hover:border-[var(--line-strong)]"
            >
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="shrink-0 text-xs text-[var(--text-faint)]">{t("resources.open")}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
