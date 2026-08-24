"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useStudioStore } from "@/store/useStudioStore";
import { loadProject } from "@/lib/storage";
import { StudioLayout } from "@/components/layout/StudioLayout";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
      <div className="h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text-faint)] text-sm">
        Loading your project…
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)] gap-3">
        <p>We couldn&apos;t find that project in this browser.</p>
        <Link href="/" className="text-[var(--accent)] text-sm hover:underline">
          Back to your projects
        </Link>
      </div>
    );
  }

  if (!project) return null;
  return <StudioLayout />;
}
