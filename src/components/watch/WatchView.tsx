"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import {
  AlertIcon,
  ArrowLeftIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
  ListVideoIcon,
  RefreshIcon,
  ShareIcon,
  SkipForwardIcon,
  SparkleIcon,
  TheaterIcon,
} from "@/components/icons";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { chapterAt, formatClock, parseChapters, splitTimestamps, type Chapter } from "@/lib/watch/parse";
import { progressOf, resumeAt } from "@/lib/watch/library";
import type { BlockedReason, ChannelInfo, Video, VideoDetail, VideoLookup } from "@/lib/watch/types";
import { flushWatchHistory, useWatchStore } from "@/store/useWatchStore";
import { watchApi } from "./api";
import { ChannelAvatar, CompactSkeleton, Thumbnail } from "./bits";
import { pageControls } from "./controls";
import { date, views } from "./format";
import { Player, type PlayerControls } from "./Player";
import { useWatchRequest } from "./requests";
import { setTheater, useKnownVideo, useOrigin, useQueue, useTheater, type Queue } from "./session";
import { useVideoActions, useWatchNav } from "./nav";
import { CompactRow } from "./VideoCard";
import { Trouble } from "./Trouble";

// The watch page: the player, what the video is, and what comes next.
//
// It used to be an iframe dropped at the top of the feed, which meant clicking
// a card in the third row appeared to do nothing — the video had started
// playing somewhere off-screen. Now a video is its own page at /watch?v=…, with
// the YouTube-shaped layout students already know: the player large on the
// left, the details under it, Up next down the right. On a phone the player
// sticks to the top while the details scroll beneath it.
//
// Two things here are Panda's own rather than YouTube's. When a video ends,
// YouTube's end screen (a wall of suggestions from anywhere) is replaced by
// Panda's: replay, or the next two from the list the student came from. And
// when a video refuses to play inside the app — which school networks and some
// channels cause — the student gets a plain explanation and a way on, instead
// of the player's grey error box.

type Phase = { kind: "play" } | { kind: "ended" } | { kind: "error"; reason: BlockedReason | "player"; code?: number };

const PROGRESS_EVERY_MS = 5_000;

export function WatchView({ id }: { id: string }) {
  const hydrated = useWatchStore((s) => s.hydrated);
  // Wait for the library before mounting the player: it holds where the
  // student got to last time, and the start position can't change once the
  // video has begun.
  if (!hydrated) return <WatchSkeleton />;
  return <WatchPage key={id} id={id} />;
}

/** Up next: the rest of the list they came from, after this video and then wrapping round. */
function restOf(queue: Queue | null, id: string): Video[] {
  if (!queue) return [];
  const at = queue.videos.findIndex((v) => v.id === id);
  if (at < 0) return queue.videos.filter((v) => v.id !== id);
  return [...queue.videos.slice(at + 1), ...queue.videos.slice(0, at)];
}

