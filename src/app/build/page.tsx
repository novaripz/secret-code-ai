"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDialog } from "@/components/ui/Dialog";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore } from "@/store/useProfileStore";
import { createEmptyProject, createFile } from "@/lib/fileSystem";
import {
  claimLegacyProject,
  deleteProject,
  listLegacyProjects,
  listProjects,
  saveProject,
  type ProjectSummary,
} from "@/lib/storage";
import { importProjectFromZip } from "@/lib/zip";
import { HammerIcon, PlusIcon, TrashIcon, UploadIcon } from "@/components/icons";

// ONE FILE, NOT THREE.
//
// Every new project used to be seeded with index.html, style.css and script.js.
// The complaint was that file creation "seems to save into every project" --
// nothing was leaking, every project simply opened looking exactly like every
// other one, and the three names sitting there were also the reason nothing
// ever got split: the model was told not to duplicate files that already exist
// and to keep changes scoped, so it poured a whole game into script.js rather
// than make js/shop.js next to a style.css that already existed.
//
// So a project starts as one page that runs. The CSS and the JS are inline, in
// the smallest form that works, which is exactly how a beginner's first file
// looks anyway. When the project grows, Panda decides the file layout the
// project actually needs and moves things out -- the studio prompt says so, and
// having nowhere pre-decided to put things is what lets that happen.
const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Project</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d0d0d;
      color: #ececec;
    }
    h1 { font-size: 2rem; }
  </style>
</head>
<body>
  <main>
    <h1>Welcome to your new project</h1>
    <p>Edit this file, or ask for help and I&apos;ll build something for you.</p>
  </main>
  <script>
    console.log("Project loaded. Ready to build!");
  </script>
