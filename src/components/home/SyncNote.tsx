"use client";

// One line under a school page's header saying where its data came from.
//
// Silent when there is nothing to say: a guest on a deployment with no
// database is not missing anything, and a note telling them so on every page
// would read as an error. It speaks up in three cases, each one a fact the
// student can act on -- they could sign in to see their teachers' work, the
// refresh failed and what they see is the saved copy, or ticks they made have
// not reached their teacher yet.

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useSchoolStore } from "@/store/useSchoolStore";
import { CircleAlertIcon, CircleCheckIcon, RefreshIcon, SpinnerIcon } from "@/components/icons";

export function SyncNote({ offerSignIn = false }: { offerSignIn?: boolean }) {
  const { t } = useI18n();
  const sync = useSchoolStore((s) => s.sync);
  const pending = useSchoolStore((s) => Object.keys(s.pendingStatus).length);
  const syncFromSchool = useSchoolStore((s) => s.syncFromSchool);

  const retry = (
    <button
      type="button"
      onClick={() => void syncFromSchool({ force: true })}
      className="tap inline-flex items-center gap-1 rounded-ui-sm px-1.5 font-[var(--weight-ui)] text-accent-text underline-offset-4 hover:underline"
    >
      <RefreshIcon className="h-3.5 w-3.5" aria-hidden />
      {t("classes.syncRetry")}
    </button>
  );

  if (sync.kind === "local") {
    if (!offerSignIn || sync.reason !== "signed-out") return null;
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-dim">
        {t("classes.syncSignIn")}
        <Link href="/settings" className="tap inline-flex items-center font-[var(--weight-ui)] text-accent-text underline-offset-4 hover:underline">
          {t("classes.syncSignInAction")}
        </Link>
      </p>
    );
  }

  if (sync.kind === "failed") {
    return (
      <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-warn">
        <CircleAlertIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{t(sync.denied ? "classes.syncDenied" : "classes.syncFailed")}</span>
        {pending > 0 && <span className="text-ink-dim">{t(pending === 1 ? "classes.syncPendingOne" : "classes.syncPending", { count: pending })}</span>}
        {retry}
      </p>
    );
  }

  if (sync.kind === "syncing" && sync.lastAt === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-ink-faint">
        <SpinnerIcon className="h-4 w-4 animate-spin" aria-hidden />
        {t("classes.syncing")}
      </p>
    );
  }

  if (sync.kind === "synced" || sync.kind === "syncing") {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-ink-faint">
        <CircleCheckIcon className="h-3.5 w-3.5 text-success" aria-hidden />
        {t("classes.synced")}
        {pending > 0 && <span>· {t(pending === 1 ? "classes.syncPendingOne" : "classes.syncPending", { count: pending })}</span>}
      </p>
    );
  }

  return null;
}
