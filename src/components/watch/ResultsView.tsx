"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { CheckIcon, FilterIcon, SearchIcon, XIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/primitives";
import { DATES, DURATIONS, SORTS, countFilters, searchKey, type SearchFilters } from "@/lib/watch/query";
import { progressOf } from "@/lib/watch/library";
import type { SearchPage } from "@/lib/watch/types";
import { useWatchStore } from "@/store/useWatchStore";
import { watchApi } from "./api";
import { RefreshBar, RowSkeleton } from "./bits";
import { LoadMore, usePaged } from "./Paged";
import { useWatchRequest } from "./requests";
import { rememberVideos, type Queue } from "./session";
import { Trouble } from "./Trouble";
import { VideoRow } from "./VideoCard";
import { useWatchNav } from "./nav";

// Search results, YouTube-shaped: a list with the thumbnail on the left and the
// title, channel and the start of the description on the right, so a student
// can tell three "Photosynthesis explained" videos apart without opening each.
//
// Filters live in the URL beside the query (?q=…&dur=short&cc=1), so they
// survive a reload, are part of the cache key on both ends, and Back undoes a
// search rather than a filter tweak (filters replace history, searches push).

const DUR_LABEL: Record<string, StringKey> = { short: "watch.durShort", medium: "watch.durMedium", long: "watch.durLong" };
const DATE_LABEL: Record<string, StringKey> = { week: "watch.dateWeek", month: "watch.dateMonth", year: "watch.dateYear" };
const SORT_LABEL: Record<string, StringKey> = {
  relevance: "watch.sortRelevance",
  date: "watch.sortDate",
  viewCount: "watch.sortViewCount",
  rating: "watch.sortRating",
};

export function ResultsView({ q, filters }: { q: string; filters: SearchFilters }) {
  const { t, locale } = useI18n();
  const key = searchKey({ q, filters, lang: locale });
  const req = useWatchRequest<SearchPage>("results", key, () => watchApi.search(q, filters, locale));
  const active = countFilters(filters);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="relative mx-auto w-full max-w-[1240px] px-4 pb-14 sm:px-6">
      <div className="sticky top-0 z-20 h-0">
        <RefreshBar active={req.refreshing} />
      </div>

      <div className="flex flex-wrap items-center gap-3 pb-3 pt-5">
        <h1 className="min-w-0 flex-1 truncate text-[20px] font-semibold tracking-tight text-ink sm:text-[24px]">
          {t("watch.resultsFor", { query: q })}
        </h1>
        <button
          type="button"
          className="btn btn-outline btn-pill btn-sm tap"
          aria-expanded={panelOpen}
          aria-controls="watch-filters"
          data-active={active > 0 || undefined}
          onClick={() => setPanelOpen((o) => !o)}
        >
          <FilterIcon />
          {t("watch.filters")}
          {active > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-contrast">
              {active}
            </span>
          )}
        </button>
      </div>

      {panelOpen && <FilterPanel q={q} filters={filters} />}
      {active > 0 && <ActiveFilters q={q} filters={filters} />}

      <div className="pt-4">
        {req.status === "error" && req.error ? (
          <Trouble failure={req.error} onRetry={req.retry} />
        ) : req.data ? (
          <ResultList key={key} q={q} filters={filters} first={req.data} dim={req.refreshing} />
        ) : (
          <RowSkeleton count={6} />
        )}
      </div>
    </div>
  );
}

function ResultList({ q, filters, first, dim }: { q: string; filters: SearchFilters; first: SearchPage; dim: boolean }) {
  const { t, locale } = useI18n();
  const history = useWatchStore((s) => s.history);
  const progress = useMemo(() => new Map(history.map((h) => [h.id, progressOf(h)])), [history]);
  const paged = usePaged(first, (token) => watchApi.search(q, filters, locale, token));
  useEffect(() => rememberVideos(paged.all), [paged.all]);
  const queue: Queue = useMemo(() => ({ label: "watch.listSearch", videos: paged.all }), [paged.all]);

  if (paged.all.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon />}
        title={t("watch.emptySearch", { query: q })}
        description={countFilters(filters) > 0 ? t("watch.emptyFiltered") : undefined}
      />
    );
  }

  return (
    <>
      <div className={`space-y-6 transition-opacity sm:space-y-5 ${dim ? "opacity-60" : ""}`}>
        {paged.videos.map((v, i) => (
          <VideoRow key={v.id} video={v} queue={queue} progress={progress.get(v.id)} eager={i < 3} />
        ))}
      </div>
      <LoadMore
        canMore={paged.canMore}
        loading={paged.loading}
        error={paged.error}
        onMore={() => void paged.more()}
        doneText={t("watch.endOfResults")}
      />
    </>
  );
}

