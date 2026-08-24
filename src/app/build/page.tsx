"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDialog } from "@/components/ui/Dialog";
import { useProfileStore } from "@/store/useProfileStore";
import { createEmptyProject, createFile } from "@/lib/fileSystem";
import { deleteProject, listProjects, saveProject, type ProjectSummary } from "@/lib/storage";
import { importProjectFromZip } from "@/lib/zip";
import { HammerIcon, PlusIcon, TrashIcon, UploadIcon } from "@/components/icons";

const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Project</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Welcome to your new project</h1>
    <p>Edit this file, or ask for help and I&apos;ll build something for you.</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`;

const STARTER_CSS = `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0d0d0d;
  color: #ececec;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
}
h1 { font-size: 2rem; }
`;

const STARTER_JS = `console.log("Project loaded. Ready to build!");
`;

export default function BuildPage() {
  const router = useRouter();
  const dialog = useDialog();
  const displayName = useProfileStore((s) => s.displayName);
  const hydrated = useProfileStore((s) => s.hydrated);

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);

  async function handleCreate() {
    const name = await dialog.prompt({
      title: "Name your project",
      description: "You can rename it any time.",
      placeholder: "My Project",
      defaultValue: "My Project",
      confirmLabel: "Create",
    });
    if (!name) return;

    setBusy(true);
    try {
      const project = createEmptyProject(name);
      createFile(project, "index.html", STARTER_HTML);
      createFile(project, "style.css", STARTER_CSS);
      createFile(project, "script.js", STARTER_JS);
      await saveProject(project);
      router.push(`/project/${project.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(project: ProjectSummary, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await dialog.confirm({
      title: "Delete this project?",
      description: `"${project.name}" and everything in it will be gone for good.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await deleteProject(project.id);
    setProjects((prev) => prev?.filter((p) => p.id !== project.id) ?? null);
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const imported = await importProjectFromZip(file);
      await saveProject(imported);
      router.push(`/project/${imported.id}`);
    } catch (err) {
      await dialog.alert({
        title: "Couldn't open that file",
        description: err instanceof Error ? err.message : "That .zip didn't look like a project.",
      });
    } finally {
      setBusy(false);
    }
  }

  const name = hydrated ? displayName() : "";

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {name ? `${name}'s projects` : "Your projects"}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-faint)]">
                Real files you can edit, run, and download. Everything saves in this browser automatically.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--text-dim)] hover:bg-[var(--surface-2)]">
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    void handleImport(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <span className="flex items-center gap-1.5">
                  <UploadIcon className="h-4 w-4" />
                  Import
                </span>
              </label>
              <button
                onClick={handleCreate}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-40"
              >
                <PlusIcon className="h-4 w-4" />
                New project
              </button>
            </div>
          </div>

          <div className="mt-8">
            {projects === null ? (
              <p className="text-sm text-[var(--text-faint)]">Loading…</p>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-14 text-center">
                <HammerIcon className="mx-auto h-7 w-7 text-[var(--text-faint)]" />
                <p className="mt-3 font-medium text-[var(--text)]">Nothing built yet</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--text-faint)]">
                  Start a project, then just describe what you want — &ldquo;make me a portfolio site with a hero,
                  about, and contact section&rdquo; — and it gets built for you.
                </p>
                <button
                  onClick={handleCreate}
                  className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                >
                  Start your first project
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/project/${p.id}`)}
                    className="group rounded-2xl border border-[var(--line)] p-4 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-0)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-medium text-[var(--text)]">{p.name}</h3>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Delete ${p.name}`}
                        onClick={(e) => void handleDelete(p, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") void handleDelete(p, e as unknown as React.MouseEvent);
                        }}
                        className="shrink-0 rounded p-1 text-[var(--text-faint)] opacity-0 hover:text-[var(--danger)] focus:opacity-100 group-hover:opacity-100"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-faint)]">
                      Updated {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
