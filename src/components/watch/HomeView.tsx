"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import {
  ArrowRightIcon,
  BookIcon,
  BookmarkIcon,
  CodeIcon,
  FlaskIcon,
  GraduationCapIcon,
  HistoryIcon,
  InfoIcon,
  LandmarkIcon,
  LanguagesIcon,
  PaletteIcon,
  RefreshIcon,
  SigmaIcon,
  SparkleIcon,
} from "@/components/icons";
import { TOPICS, findTopic, type TopicId } from "@/lib/watch/query";
import { continueWatching, progressOf, toVideo } from "@/lib/watch/library";
import type { FeedResult, SearchPage, Seed } from "@/lib/watch/types";
import { STARTER_SEEDS, deriveSeeds, useWatchStore, type SeedPlan } from "@/store/useWatchStore";
import { watchApi } from "./api";
import { GRID, GridSkeleton, RefreshBar, SectionTitle } from "./bits";
import { LoadMore, usePaged } from "./Paged";
import { useWatchRequest, type View } from "./requests";
import { rememberVideos, type Queue } from "./session";
import { Shelf } from "./Shelf";
import { Trouble } from "./Trouble";
import { VideoCard } from "./VideoCard";
import { useWatchNav, watchHref } from "./nav";

// The home page: subject chips across the top, then what the student already
// has going (Continue watching, Watch later), then something new to watch.
//
// The old page opened on three invisible searches behind a long explainer box.
// Now the explanation is one line under a heading, the shelves that cost no
// quota come first, and the subject tiles at the bottom cost nothing until one
// is pressed.

export const TOPIC_LABEL: Record<TopicId, StringKey> = {
  math: "watch.topic.math",
  science: "watch.topic.science",
  coding: "watch.topic.coding",
  history: "watch.topic.history",
  english: "watch.topic.english",
  languages: "watch.topic.languages",
  arts: "watch.topic.arts",
  study: "watch.topic.study",
};

const TOPIC_ICON: Record<TopicId, typeof SigmaIcon> = {
  math: SigmaIcon,
  science: FlaskIcon,
  coding: CodeIcon,
  history: LandmarkIcon,
  english: BookIcon,
  languages: LanguagesIcon,
  arts: PaletteIcon,
  study: GraduationCapIcon,
};

/** A hue per subject, so the tiles read as a set of distinct doors. */
const TOPIC_HUE: Record<TopicId, number> = {
  math: 250,
  science: 160,
  coding: 200,
  history: 30,
  english: 330,
  languages: 280,
  arts: 0,
  study: 50,
};

export function HomeView({ topic }: { topic: TopicId | null }) {
  const hydrated = useWatchStore((s) => s.hydrated);
  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 pb-14 sm:px-6">
      <ChipRow active={topic} />
      {topic ? <TopicResults key={topic} topic={topic} /> : hydrated ? <HomeShelves /> : <GridSkeleton />}
    </div>
  );
}

function ChipRow({ active }: { active: TopicId | null }) {
  const { t } = useI18n();
  const nav = useWatchNav();
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the chosen chip in view on a phone, where the row scrolls sideways.
  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div ref={rowRef} className="watch-chips flex gap-2 pr-6" role="group" aria-label={t("watch.topicsLabel")}>
        <button type="button" className="chip tap shrink-0" aria-pressed={!active} onClick={() => nav.home(null, true)}>
          {t("watch.chipAll")}
        </button>
        {TOPICS.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className="chip tap shrink-0"
            aria-pressed={active === topic.id}
            onClick={() => nav.home(topic.id, true)}
          >
            {t(TOPIC_LABEL[topic.id])}
          </button>
        ))}
      </div>
    </div>
  );
}

function seedText(plan: SeedPlan, t: (key: StringKey, vars?: Record<string, string | number>) => string): string {
  const r = plan.reason;
  if (r.kind === "channel") {
    return r.count === 1 ? t("watch.becauseChannelOne", { channel: r.channel }) : t("watch.becauseChannel", { count: r.count, channel: r.channel });
  }
  if (r.kind === "word") return t("watch.becauseWord", { word: r.word });
  return t("watch.becauseStarter");
}

