"use client";

import "@/styles/ide.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { PandaSitting } from "@/components/Panda";
import { useI18n, type StringKey } from "@/lib/i18n";
import { useProfileStore } from "@/store/useProfileStore";
import {
  claimLegacyProject,
  deleteProject,
  duplicateProject,
  listLegacyProjects,
  listProjects,
  loadProject,
  renameProjectRecord,
  saveProject,
  type ProjectSummary,
} from "@/lib/storage";
import { exportProjectToZip, importProjectFromZipDetailed } from "@/lib/zip";
import { CircleAlertIcon, HammerIcon, PlusIcon, RefreshIcon, SearchIcon, UploadIcon } from "@/components/icons";
import { ProjectCard } from "@/components/build/ProjectCard";
import { NewProjectDialog, TEMPLATE_ICONS, TEMPLATE_TINT } from "@/components/build/NewProjectDialog";
import { TEMPLATES, projectFromTemplate } from "@/components/build/templates";
import { safeFileName, saveBlob } from "@/components/build/download";

// The project list is the first screen of the build tool, so it is the first
// chance to look like a tool rather than a folder of documents: a card per
// project with a picture of it, a search box a keyboard reaches first (a class
// ends up with a dozen near-identically named projects by half term), a
// relative "last edited" that answers the question people actually ask of this
// list, and rename, copy, download and delete on every card.

