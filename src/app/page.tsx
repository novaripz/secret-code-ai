"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createEmptyProject, createFile } from "@/lib/fileSystem";
import { listProjects, saveProject, deleteProject, type ProjectSummary } from "@/lib/storage";
import { TrashIcon, SparkleIcon } from "@/components/icons";

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
  background: #fafafa;
  color: #23262b;
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

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  async function handleCreate() {
    const name = prompt("What do you want to call this project?", "My Project");
    if (!name) return;
    setCreating(true);
    try {
      const project = createEmptyProject(name.trim());
      createFile(project, "index.html", STARTER_HTML);
      createFile(project, "style.css", STARTER_CSS);
      createFile(project, "script.js", STARTER_JS);
      await saveProject(project);
      router.push(`/project/${project.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this project? You can't undo this.")) return;
    await deleteProject(id);
    setProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface-0)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold">
            B
          </span>
          <span className="font-semibold">Build</span>
          <span className="text-[var(--text-faint)] text-sm ml-1 hidden sm:inline">
            — a friendly place to make things
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Your projects</h1>
            <p className="text-sm text-[var(--text-faint)] mt-1">
              Everything saves automatically in this browser. You can also download a project to keep a copy.
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-sm font-medium disabled:opacity-50 shrink-0"
          >
            + New project
          </button>
        </div>

        {projects === null ? (
          <div className="text-[var(--text-faint)] text-sm">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--line)] rounded-2xl p-12 text-center bg-[var(--surface-0)]">
            <SparkleIcon className="w-8 h-8 text-[var(--accent)] mx-auto mb-3" />
            <p className="text-[var(--text)] font-medium">No projects yet</p>
            <p className="text-[var(--text-faint)] text-sm mt-1 max-w-sm mx-auto leading-relaxed">
              Start a project, then try asking for help with something like &ldquo;make me a simple portfolio
              website with a hero, about, projects, and contact section.&rdquo;
            </p>
            <button
              onClick={handleCreate}
              className="mt-5 px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-sm font-medium"
            >
              + New project
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/project/${p.id}`)}
                className="group cursor-pointer border border-[var(--line)] rounded-xl p-4 bg-[var(--surface-0)] hover:border-[var(--accent)] hover:shadow-sm transition-colors"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-[var(--text)] truncate pr-2">{p.name}</h3>
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--surface-2)] text-[var(--danger)] shrink-0"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-faint)] mt-2">
                  Updated {new Date(p.updatedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