function plansKey(plans: SeedPlan[]): string {
  return plans.map((p) => p.term.toLowerCase()).sort().join("|");
}

function HomeShelves() {
  const { t, locale } = useI18n();
  const saved = useWatchStore((s) => s.saved);
  const history = useWatchStore((s) => s.history);

  const resumable = useMemo(() => continueWatching(history).slice(0, 12), [history]);
  const resumeVideos = useMemo(() => resumable.map(toVideo), [resumable]);
  const progress = useMemo(() => new Map(resumable.map((h) => [h.id, progressOf(h)])), [resumable]);
  const later = useMemo(() => saved.slice(0, 12).map(toVideo), [saved]);
  const laterQueue: Queue = useMemo(() => ({ label: "watch.listLater", videos: saved.map(toVideo) }), [saved]);
  const continueQueue: Queue = useMemo(() => ({ label: "watch.listContinue", videos: resumeVideos }), [resumeVideos]);

  const current = useMemo(() => {
    const derived = deriveSeeds(saved);
    return derived.length ? derived : STARTER_SEEDS;
  }, [saved]);

  // The feed is built from the seeds as they were when the page opened. Saving
  // a video doesn't reshuffle the grid under the hand that just pressed the
  // bookmark (or spend three more searches doing it); the page offers a
  // Refresh instead, and the student decides when the ground moves.
  const [plans, setPlans] = useState(current);
  const stale = plansKey(plans) !== plansKey(current);

  const seeds: Seed[] = useMemo(() => plans.map((p) => ({ term: p.term, because: seedText(p, t) })), [plans, t]);
  const feed = useWatchRequest<FeedResult>("feed", `feed:${plansKey(plans)}:${locale}`, () => watchApi.feed(seeds, locale));

  return (
    <div className="space-y-11 pt-3">
      {resumeVideos.length > 0 && (
        <Shelf
          title={t("watch.continueWatching")}
          icon={<HistoryIcon />}
          videos={resumeVideos}
          queue={continueQueue}
          seeAllHref={watchHref({ list: "continue" })}
          progressFor={(id) => progress.get(id) ?? null}
        />
      )}

      <Feed plans={plans} feed={feed} stale={stale} onRefresh={() => setPlans(current)} />

      {later.length > 0 && (
        <Shelf
          title={t("watch.watchLater")}
          icon={<BookmarkIcon />}
          videos={later}
          queue={laterQueue}
          seeAllHref={watchHref({ list: "later" })}
        />
      )}

      {/* Only once YouTube has answered: on a copy with no key every tile
          would lead to the same "not switched on" card. */}
      {feed.data && <Subjects />}
    </div>
  );
}

/**
 * Who the feed is following, said in as few words as possible: the channel
 * names and the repeated word, rather than a sentence per search.
 */
function followed(plans: SeedPlan[]): string {
  return plans
    .map((p) => (p.reason.kind === "channel" ? p.reason.channel : p.reason.kind === "word" ? `“${p.reason.word}”` : ""))
    .filter(Boolean)
    .join(" · ");
}