function WatchPage({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const nav = useWatchNav();
  const actions = useVideoActions();
  const origin = useOrigin();
  const theater = useTheater();
  const queue = useQueue();
  const known = useKnownVideo(id);

  const lookup = useWatchRequest<VideoLookup>(`video:${id}`, `v:${id}:${locale}`, () => watchApi.video(id, locale), 30 * 60_000);
  const detail: VideoDetail | null = lookup.data?.video ?? null;
  const channel: ChannelInfo | null = lookup.data?.channel ?? null;
  const blocked = lookup.data?.blocked ?? null;
  // A shared link opened where the details can't load (no key, no quota) still
  // plays — the embed needs no key — so the page carries on with a plain
  // stand-in rather than skeletons that never resolve.
  const unknown = useMemo<Video | null>(
    () =>
      lookup.status === "error"
        ? { id, title: t("watch.untitledVideo"), channel: "", channelId: "", thumbnail: "", publishedAt: "", seconds: null, viewCount: null, because: null }
        : null,
    [lookup.status, id, t],
  );
  const video: Video | null = detail ?? known ?? unknown;

  const saved = useWatchStore((s) => s.saved.some((v) => v.id === id));
  const recordPlay = useWatchStore((s) => s.recordPlay);
  const recordProgress = useWatchStore((s) => s.recordProgress);

  // Resume where they left off, decided once when the page opens. Read from
  // the store directly rather than subscribed: progress written while this
  // video plays must not move its own starting point.
  const [initialStart] = useState(() => resumeAt(useWatchStore.getState().history.find((h) => h.id === id)));
  const [start, setStart] = useState(initialStart);
  const [playKey, setPlayKey] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "play" });
  const [now, setNow] = useState(initialStart);

  const playerRef = useRef<PlayerControls>(null);
  // The player's latest report, kept apart from the player itself so the save
  // on the way out still has it after the iframe is gone.
  const reported = useRef<{ time: number; duration: number } | null>(null);
  const lastSaved = useRef(0);
  const started = useRef(false);
  const videoRef = useRef<Video | null>(video);
  useEffect(() => {
    videoRef.current = video;
  });

  // Up next, in order: the rest of the list they came from, then "More like
  // this", which costs a search and so is only asked for once the student
  // scrolls down to it (or there was no list to begin with).
  const fromList = useMemo(() => restOf(queue, id), [queue, id]);
  const [wantRelated, setWantRelated] = useState(false);
  const related = useWatchRequest<{ videos: Video[] }>(
    `related:${id}`,
    wantRelated && !blocked ? `r:${id}:${locale}` : null,
    () => watchApi.related(id, locale),
    24 * 60 * 60_000,
  );
  const relatedVideos = useMemo(() => {
    const seen = new Set([id, ...fromList.map((v) => v.id)]);
    return (related.data?.videos ?? []).filter((v) => !seen.has(v.id));
  }, [related.data, fromList, id]);
  const upNext = useMemo(() => [...fromList, ...relatedVideos], [fromList, relatedVideos]);

  const history = useWatchStore((s) => s.history);
  const progressById = useMemo(() => new Map(history.map((h) => [h.id, progressOf(h)])), [history]);

  const playNext = useCallback(() => {
    const next = upNext[0];
    if (next) nav.open(next, queue ?? { label: "watch.listRelated", videos: upNext });
  }, [upNext, nav, queue]);

  const restart = useCallback((at: number) => {
    setStart(at);
    setNow(at);
    setPhase({ kind: "play" });
    setPlayKey((k) => k + 1);
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      if (phase.kind !== "play") restart(seconds);
      else {
        playerRef.current?.seekTo(seconds);
        setNow(seconds);
      }
      document.getElementById("watch-player")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [phase.kind, restart],
  );

  // Keyboard shortcuts reach the player through here while this page is open.
  useEffect(() => {
    pageControls.current = {
      togglePlay: () => playerRef.current?.togglePlay(),
      seekBy: (d) => playerRef.current?.seekBy(d),
      toggleMute: () => playerRef.current?.toggleMute(),
      next: playNext,
      toggleLater: () => {
        if (videoRef.current) void actions.toggleLater(videoRef.current);
      },
      askPanda: () => {
        if (videoRef.current) actions.askPanda(videoRef.current, { description: detail?.description, at: playerRef.current?.time() });
      },
    };
    return () => {
      pageControls.current = null;
    };
  }, [playNext, actions, detail]);

  // Save how far they got on the way out, whatever the way out is.
  useEffect(() => {
    return () => {
      const last = reported.current;
      if (last && started.current) useWatchStore.getState().recordProgress(id, last.time, last.duration || null);
      flushWatchHistory();
    };
  }, [id]);

  const blockedPhase: Phase | null = blocked ? { kind: "error", reason: blocked } : null;
  const shown = blockedPhase ?? phase;
  const chapters = useMemo(() => (detail ? parseChapters(detail.description, detail.seconds) : []), [detail]);

  return (
    <div className="watch-layout" data-theater={theater}>
      {/* The player */}
      <div className="wl-player" id="watch-player">
        <div className="watch-frame">
          {shown.kind === "play" && origin && (
            <Player
              key={`${id}:${playKey}`}
              ref={playerRef}
              videoId={id}
              title={t("watch.playerTitle", { title: video?.title ?? "" })}
              start={start}
              origin={origin}
              locale={locale}
              onPlaying={() => {
                if (!started.current && videoRef.current) {
                  started.current = true;
                  recordPlay(videoRef.current);
                }
              }}
              onTime={(time, length) => {
                reported.current = { time, duration: length };
                const at = Date.now();
                if (at - lastSaved.current > PROGRESS_EVERY_MS) {
                  lastSaved.current = at;
                  if (started.current) recordProgress(id, time, length || null);
                  setNow(time);
                } else if (chapters.length > 0 && Math.abs(time - now) >= 1) {
                  setNow(time);
                }
              }}
              onEnded={() => {
                const p = playerRef.current;
                if (p) recordProgress(id, p.duration() || p.time(), p.duration() || null);
                setPhase({ kind: "ended" });
              }}
              onError={(code) => setPhase({ kind: "error", reason: code === 100 ? "missing" : code === 101 || code === 150 || code === 153 ? "embed" : "player", code })}
            />
          )}
          {shown.kind === "ended" && video && (
            <EndCard video={video} next={upNext.slice(0, 2)} queue={queue} onReplay={() => restart(0)} />
          )}
          {shown.kind === "error" && (
            <CantPlay
              video={video}
              reason={shown.reason}
              code={shown.kind === "error" ? shown.code : undefined}
              onSkip={upNext.length > 0 ? playNext : undefined}
              onBack={() => nav.home()}
            />
          )}
        </div>
      </div>

      {/* What it is */}
      <div className="wl-details px-4 pt-3 @[1000px]:px-0 @[1000px]:pt-4">
        {initialStart > 0 && start === initialStart && phase.kind === "play" && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-dim">
            <Badge tone="accent">{t("watch.resumedAt", { time: formatClock(initialStart) })}</Badge>
            <button type="button" className="btn btn-ghost btn-sm tap" onClick={() => restart(0)}>
              <RefreshIcon />
              {t("watch.startOver")}
            </button>
          </div>
        )}

        {video ? (
          <h1 className="text-[18px] font-semibold leading-snug tracking-tight text-ink sm:text-[21px]">{video.title}</h1>
        ) : (
          <Skeleton className="h-6 w-3/4" />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            {video ? (
              <>
                {video.channel && <ChannelAvatar name={video.channel} src={channel?.avatar} size={40} />}
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{video.channel}</p>
                  {video.viewCount != null && <p className="text-[12.5px] text-ink-faint">{views(video.viewCount, t, locale)}</p>}
                </div>
              </>
            ) : (
              <>
                <Skeleton className="h-10 w-10 !rounded-full" />
                <Skeleton className="h-4 w-32" />
              </>
            )}
          </div>

          {/* Actions scroll sideways on a narrow phone rather than wrapping
              into a ragged second row. */}
          <div className="scroll-x -mx-4 flex items-center gap-2 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
            <button
              type="button"
              className="btn btn-secondary btn-pill tap shrink-0"
              aria-pressed={saved}
              disabled={!video}
              onClick={() => video && void actions.toggleLater(video)}
            >
              {saved ? <BookmarkFilledIcon /> : <BookmarkIcon />}
              {t(saved ? "watch.inWatchLater" : "watch.watchLater")}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-pill tap shrink-0"
              disabled={!video}
              title={t("watch.askPandaHint")}
              aria-describedby="watch-ask-hint"
              onClick={() => video && actions.askPanda(video, { description: detail?.description, at: playerRef.current?.time() })}
            >
              <SparkleIcon />
              {t("watch.askPanda")}
            </button>
            <span id="watch-ask-hint" className="sr-only">
              {t("watch.askPandaHint")}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-pill tap shrink-0"
              disabled={!video}
              onClick={() => video && void actions.copyLink(video)}
            >
              <ShareIcon />
              {t("watch.copyLink")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-pill tap hidden shrink-0 @[1000px]:inline-flex"
              aria-pressed={theater}
              onClick={() => setTheater(!theater)}
              title={`${t(theater ? "watch.exitTheater" : "watch.theater")} (t)`}
            >
              <TheaterIcon />
              {t(theater ? "watch.exitTheater" : "watch.theater")}
            </button>
          </div>
        </div>

        <DescriptionBox video={video} detail={detail} loading={lookup.status === "loading" && !detail} onSeek={seek} />

        {chapters.length > 0 && <Chapters chapters={chapters} now={now} onSeek={seek} />}

        {lookup.status === "error" && lookup.error && (
          <div className="mt-4">
            <Trouble failure={lookup.error} onRetry={lookup.retry} compact />
          </div>
        )}
      </div>

      {/* What comes next */}
      <aside className="wl-rail px-4 pt-6 @[1000px]:px-0 @[1000px]:pt-0" aria-labelledby="watch-upnext">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="watch-upnext" className="text-[16px] font-semibold text-ink">
            {t("watch.upNext")}
          </h2>
          {queue && fromList.length > 0 && (
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-faint">
              <ListVideoIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("watch.fromList", { list: t(queue.label) })}</span>
            </span>
          )}
        </div>

        <div className="space-y-3">
          {fromList.map((v) => (
            <CompactRow key={v.id} video={v} queue={queue ?? undefined} progress={progressById.get(v.id)} />
          ))}
        </div>

        {fromList.length > 0 && (relatedVideos.length > 0 || related.status === "loading") && (
          <h3 className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">{t("watch.moreLikeThis")}</h3>
        )}

        <RelatedSentinel onVisible={() => setWantRelated(true)} />

        {related.status === "loading" && !related.data && <CompactSkeleton count={fromList.length > 0 ? 3 : 8} />}
        <div className="space-y-3">
          {relatedVideos.map((v) => (
            <CompactRow
              key={v.id}
              video={v}
              queue={{ label: "watch.listRelated", videos: relatedVideos }}
              progress={progressById.get(v.id)}
            />
          ))}
        </div>

        {upNext.length === 0 && related.status !== "loading" && (
          <p className="rounded-ui border border-dashed border-line-strong px-4 py-6 text-center text-[13px] leading-relaxed text-ink-dim">
            {t("watch.upNextEmpty")}
          </p>
        )}
      </aside>
    </div>
  );
}

/** Asks for "More like this" once the bottom of the rail comes into view. */
function RelatedSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          callback.current();
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden="true" className="h-px" />;
}

