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
    <p>Edit this file, or ask the AI assistant to build something for you.</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`;

const STARTER_CSS = `body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f0f12;
  color: #e4e4e7;
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
    const name = prompt("Project name:", "My Project");
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
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await deleteProject(id);
    setProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-gradient-to-br from-sky-400 to-indigo-500" />
          <span className="font-semibold">Studio</span>
          <span className="text-zinc-600 text-sm ml-1">— browser AI coding environment</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Your projects</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Everything is saved locally in this browser. Export a .zip any time to back it up.
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-md bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium disabled:opacity-50"
          >
            + New project
          </button>
        </div>

        {projects === null ? (
          <div className="text-zinc-600 text-sm">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
            <SparkleIcon className="w-8 h-8 text-sky-400 mx-auto mb-3" />
            <p className="text-zinc-300 font-medium">No projects yet</p>
            <p className="text-zinc-500 text-sm mt-1 max-w-sm mx-auto">
              Create a project, then ask the AI assistant something like &ldquo;create a simple portfolio website
              with a hero, about, projects, and contact section.&rdquo;
            </p>
            <button
              onClick={handleCreate}
              className="mt-5 px-4 py-2 rounded-md bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium"
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
                className="group cursor-pointer border border-white/5 rounded-lg p-4 bg-zinc-900/40 hover:bg-zinc-900 hover:border-white/10 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-zinc-100 truncate pr-2">{p.name}</h3>
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-red-400 shrink-0"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-zinc-600 mt-2">Updated {new Date(p.updatedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
