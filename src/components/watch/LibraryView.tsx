"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import {
  BookmarkIcon,
  HistoryIcon,
  ListVideoIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  TimerIcon,
  TrashIcon,
} from "@/components/icons";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/primitives";
import { useDialog } from "@/components/ui/Dialog";
import { continueWatching, progressOf, toVideo, type HistoryEntry } from "@/lib/watch/library";
import type { Video } from "@/lib/watch/types";
import { useWatchStore } from "@/store/useWatchStore";
import { GRID, GridSkeleton } from "./bits";
import { showToast, type Queue } from "./session";
import { VideoCard, VideoRow, historyItem } from "./VideoCard";
import { useWatchNav, watchHref, type LibraryList } from "./nav";

// The library: everything Watch keeps for the student, on their own device.
//
// Watch later is the list that used to be "Saved" (same storage, renamed for
// what it is for). History is recorded when a video actually starts playing,
// can be paused, and can be cleared. Continue watching is History filtered to
// the videos they stopped partway through, with how far they got drawn on the
// thumbnail. None of it costs any quota, so all of it works when YouTube
// itself doesn't.

const TABS: { id: LibraryList; label: StringKey; short?: StringKey; icon: typeof BookmarkIcon }[] = [
  { id: "later", label: "watch.watchLater", icon: BookmarkIcon },
  { id: "continue", label: "watch.continueWatching", short: "watch.continueShort", icon: TimerIcon },
  { id: "history", label: "watch.history", icon: HistoryIcon },
];

