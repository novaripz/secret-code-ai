"use client";

// The links a teacher attached to an assignment, on the student's copy of it.
//
// They arrive with the assignment now. The student's classes are refreshed
// from the class database (see useSchoolStore), and every teacher-set
// assignment carries its resources, already cleaned on the way out of the
// row. The fallback read below is for a cached copy written before that
// refresh existed: it asks the database by id, but only for an id that could
// be a database row at all. It used to ask with the local nanoid of an
// assignment the student had typed in, which could never match anything.
//
// Renders nothing when there are no links, which is most assignments. An empty
// heading that says "Resources: none" is noise.
//
// Every href here has been through `isSafeResourceUrl` -- in the teacher's
// form, in the data layer on the way in, and again on the way out of the row
// -- so a `javascript:` link cannot reach this anchor. `rel="noreferrer"`
// because a school worksheet host has no business being told which student
// came from which assignment.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase/browser";
import { getAssignment } from "@/lib/db";
import { cleanResources, type AssignmentResource } from "@/lib/school/types";
import { ExternalLinkIcon, FileTextIcon } from "@/components/icons";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AssignmentResources({ assignmentId, resources }: { assignmentId: string; resources?: AssignmentResource[] }) {
  const { t } = useI18n();
  const [fetched, setFetched] = useState<AssignmentResource[]>([]);
  const given = resources ? cleanResources(resources) : null;
  const shouldFetch = resources === undefined && UUID.test(assignmentId);

  useEffect(() => {
    if (!shouldFetch) return;
    let cancelled = false;
    (async () => {
      const supabase = await getSupabase();
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const found = await getAssignment(supabase, assignmentId);
      if (!cancelled && found?.assignment.resources?.length) setFetched(found.assignment.resources);
    })().catch(() => {
      // Silent on purpose. A failed read here means the extra links are
      // missing from a page that is otherwise complete and usable; an error
      // banner over the student's actual assignment would be louder than
      // what was lost.
    });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, shouldFetch]);

  const list = given ?? fetched;
  if (list.length === 0) return null;

  return (
    <section aria-labelledby="resources-heading">
      <h3 id="resources-heading" className="eyebrow">
        {t("resources.title")}
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {list.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="tap flex items-center gap-2.5 rounded-ui border border-line bg-surface-0 px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <FileTextIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
              <span className="sr-only">{t("resources.opensNewTab")}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