/**
 * "3 minutes ago" reads as work; a date reads as an archive.
 *
 * Returns a key and its count rather than a built string, so the caller can
 * translate the whole phrase in one go. Picking the singular or plural key here
 * instead of appending an "s" is the point: plural rules are a property of the
 * language, not of the number.
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

type Sort = "recent" | "name";

export default function BuildPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dialog = useDialog();
  const displayName = useProfileStore((s) => s.displayName);
  const hydrated = useProfileStore((s) => s.hydrated);

  // null while loading; "error" if the browser's storage would not open.
  const [projects, setProjects] = useState<ProjectSummary[] | null | "error">(null);
  // Projects made on this browser before anyone signed in. See the comment on
  // listLegacyProjects: nothing can know whose they are, so the student is
  // asked rather than guessed at. Empty for guests.
  const [older, setOlder] = useState<ProjectSummary[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [creating, setCreating] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    listProjects()
      .then((list) => {
        // Stamped when the list lands: "edited 2 min ago" has to be a value
        // React is told about, not one it reads mid-render.
        setNow(Date.now());
        setProjects(list);
      })
      .catch(() => setProjects("error"));
    void listLegacyProjects().then(setOlder);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => (Array.isArray(projects) ? projects : []), [projects]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = list.filter((p) => p.name.toLowerCase().includes(needle));
    return sort === "name" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered;
  }, [list, query, sort]);

  const humanTime = (timestamp: number): string => {
    const r = relativeTime(timestamp, now, locale);
    return "text" in r ? r.text : t(r.key, { count: r.count });
  };

  async function create(templateId: string, name: string) {
    setBusy(true);
    try {
      const project = projectFromTemplate(templateId, name);
      await saveProject(project);
      router.push(`/project/${project.id}`);
    } catch (err) {
      setBusy(false);
      await dialog.alert({ title: t("studio.didntWork"), description: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { project, skipped } = await importProjectFromZipDetailed(file);
      await saveProject(project);
      if (skipped.length > 0) await dialog.alert({ title: t("topbar.importSkipped"), description: skipped.join("\n") });
      router.push(`/project/${project.id}`);
    } catch (err) {
      setBusy(false);
      await dialog.alert({
        title: t("studio.openFailed"),
        description: err instanceof Error ? err.message : t("studio.notAProject"),
      });
    }
  }

  async function handleClaim(summary: ProjectSummary) {
    setClaiming(summary.id);
    try {
      const claimed = await claimLegacyProject(summary.id);
      if (!claimed) return;
      // Copied, not moved: the original stays for whoever else used this
      // browser. So the row leaves this list and joins the one above it.
      setOlder((prev) => prev.filter((p) => p.id !== summary.id));
      setProjects((prev) => (Array.isArray(prev) ? [claimed, ...prev] : [claimed]));
    } finally {
      setClaiming(null);
    }
  }

  const cardActions = {
    rename: async (p: ProjectSummary) => {
      const name = await dialog.prompt({ title: t("build.renameTitle"), defaultValue: p.name, confirmLabel: t("action.rename") });
      if (!name || name.trim() === p.name) return;
      const renamed = await renameProjectRecord(p.id, name);
      if (renamed) {
        setProjects((prev) =>
          Array.isArray(prev) ? prev.map((x) => (x.id === p.id ? { ...x, name: renamed.name, updatedAt: renamed.updatedAt } : x)) : prev,
        );
      }
    },
    duplicate: async (p: ProjectSummary) => {
      const name = await dialog.prompt({
        title: t("build.copyTitle"),
        description: t("build.copyHint"),
        defaultValue: t("build.copyName", { name: p.name }),
        confirmLabel: t("build.copyCreate"),
      });
      if (!name) return;
      const copy = await duplicateProject(p.id, name);
      if (copy) {
        setNow(Date.now());
        setProjects((prev) =>
          Array.isArray(prev)
            ? [{ id: copy.id, name: copy.name, createdAt: copy.createdAt, updatedAt: copy.updatedAt }, ...prev]
            : prev,
        );
      }
    },
    download: async (p: ProjectSummary) => {
      const project = await loadProject(p.id);
      if (project) saveBlob(await exportProjectToZip(project), `${safeFileName(project.name)}.zip`);
    },
    remove: async (p: ProjectSummary) => {
      const ok = await dialog.confirm({
        title: t("build.deleteTitle"),
        description: t("build.deleteBody", { name: p.name }),
        confirmLabel: t("action.delete"),
        danger: true,
      });
      if (!ok) return;
      await deleteProject(p.id);
      setProjects((prev) => (Array.isArray(prev) ? prev.filter((x) => x.id !== p.id) : prev));
    },
  };

  const name = hydrated ? displayName() : "";

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
          <input
            ref={importRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              void handleImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {/* The page header, laid out here rather than with PageHeader: two
              buttons beside the title squeezed it into a one-word column on
              a phone, so on a phone the buttons take a row of their own. */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--accent-text)] [&>svg]:h-5 [&>svg]:w-5">
                <HammerIcon />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl tracking-tight text-[var(--text)] md:text-[26px]">
                  {name ? t("build.namedProjects", { name }) : t("build.yourProjects")}
                </h1>
                <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-dim)] md:text-sm">{t("build.subtitle")}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" icon={<UploadIcon />} onClick={() => importRef.current?.click()} disabled={busy} className="flex-1 sm:flex-none">
                {t("build.importZip")}
              </Button>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating("blank")} disabled={busy} className="flex-1 sm:flex-none">
                {t("build.newProject")}
              </Button>
            </div>
          </header>

          {list.length > 0 && (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 flex-1 basis-64">
                <span className="sr-only">{t("build.searchLabel")}</span>
                <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("build.searchPlaceholder")}
                  className="input !pl-9"
                />
              </label>
              <span className="text-[13px] text-[var(--text-faint)]">
                {list.length === 1 ? t("build.countOne") : t("build.count", { count: list.length })}
              </span>
              <div className="segmented" role="radiogroup" aria-label={t("build.sortLabel")}>
                {(["recent", "name"] as Sort[]).map((key) => (
                  <button key={key} type="button" role="radio" aria-checked={sort === key} data-active={sort === key || undefined} onClick={() => setSort(key)} className="tap-pad">
                    {t(key === "recent" ? "build.sortRecent" : "build.sortName")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            {projects === null ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="card overflow-hidden">
                    <Skeleton className="aspect-[16/10] !rounded-none" />
                    <div className="space-y-2 p-4">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : projects === "error" ? (
              <EmptyState
                icon={<CircleAlertIcon />}
                title={t("build.loadFailedTitle")}
                description={t("build.loadFailedBody")}
                action={
                  <Button
                    variant="secondary"
                    icon={<RefreshIcon />}
                    onClick={() => {
                      setProjects(null);
                      load();
                    }}
                  >
                    {t("build.tryAgain")}
                  </Button>
                }
              />
            ) : list.length === 0 ? (
              <FirstProject onPick={(id) => setCreating(id)} />
            ) : shown.length === 0 ? (
              <p className="px-1 py-12 text-center text-[15px] text-[var(--text-faint)]">{t("build.noMatch", { query })}</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((p) => (
                  <ProjectCard
                    key={p.id}
                    summary={p}
                    edited={t("build.edited", { time: humanTime(p.updatedAt) })}
                    actions={{
                      rename: (x) => void cardActions.rename(x),
                      duplicate: (x) => void cardActions.duplicate(x),
                      download: (x) => void cardActions.download(x),
                      remove: (x) => void cardActions.remove(x),
                    }}
                  />
                ))}
              </ul>
            )}

            {/* WORK MADE BEFORE SIGNING IN.
                Projects used to be saved without an account attached, so on a
                shared classroom machine everyone's landed in one pile. They are
                not moved automatically: nothing can tell whose is whose. The
                student knows, so the student says — one project at a time, by
                name. Claiming COPIES, so a wrong guess costs nothing. */}
            {older.length > 0 && (
              <section className="mt-12 rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] p-5">
                <h2 className="text-[15px] text-[var(--text)]">{t("build.olderTitle")}</h2>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-[var(--text-dim)]">{t("build.olderBody")}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {older.map((p) => (
                    <li key={p.id} className="card flex items-center gap-3 px-3.5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-[var(--text)]">{p.name}</span>
                        <span className="mt-0.5 block text-[12px] text-[var(--text-faint)]">
                          {t("build.edited", { time: humanTime(p.updatedAt) })}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        pill
                        onClick={() => void handleClaim(p)}
                        disabled={claiming !== null}
                        aria-label={t("build.claimLabel", { name: p.name })}
                      >
                        {claiming === p.id ? t("build.claiming") : t("build.claim")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      <NewProjectDialog
        open={creating !== null}
        initialTemplate={creating ?? "blank"}
        busy={busy}
        onClose={() => setCreating(null)}
        onCreate={(templateId, projectName) => void create(templateId, projectName)}
      />
    </AppShell>
  );
}

/** Nothing built yet: a friendly first screen, and every template one click away. */
function FirstProject({ onPick }: { onPick: (templateId: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col items-center gap-2 px-6 pb-8 pt-10 text-center">
        <span className="flex h-32 w-32 items-center justify-center rounded-full bg-[var(--accent-soft)]">
          <PandaSitting className="h-28 w-28" />
        </span>
        <h2 className="mt-2 text-[22px] tracking-tight text-[var(--text)]">{t("build.emptyTitle")}</h2>
        <p className="max-w-md text-[15px] leading-relaxed text-[var(--text-dim)]">{t("build.emptyBody")}</p>
        <Button variant="primary" size="lg" icon={<PlusIcon />} className="mt-3" onClick={() => onPick("blank")}>
          {t("build.emptyAction")}
        </Button>
      </div>
      <div className="border-t border-[var(--line)] bg-[var(--surface-0)] px-5 py-5">
        <p className="eyebrow mb-3">{t("build.startFromTemplate")}</p>
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.filter((tpl) => tpl.id !== "blank").map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => onPick(tpl.id)}
                className="card card-interactive tap flex w-full items-center gap-3 px-3.5 py-3 text-left"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] [&>svg]:h-[18px] [&>svg]:w-[18px] ${TEMPLATE_TINT[tpl.icon]}`}>
                  {TEMPLATE_ICONS[tpl.icon]}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-[var(--weight-strong)] text-[var(--text)]">{tpl.title}</span>
                  <span className="block truncate text-[12.5px] text-[var(--text-faint)]">{tpl.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
