"use client";

// "Add due dates to my calendar": one .ics file of everything still open.
//
// A file, built here in the browser, rather than a subscription URL: it needs
// no server, no account and no token that could leak, and it works on a guest
// laptop. The cost is that it is a snapshot, which the button's title says, so
// nobody expects their phone calendar to follow later changes.

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { buildIcs } from "@/lib/school/ics";
import { useSchoolStore } from "@/store/useSchoolStore";
import { CalendarIcon, CheckIcon } from "@/components/icons";

export function CalendarExport({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const assignments = useSchoolStore((s) => s.assignments);
  const classes = useSchoolStore((s) => s.classes);
  const [saved, setSaved] = useState(false);
  const count = assignments.filter((a) => a.status !== "done" && a.dueAt !== null).length;

  function download() {
    const ics = buildIcs(assignments, classes, { prefix: t("classes.icsPrefix") });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "panda-due-dates.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={count === 0}
      title={t("classes.icsTitle")}
      className={`btn btn-outline ${className}`}
    >
      {saved ? <CheckIcon aria-hidden /> : <CalendarIcon aria-hidden />}
      {saved ? t("classes.icsSaved") : t("classes.icsButton")}
    </button>
  );
}