</body>
</html>
`;

// The project list is the first screen of the build tool, so it is the first
// chance to look like a tool rather than a folder of documents. Three changes
// carry that: a filter field that a keyboard reaches first (a class ends up
// with a dozen near-identically named projects by half term), a relative "last
// edited" that answers the question people actually ask of this list, and a
// card whose delete control is a real sibling button instead of a clickable
// span nested inside the card's own button — which was both invalid markup and
// unreachable by keyboard.

/**
 * "3 minutes ago" reads as work; a date reads as an archive.
 *
 * Returns a key and its count rather than a built string, so the caller can
 * translate the whole phrase in one go. Picking the singular or plural key here
 * instead of appending an "s" is the point: plural rules are a property of the
 * language, not of the number, and a sentence assembled from a count plus a
 * translated noun goes wrong in every locale that inflects. The date fallback
 * is the one thing that is not a phrase, so it comes back ready-made.
 */
function relativeTime(
  timestamp: number,
  now: number,
  locale: string,
): { key: StringKey; count: number } | { text: string } {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return { key: "time.justNow", count: 0 };
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { key: "time.minutesAgo", count: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { key: hours === 1 ? "time.hourAgo" : "time.hoursAgo", count: hours };
  const days = Math.round(hours / 24);
  if (days < 30) return { key: days === 1 ? "time.dayAgo" : "time.daysAgo", count: days };
  // Intl already knows how each locale writes a date; we do not second-guess it.
  return { text: new Date(timestamp).toLocaleDateString(locale) };
}

export default function BuildPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dialog = useDialog();
  const displayName = useProfileStore((s) => s.displayName);
  const hydrated = useProfileStore((s) => s.hydrated);

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  // Projects made on this browser before anyone signed in. See the comment on
  // listLegacyProjects: nothing can know whose they are, so the student is
  // asked rather than guessed at. Empty for guests and for anyone who never
  // used Panda signed out, which is nearly everyone — this row only appears
  // for the students it is actually for.
  const [older, setOlder] = useState<ProjectSummary[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  // Read once per load rather than per render: a list that recomputes "2 min
  // ago" on every keystroke is not more correct, only less predictable.
  const [now, setNow] = useState(0);

  useEffect(() => {
    void listProjects().then((list) => {
      // Stamped when the list lands, not while rendering: "edited 2 min ago"
      // has to be a value React is told about, not one it reads mid-render.
      setNow(Date.now());
      setProjects(list);
    });
    void listLegacyProjects().then(setOlder);
  }, []);

  async function handleClaim(summary: ProjectSummary) {
    setClaiming(summary.id);
    try {
      const claimed = await claimLegacyProject(summary.id);
      if (!claimed) return;
      // Copied, not moved: the original stays for whoever else used this
      // browser. So the row leaves this list and joins the one above it.
      setOlder((prev) => prev.filter((p) => p.id !== summary.id));
      setProjects((prev) => (prev ? [claimed, ...prev] : [claimed]));
    } finally {
      setClaiming(null);
    }
  }

  async function handleCreate() {
    const name = await dialog.prompt({
      title: t("build.nameTitle"),
      description: t("build.nameHint"),
      placeholder: t("build.defaultName"),
      defaultValue: t("build.defaultName"),
      confirmLabel: t("studio.create"),
    });
    if (!name) return;

    setBusy(true);
    try {
      const project = createEmptyProject(name);
      createFile(project, "index.html", STARTER_HTML);
      await saveProject(project);
      router.push(`/project/${project.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(project: ProjectSummary, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await dialog.confirm({
      title: t("build.deleteTitle"),
      description: t("build.deleteBody", { name: project.name }),
      confirmLabel: t("action.delete"),
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
        title: t("studio.openFailed"),
        description: err instanceof Error ? err.message : t("studio.notAProject"),
      });
    } finally {
      setBusy(false);
    }
  }

  const name = hydrated ? displayName() : "";

  /** Resolve the relative-time key against the active catalog. */
  const humanTime = (timestamp: number): string => {
    const r = relativeTime(timestamp, now, locale);
    return "text" in r ? r.text : t(r.key, { count: r.count });
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {name ? t("build.namedProjects", { name }) : t("build.yourProjects")}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-faint)]">
                {t("build.subtitle")}
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
                  {t("studio.import")}
                </span>
              </label>
              <button
                onClick={handleCreate}
                disabled={busy}
                className="tap flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-40"
              >
                <PlusIcon className="h-4 w-4" />
                {t("build.newProject")}
              </button>
            </div>
          </div>

          {projects !== null && projects.length > 0 && (
            <div className="mt-6">
              <label className="sr-only" htmlFor="project-filter">
                {t("build.filterLabel")}
              </label>
              <input
                id="project-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("build.filterPlaceholder")}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors motion-reduce:transition-none placeholder:text-[var(--text-faint)] focus-visible:border-[var(--line-strong)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              />
            </div>
          )}

          <div className="mt-6">
            {projects === null ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-14 text-center">
                <HammerIcon className="mx-auto h-7 w-7 text-[var(--text-faint)]" />
                <p className="mt-3 font-medium text-[var(--text)]">{t("build.emptyTitle")}</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--text-faint)]">
                  {t("build.emptyBody")}
                </p>
                <button
                  onClick={handleCreate}
                  className="tap inline-flex items-center mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                >
                  {t("build.emptyAction")}
                </button>
              </div>
            ) : (
              (() => {
                const shown = projects.filter((p) =>
                  p.name.toLowerCase().includes(filter.trim().toLowerCase()),
                );
                if (shown.length === 0) {
                  return (
                    <p className="px-1 py-8 text-center text-sm text-[var(--text-faint)]">
                      {t("build.noMatch", { query: filter })}
                    </p>
                  );
                }
                return (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map((p) => (
                      <li
                        key={p.id}
                        className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] transition-colors motion-reduce:transition-none hover:border-[var(--line-strong)]"
                      >
                        <button
                          onClick={() => router.push(`/project/${p.id}`)}
                          className="w-full px-4 py-3.5 pr-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
                        >
                          <span className="flex items-center gap-2">
                            <HammerIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
                            <span className="truncate font-medium text-[var(--text)]">{p.name}</span>
                          </span>
                          <span className="mt-2 block font-mono text-[11px] text-[var(--text-faint)]">
                            {t("build.edited", { time: humanTime(p.updatedAt) })}
                          </span>
                        </button>
                        <button
                          onClick={(e) => void handleDelete(p, e)}
                          aria-label={t("build.deleteLabel", { name: p.name })}
                          title={t("build.deleteLabel", { name: p.name })}
                          className="tap-sq inline-flex items-center justify-center absolute right-2 top-2 rounded-lg p-1.5 text-[var(--text-faint)] opacity-0 transition-opacity motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] group-hover:opacity-100 max-md:opacity-100"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()
            )}

            {/* WORK MADE BEFORE SIGNING IN.
                Projects used to be saved without an account attached, so on a
                shared classroom machine everyone's landed in one pile. They are
                not moved automatically: nothing can tell whose is whose, and
                guessing would hand one student the rest of the class's work.
                The student knows, so the student says — one project at a time,
                by name. Claiming COPIES, so a wrong guess costs nothing and the
                original stays for whoever it really belongs to. */}
            {older.length > 0 && (
              <section className="mt-10 rounded-2xl border border-dashed border-[var(--line-strong)] p-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Made on this computer before you signed in
                </h2>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-[var(--text-faint)]">
                  These were saved on this computer without an account, so they might be yours or
                  they might belong to someone else who used it. Add the ones you made — the
                  originals stay here either way.
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {older.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-[var(--text)]">{p.name}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-[var(--text-faint)]">
                          {t("build.edited", { time: humanTime(p.updatedAt) })}
                        </span>
                      </span>
                      <button
                        onClick={() => void handleClaim(p)}
                        disabled={claiming !== null}
                        aria-label={`Add ${p.name} to my projects`}
                        className="tap shrink-0 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition-colors motion-reduce:transition-none hover:border-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                      >
                        {claiming === p.id ? "Adding…" : "This one's mine"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