function Feed({
  plans,
  feed,
  stale,
  onRefresh,
}: {
  plans: SeedPlan[];
  feed: View<FeedResult> & { retry: () => void };
  stale: boolean;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const personal = plans[0]?.reason.kind !== "starter";

  const videos = useMemo(() => feed.data?.videos ?? [], [feed.data]);
  useEffect(() => rememberVideos(videos), [videos]);
  const queue: Queue = useMemo(() => ({ label: "watch.listFeed", videos }), [videos]);
  const visible = expanded ? videos : videos.slice(0, 8);

  if (feed.status === "error" && feed.error) {
    return (
      <section>
        <Trouble failure={feed.error} onRetry={feed.retry} />
      </section>
    );
  }

  return (
    <section aria-labelledby="watch-feed-title" className="relative">
        <div className="sticky top-[56px] z-10 h-0">
          <RefreshBar active={feed.refreshing} />
        </div>
        <SectionTitle
          id="watch-feed-title"
          icon={<SparkleIcon />}
          title={t(personal ? "watch.becauseYouSaved" : "watch.startHere")}
          hint={personal ? followed(plans) || null : t("watch.feedHowGeneric")}
          action={
            <>
              {stale && (
                <button type="button" className="btn btn-outline btn-sm tap" onClick={onRefresh} title={t("watch.feedStale")}>
                  <RefreshIcon />
                  <span className="hidden sm:inline">{t("watch.refreshFeed")}</span>
                </button>
              )}
              {personal && (
                <button
                  type="button"
                  className="icon-btn tap-sq"
                  aria-label={t("watch.howThisWorks")}
                  title={t("watch.howThisWorks")}
                  aria-expanded={howOpen}
                  onClick={() => setHowOpen((o) => !o)}
                >
                  <InfoIcon />
                </button>
              )}
            </>
          }
        />
        {howOpen && personal && (
          <p className="animate-rise -mt-1 mb-4 max-w-2xl rounded-ui border border-line bg-surface-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-dim">
            {t("watch.feedHowPersonal")}
          </p>
        )}
        {feed.data?.partial && <p className="-mt-1 mb-3 text-[12.5px] text-ink-faint">{t("watch.feedPartial")}</p>}

        {feed.data ? (
          <div className={`${GRID} transition-opacity ${feed.refreshing ? "opacity-60" : ""}`}>
            {visible.map((v, i) => (
              <VideoCard key={v.id} video={v} queue={queue} showBecause={personal} eager={i < 4} />
            ))}
          </div>
        ) : (
          <GridSkeleton />
        )}

        {videos.length > 8 && (
          <div className="mt-8 flex items-center gap-4">
            <span className="h-px flex-1 bg-line" />
            <button type="button" className="btn btn-outline btn-pill btn-sm tap" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
              {t(expanded ? "watch.showLess" : "watch.showMore")}
            </button>
            <span className="h-px flex-1 bg-line" />
          </div>
        )}
    </section>
  );
}

function Subjects() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="watch-subjects">
      <SectionTitle id="watch-subjects" icon={<GraduationCapIcon />} title={t("watch.exploreSubjects")} hint={t("watch.topicNote")} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TOPICS.map((topic) => {
          const Icon = TOPIC_ICON[topic.id];
          const hue = TOPIC_HUE[topic.id];
          return (
            <Link
              key={topic.id}
              href={watchHref({ c: topic.id })}
              className="card card-interactive tap group flex items-center gap-3 px-3.5 py-3.5"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui"
                style={{
                  background: `color-mix(in srgb, hsl(${hue} 70% 55%) 16%, transparent)`,
                  color: `hsl(${hue} 65% var(--watch-tile-l, 62%))`,
                }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{t(TOPIC_LABEL[topic.id])}</span>
              <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TopicResults({ topic }: { topic: TopicId }) {
  const { t, locale } = useI18n();
  const def = findTopic(topic)!;
  const req = useWatchRequest<SearchPage>("topic", `topic:${topic}:${locale}`, () => watchApi.topic(topic, locale), 60 * 60_000);
  const paged = usePaged(req.data, (token) => watchApi.topic(topic, locale, token));
  useEffect(() => rememberVideos(paged.all), [paged.all]);
  const queue: Queue = useMemo(() => ({ label: TOPIC_LABEL[def.id], videos: paged.all }), [def.id, paged.all]);

  return (
    <section className="relative pt-3" aria-labelledby="watch-topic-title">
      <div className="sticky top-[56px] z-10 h-0">
        <RefreshBar active={req.refreshing} />
      </div>
      {(() => {
        const Icon = TOPIC_ICON[topic];
        return <SectionTitle id="watch-topic-title" icon={<Icon />} title={t(TOPIC_LABEL[topic])} hint={t("watch.topicNote")} />;
      })()}
      {req.status === "error" && req.error ? (
        <Trouble failure={req.error} onRetry={req.retry} />
      ) : req.data ? (
        <>
          <div className={`${GRID} transition-opacity ${req.refreshing ? "opacity-60" : ""}`}>
            {paged.videos.map((v, i) => (
              <VideoCard key={v.id} video={v} queue={queue} eager={i < 4} />
            ))}
          </div>
          <LoadMore canMore={paged.canMore} loading={paged.loading} error={paged.error} onMore={() => void paged.more()} />
        </>
      ) : (
        <GridSkeleton count={12} />
      )}
    </section>
  );
}