function DescriptionBox({
  video,
  detail,
  loading,
  onSeek,
}: {
  video: Video | null;
  detail: VideoDetail | null;
  loading: boolean;
  onSeek: (seconds: number) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const text = detail?.description ?? video?.snippet ?? "";
  // Folded, blank lines are squeezed out so the three visible lines carry
  // words rather than a gap and an ellipsis.
  const visible = open ? text : text.replace(/\n\s*\n+/g, "\n");
  const parts = useMemo(() => splitTimestamps(visible, detail?.seconds ?? video?.seconds ?? null), [visible, detail, video]);
  const long = text.length > 220 || text.split("\n").length > 3;
  const meta = video ? [views(video.viewCount, t, locale), date(video.publishedAt, locale)].filter(Boolean).join(" · ") : "";

  return (
    <div className="mt-4 rounded-ui-lg bg-surface-2 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {meta && <span className="font-semibold">{meta}</span>}
        {video?.captions && <Badge title={t("watch.ccLabel")}>{t("watch.ccBadge")}</Badge>}
      </div>

      {loading && !text ? (
        <div className="mt-2 space-y-2" aria-hidden="true">
          <Skeleton className="h-3 w-[90%]" />
          <Skeleton className="h-3 w-[75%]" />
          <Skeleton className="h-3 w-[50%]" />
        </div>
      ) : text ? (
        <>
          <p className={`mt-1.5 whitespace-pre-line break-words text-ink-dim ${open ? "" : "line-clamp-3"}`}>
            {parts.map((part, i) =>
              part.kind === "time" ? (
                <button
                  key={i}
                  type="button"
                  className="rounded-sm font-medium text-accent-text hover:underline"
                  aria-label={t("watch.jumpTo", { time: part.text })}
                  onClick={() => onSeek(part.seconds)}
                >
                  {part.text}
                </button>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
          {long && (
            <button
              type="button"
              className="tap mt-1 rounded-sm text-[13px] font-semibold text-ink hover:underline"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {t(open ? "watch.less" : "watch.more")}
            </button>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-ink-faint">{t("watch.noDescription")}</p>
      )}
    </div>
  );
}

function Chapters({ chapters, now, onSeek }: { chapters: Chapter[]; now: number; onSeek: (s: number) => void }) {
  const { t } = useI18n();
  const current = chapterAt(chapters, now);
  return (
    <section className="mt-5" aria-labelledby="watch-chapters">
      <h2 id="watch-chapters" className="mb-2.5 text-[14px] font-semibold text-ink">
        {t("watch.chapters")}
      </h2>
      <ol className="scroll-x -mx-4 flex gap-2.5 px-4 pb-1 @[1000px]:mx-0 @[1000px]:px-0">
        {chapters.map((c, i) => (
          <li key={c.seconds} className="shrink-0">
            <button
              type="button"
              onClick={() => onSeek(c.seconds)}
              aria-current={i === current ? "true" : undefined}
              className={`tap flex w-[200px] flex-col items-start gap-1 rounded-ui border px-3 py-2.5 text-left transition-colors ${
                i === current
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <span className="text-[12px] font-semibold tabular-nums text-accent-text">{formatClock(c.seconds)}</span>
              <span className="line-clamp-2 text-[13px] leading-snug text-ink">{c.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Backdrop({ video }: { video: Video | null }) {
  if (!video?.thumbnail) return null;
  return <div className="watch-backdrop" style={{ backgroundImage: `url("${video.thumbnailHigh ?? video.thumbnail}")` }} aria-hidden="true" />;
}

/** Panda's own end screen: replay, or the next two from the list. */
function EndCard({
  video,
  next,
  queue,
  onReplay,
}: {
  video: Video;
  next: Video[];
  queue: Queue | null;
  onReplay: () => void;
}) {
  const { t } = useI18n();
  const nav = useWatchNav();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#0b0c10] text-white">
      <Backdrop video={video} />
      <div className="relative flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-4 sm:gap-6">
        <p className="text-[15px] font-semibold sm:text-[18px]">{t("watch.endedTitle")}</p>
        <div className="flex w-full items-stretch justify-center gap-3 sm:gap-4">
          <button
            ref={first}
            type="button"
            onClick={onReplay}
            className="tap flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-ui border border-white/20 bg-white/10 px-3 py-3 text-[13px] font-medium hover:bg-white/20 sm:w-36"
          >
            <RefreshIcon className="h-6 w-6" />
            {t("watch.replay")}
          </button>
          {next.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => nav.open(v, queue ?? undefined)}
              className="tap group hidden w-[220px] min-w-0 flex-col gap-2 rounded-ui border border-white/15 bg-black/40 p-2 text-left hover:bg-black/60 min-[480px]:flex"
            >
              <Thumbnail video={v} className="!rounded-ui-sm" sizes="220px" />
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                <SkipForwardIcon className="h-3 w-3" />
                {t("watch.nextUp")}
              </span>
              <span className="line-clamp-2 text-[13px] font-medium leading-snug">{v.title}</span>
            </button>
          ))}
        </div>
        {next[0] && (
          <button
            type="button"
            onClick={() => nav.open(next[0], queue ?? undefined)}
            className="btn btn-primary btn-sm tap min-[480px]:hidden"
          >
            <SkipForwardIcon />
            {t("watch.nextUp")}
          </button>
        )}
      </div>
    </div>
  );
}

const REASON_TEXT: Record<BlockedReason | "player", StringKey> = {
  embed: "watch.cantPlayEmbed",
  missing: "watch.cantPlayMissing",
  age: "watch.cantPlayAge",
  live: "watch.cantPlayLive",
  private: "watch.cantPlayMissing",
  player: "watch.cantPlayOther",
};

/** A friendly card instead of the player's grey error box. */
function CantPlay({
  video,
  reason,
  code,
  onSkip,
  onBack,
}: {
  video: Video | null;
  reason: BlockedReason | "player";
  code?: number;
  onSkip?: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <div role="alert" className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#0b0c10] text-white">
      <Backdrop video={video} />
      <div className="relative flex max-w-md flex-col items-center px-6 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 sm:h-12 sm:w-12">
          <AlertIcon className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <p className="text-[15px] font-semibold sm:text-[17px]">{t("watch.cantPlayTitle")}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/75 sm:text-[13.5px]">
          {t(REASON_TEXT[reason])}
          {code ? <span className="text-white/45"> ({code})</span> : null}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {onSkip && (
            <button type="button" onClick={onSkip} className="btn btn-primary btn-sm tap">
              <SkipForwardIcon />
              {t("watch.skipToNext")}
            </button>
          )}
          <button type="button" onClick={onBack} className="btn btn-sm tap border-white/25 bg-white/10 text-white hover:bg-white/20">
            <ArrowLeftIcon />
            {t("watch.backToVideos")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WatchSkeleton() {
  return (
    <div className="watch-layout" aria-hidden="true">
      <div className="wl-player">
        <div className="watch-frame" />
      </div>
      <div className="wl-details space-y-3 px-4 pt-4 @[1000px]:px-0">
        <Skeleton className="h-6 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 !rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-24 w-full !rounded-ui-lg" />
      </div>
      <div className="wl-rail px-4 pt-6 @[1000px]:px-0 @[1000px]:pt-0">
        <CompactSkeleton count={7} />
      </div>
    </div>
  );
}