/**
 * The filter sheet: four columns on a desktop like YouTube's, stacked on a
 * phone. Every option is a toggle; pressing the selected one again clears it.
 */
function FilterPanel({ q, filters }: { q: string; filters: SearchFilters }) {
  const { t } = useI18n();
  const nav = useWatchNav();
  const set = (next: SearchFilters) => nav.refine(q, next);

  return (
    <div id="watch-filters" className="animate-rise mb-3 grid gap-x-8 gap-y-5 rounded-ui-lg border border-line bg-surface-1 p-4 shadow-ui-1 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
      <FilterGroup title={t("watch.filterDate")}>
        {DATES.map((d) => (
          <FilterOption key={d} selected={filters.date === d} onClick={() => set({ ...filters, date: filters.date === d ? undefined : d })}>
            {t(DATE_LABEL[d])}
          </FilterOption>
        ))}
      </FilterGroup>
      <FilterGroup title={t("watch.filterDuration")}>
        {DURATIONS.map((d) => (
          <FilterOption key={d} selected={filters.dur === d} onClick={() => set({ ...filters, dur: filters.dur === d ? undefined : d })}>
            {t(DUR_LABEL[d])}
          </FilterOption>
        ))}
      </FilterGroup>
      <FilterGroup title={t("watch.filterFeatures")}>
        <FilterOption selected={Boolean(filters.cc)} onClick={() => set({ ...filters, cc: !filters.cc || undefined })}>
          {t("watch.subtitles")}
        </FilterOption>
      </FilterGroup>
      <FilterGroup title={t("watch.filterSort")}>
        {SORTS.map((s) => (
          <FilterOption
            key={s}
            selected={(filters.sort ?? "relevance") === s}
            onClick={() => set({ ...filters, sort: s === "relevance" ? undefined : s })}
          >
            {t(SORT_LABEL[s])}
          </FilterOption>
        ))}
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={title}>
      <p className="eyebrow mb-2 border-b border-line pb-2">{title}</p>
      <div className="flex flex-wrap gap-1.5 sm:flex-col sm:gap-0.5">{children}</div>
    </div>
  );
}

function FilterOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`tap flex items-center gap-2 rounded-ui-sm px-2.5 py-1.5 text-left text-[13.5px] transition-colors sm:-mx-2.5 ${
        selected ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-dim hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
      {selected && <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

/** The filters in force, as chips that each clear themselves. */
function ActiveFilters({ q, filters }: { q: string; filters: SearchFilters }) {
  const { t } = useI18n();
  const nav = useWatchNav();
  const chips: { name: string; clear: SearchFilters }[] = [];
  if (filters.date) chips.push({ name: t(DATE_LABEL[filters.date]), clear: { ...filters, date: undefined } });
  if (filters.dur) chips.push({ name: t(DUR_LABEL[filters.dur]), clear: { ...filters, dur: undefined } });
  if (filters.cc) chips.push({ name: t("watch.subtitles"), clear: { ...filters, cc: undefined } });
  if (filters.sort) chips.push({ name: t(SORT_LABEL[filters.sort]), clear: { ...filters, sort: undefined } });

  return (
    <div className="flex flex-wrap items-center gap-2 pb-1">
      {chips.map((chip) => (
        <button
          key={chip.name}
          type="button"
          className="chip tap"
          data-active
          aria-label={t("watch.removeFilter", { name: chip.name })}
          onClick={() => nav.refine(q, chip.clear)}
        >
          {chip.name}
          <XIcon />
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" className="btn btn-ghost btn-sm tap" onClick={() => nav.refine(q, {})}>
          {t("watch.clearFilters")}
        </button>
      )}
    </div>
  );
}
