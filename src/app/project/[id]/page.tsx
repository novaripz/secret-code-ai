"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useStudioStore } from "@/store/useStudioStore";
import { loadProject } from "@/lib/storage";
import { Workspace } from "@/components/build/Workspace";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const setProject = useStudioStore((s) => s.setProject);
  const project = useStudioStore((s) => s.project);
  const [status, setStatus] = useState<"loading" | "not-found" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    loadProject(id).then((p) => {
      if (cancelled) return;
      if (!p) {
        setStatus("not-found");
        return;
      }
      setProject(p);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [id, setProject]);

  if (status === "loading") {
    return (
      <div className="h-dvh flex items-center justify-center bg-[var(--bg)] text-[var(--text-faint)] text-sm">
        {t("studio.loadingProject")}
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-3">
        <p>{t("studio.projectNotFound")}</p>
        <Link href="/" className="text-[var(--accent)] text-sm hover:underline">
          {t("studio.backToProjects")}
        </Link>
      </div>
    );
  }

  if (!project) return null;
  return <Workspace />;
}
