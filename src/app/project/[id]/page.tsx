"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useStudioStore } from "@/store/useStudioStore";
import { loadProject } from "@/lib/storage";
import { Workspace } from "@/components/build/Workspace";
import { LinkButton, Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { PandaMark } from "@/components/Panda";
import { ArrowLeftIcon, CircleAlertIcon, RefreshIcon, SearchIcon } from "@/components/icons";

type Status = "loading" | "not-found" | "error" | "ready";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const setProject = useStudioStore((s) => s.setProject);
  const project = useStudioStore((s) => s.project);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadProject(id)
      .then((p) => {
        // A slower read for a project the student has already left is dropped.
        if (cancelled) return;
        if (!p) {
          setStatus("not-found");
          return;
        }
        setProject(p);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, setProject, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  if (status === "loading" || (status === "ready" && project?.id !== id)) {
    return <WorkspaceSkeleton label={t("studio.loadingProject")} />;
  }

  if (status === "not-found" || status === "error") {
    const notFound = status === "not-found";
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--bg)] p-4 text-[var(--text)]">
        <EmptyState
          className="w-full max-w-md bg-[var(--surface-0)]"
          icon={notFound ? <SearchIcon /> : <CircleAlertIcon />}
          title={t(notFound ? "build.notFoundTitle" : "build.loadErrorTitle")}
          description={t(notFound ? "build.notFoundBody" : "build.loadErrorBody")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!notFound && (
                <Button variant="secondary" icon={<RefreshIcon />} onClick={retry}>
                  {t("build.tryAgain")}
                </Button>
              )}
              {/* Back to the project list — this used to go to the chat. */}
              <LinkButton href="/build" variant="primary" icon={<ArrowLeftIcon />}>
                {t("studio.backToProjects")}
              </LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  return <Workspace />;
}

/**
 * The workspace's outline while the project is read from the browser's
 * storage, so the screen the student lands on already has the shape of the one
 * they are about to use, instead of a sentence in the middle of a black page.
 */
function WorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)]" aria-busy="true" aria-label={label}>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--surface-0)] px-3">
        <PandaMark className="h-7 w-7 opacity-80" />
        <Skeleton className="h-4 w-40" />
        <span className="flex-1" />
        <Skeleton className="hidden h-8 w-72 md:block" />
        <span className="flex-1" />
        <Skeleton className="h-8 w-8" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-12 shrink-0 flex-col items-center gap-3 border-r border-[var(--line)] bg-[var(--surface-0)] py-3 md:flex">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-7" />
          ))}
        </div>
        <div className="hidden w-60 shrink-0 space-y-2.5 border-r border-[var(--line)] bg-[var(--surface-0)] p-3 md:block">
          {[70, 55, 80, 45, 60].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 bg-[var(--surface-1)] p-5">
          {[60, 40, 75, 30, 55, 65, 35].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />
          ))}
          <p className="pt-4 text-sm text-[var(--text-faint)]">{label}</p>
        </div>
        <div className="hidden w-[340px] shrink-0 space-y-3 border-l border-[var(--line)] bg-[var(--surface-0)] p-4 lg:block">
          <Skeleton className="mx-auto h-20 w-20 rounded-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