export function LibraryView({ list }: { list: LibraryList }) {
  const { t } = useI18n();
  const nav = useWatchNav();
  const hydrated = useWatchStore((s) => s.hydrated);
  const saved = useWatchStore((s) => s.saved);
  const history = useWatchStore((s) => s.history);
  const [filter, setFilter] = useState("");
  const tabsRef = useRef<HTMLDivElement>(null);

  // On a phone the tab row can scroll; keep the open tab on screen.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [list]);

  const counts: Record<LibraryList, number> = {
    later: saved.length,
    continue: continueWatching(history).length,
    history: history.length,
  };

  function onTabKey(e: React.KeyboardEvent) {
    const at = TABS.findIndex((tab) => tab.id === list);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    nav.library(TABS[next].id, true);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-14 pt-6 sm:px-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui bg-accent-soft text-accent-text">
          <ListVideoIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink md:text-[26px]">{t("watch.libraryTitle")}</h1>
          <p className="mt-0.5 text-[14px] leading-relaxed text-ink-dim">{t("watch.libraryIntro")}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-line">
        <div ref={tabsRef} role="tablist" aria-label={t("watch.libraryTitle")} className="scroll-x -mb-px flex gap-1" onKeyDown={onTabKey}>
          {TABS.map((tab) => {
            const selected = tab.id === list;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                id={`watch-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`watch-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => nav.library(tab.id, true)}
                className={`tap flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1.5 text-[14px] transition-colors ${
                  selected
                    ? "border-accent font-semibold text-ink"
                    : "border-transparent text-ink-dim hover:border-line-strong hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.short ? (
                  <>
                    <span className="sm:hidden">{t(tab.short)}</span>
                    <span className="hidden sm:inline">{t(tab.label)}</span>
                  </>
                ) : (
                  t(tab.label)
                )}
                {hydrated && counts[tab.id] > 0 && (
                  <span className="rounded-full bg-surface-2 px-1.5 text-[11.5px] tabular-nums text-ink-faint">{counts[tab.id]}</span>
                )}
              </button>
            );
          })}
        </div>
        <label className="relative mb-2 ml-auto w-full sm:w-64">
          <span className="sr-only">{t("watch.filterList")}</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("watch.filterList")}
            className="input tap !h-9 !rounded-full !pl-9 !text-[13.5px]"
            type="search"
          />
        </label>
      </div>

      <div
        id={`watch-panel-${list}`}
        role="tabpanel"
        aria-labelledby={`watch-tab-${list}`}
        tabIndex={0}
        className="pt-6 focus-visible:outline-none"
      >
        {!hydrated ? (
          <GridSkeleton count={8} />
        ) : list === "later" ? (
          <LaterPanel filter={filter} />
        ) : list === "continue" ? (
          <ContinuePanel filter={filter} />
        ) : (
          <HistoryPanel filter={filter} />
        )}
      </div>
    </div>
  );
}

function matches(v: { title: string; channel: string }, filter: string) {
  const f = filter.trim().toLowerCase();
  return !f || v.title.toLowerCase().includes(f) || v.channel.toLowerCase().includes(f);
}

function NoMatches({ filter }: { filter: string }) {
  const { t } = useI18n();
  return <EmptyState icon={<SearchIcon />} title={t("watch.noMatches", { query: filter.trim() })} />;
}

function BrowseButton() {
  const { t } = useI18n();
  return (
    <LinkButton href={watchHref()} variant="primary" className="tap" icon={<PlayIcon />}>
      {t("watch.backToVideos")}
    </LinkButton>
  );
}

function LaterPanel({ filter }: { filter: string }) {
  const { t } = useI18n();
  const saved = useWatchStore((s) => s.saved);
  const videos = useMemo(() => saved.map(toVideo), [saved]);
  const shown = useMemo(() => videos.filter((v) => matches(v, filter)), [videos, filter]);
  const queue: Queue = useMemo(() => ({ label: "watch.listLater", videos }), [videos]);

  if (videos.length === 0) {
    return <EmptyState icon={<BookmarkIcon />} title={t("watch.emptyLater")} description={t("watch.emptyLaterHint")} action={<BrowseButton />} />;
  }
  if (shown.length === 0) return <NoMatches filter={filter} />;
  return (
    <>
      <p className="mb-4 text-[13px] text-ink-faint">
        {videos.length === 1 ? t("watch.countVideosOne") : t("watch.countVideos", { count: videos.length })}
      </p>
      <div className={GRID}>
        {shown.map((v, i) => (
          <VideoCard key={v.id} video={v} queue={queue} eager={i < 4} />
        ))}
      </div>
    </>
  );
}

function ContinuePanel({ filter }: { filter: string }) {
  const { t } = useI18n();
  const history = useWatchStore((s) => s.history);
  const entries = useMemo(() => continueWatching(history), [history]);
  const videos = useMemo(() => entries.map(toVideo), [entries]);
  const shown = useMemo(() => entries.filter((e) => matches(e, filter)), [entries, filter]);
  const queue: Queue = useMemo(() => ({ label: "watch.listContinue", videos }), [videos]);

  if (entries.length === 0) {
    return (
      <EmptyState icon={<TimerIcon />} title={t("watch.emptyContinue")} description={t("watch.emptyContinueHint")} action={<BrowseButton />} />
    );
  }
  if (shown.length === 0) return <NoMatches filter={filter} />;
  return (
    <div className={GRID}>
      {shown.map((e, i) => (
        <VideoCard key={e.id} video={toVideo(e)} queue={queue} progress={progressOf(e)} eager={i < 4} />
      ))}
    </div>
  );
}

/** Today, Yesterday, Earlier — the way a student remembers when they watched something. */
function groupByDay(entries: HistoryEntry[], now = new Date()): { label: StringKey; items: HistoryEntry[] }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 3600_000;
  const groups: Record<"today" | "yesterday" | "earlier", HistoryEntry[]> = { today: [], yesterday: [], earlier: [] };
  for (const e of entries) {
    if (e.watchedAt >= startOfToday) groups.today.push(e);
    else if (e.watchedAt >= startOfYesterday) groups.yesterday.push(e);
    else groups.earlier.push(e);
  }
  return [
    { label: "watch.today" as StringKey, items: groups.today },
    { label: "watch.yesterday" as StringKey, items: groups.yesterday },
    { label: "watch.earlier" as StringKey, items: groups.earlier },
  ].filter((g) => g.items.length > 0);
}

function HistoryPanel({ filter }: { filter: string }) {
  const { t } = useI18n();
  const dialog = useDialog();
  const history = useWatchStore((s) => s.history);
  const paused = useWatchStore((s) => s.historyPaused);
  const setPaused = useWatchStore((s) => s.setHistoryPaused);
  const clearHistory = useWatchStore((s) => s.clearHistory);
  const removeFromHistory = useWatchStore((s) => s.removeFromHistory);

  const videos: Video[] = useMemo(() => history.map(toVideo), [history]);
  const queue: Queue = useMemo(() => ({ label: "watch.listHistory", videos }), [videos]);
  const shown = useMemo(() => history.filter((h) => matches(h, filter)), [history, filter]);
  const groups = useMemo(() => groupByDay(shown), [shown]);

  async function clear() {
    const ok = await dialog.confirm({
      title: t("watch.clearHistoryConfirm"),
      description: t("watch.clearHistoryBody"),
      confirmLabel: t("watch.clearHistory"),
      danger: true,
    });
    if (!ok) return;
    await clearHistory();
    showToast(t("watch.toastHistoryCleared"));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 lg:order-1">
        {paused && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-ui border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-warn-soft px-4 py-3 text-[13.5px] text-ink">
            <PauseIcon className="h-4 w-4 shrink-0 text-warn" />
            <span className="min-w-0 flex-1">{t("watch.historyPaused")}</span>
            <button type="button" className="btn btn-secondary btn-sm tap" onClick={() => void setPaused(false)}>
              {t("watch.resumeHistory")}
            </button>
          </div>
        )}

        {history.length === 0 ? (
          <EmptyState icon={<HistoryIcon />} title={t("watch.emptyHistory")} description={t("watch.emptyHistoryHint")} action={<BrowseButton />} />
        ) : shown.length === 0 ? (
          <NoMatches filter={filter} />
        ) : (
          <div className="space-y-9">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-4 text-[16px] font-semibold text-ink">{t(group.label)}</h2>
                <div className="space-y-5">
                  {group.items.map((e) => (
                    <VideoRow
                      key={e.id}
                      video={toVideo(e)}
                      queue={queue}
                      progress={progressOf(e)}
                      extraItems={[historyItem(t("watch.removeFromHistory"), () => void removeFromHistory(e.id))]}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <aside className="lg:order-2">
        <div className="card space-y-1 p-2 lg:sticky lg:top-4">
          <button
            type="button"
            className="menu-item tap !py-2.5 disabled:opacity-50"
            onClick={() => void clear()}
            disabled={history.length === 0}
          >
            <TrashIcon />
            {t("watch.clearHistory")}
          </button>
          {/* A label around a real switch, so the whole row is the click
              target and a screen reader hears one control with one state. */}
          <label htmlFor="watch-pause-history" className="menu-item tap cursor-pointer !py-2.5">
            <PauseIcon />
            <span className="flex-1">{t("watch.pauseHistory")}</span>
            <button
              id="watch-pause-history"
              type="button"
              role="switch"
              aria-checked={paused}
              className="switch"
              onClick={() => void setPaused(!paused)}
            >
              <span className="switch-knob" />
            </button>
          </label>
        </div>
      </aside>
    </div>
  );
}

