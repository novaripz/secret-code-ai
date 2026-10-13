"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  BookmarkFilledIcon,
  BookmarkIcon,
  CopyIcon,
  SparkleIcon,
  TrashIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/primitives";
import type { Video } from "@/lib/watch/types";
import { useWatchStore } from "@/store/useWatchStore";
import { ChannelAvatar, Thumbnail } from "./bits";
import { metaLine } from "./format";
import { CardMenu, type MenuItem } from "./Menu";
import { prepareOpen, useVideoActions, watchHref } from "./nav";
import type { Queue } from "./session";

// One video, in the three shapes Watch draws it:
//
//   VideoCard   — the grid card on the home page and in the library
//   VideoRow    — a search result: big thumbnail left, details right
//   CompactRow  — Up next, beside the player
//
// In all three the title is the one real link and the thumbnail is a second,
// mouse-only way to the same place (hidden from the keyboard and from screen
// readers), so tabbing through a page of videos is one stop per video plus its
// Watch later and ⋮ buttons — not two stops for one idea.
//
// The old card had a text "Save" button on every video. It is now a bookmark
// that appears over the thumbnail on hover (always visible on touch screens),
// plus a ⋮ menu, which is where a student already looks for these.

interface CardProps {
  video: Video;
  /** The list this card sits in, carried to the watch page's Up next. */
  queue?: Queue;
  /** 0..1, drawn as a bar along the bottom of the thumbnail. */
  progress?: number | null;
  playing?: boolean;
  /** Show the feed's "Because you saved…" line under the card. */
  showBecause?: boolean;
  /** Extra menu entries, e.g. "Remove from history" in the library. */
  extraItems?: MenuItem[];
  /** Hand focus-first treatment to the first few images on screen. */
  eager?: boolean;
}

function useCardItems(video: Video, extra: MenuItem[] = []): { saved: boolean; items: MenuItem[]; toggle: () => void } {
  const { t } = useI18n();
  const saved = useWatchStore((s) => s.saved.some((v) => v.id === video.id));
  const actions = useVideoActions();
  const items: MenuItem[] = [
    {
      label: t(saved ? "watch.removeWatchLater" : "watch.addWatchLater"),
      icon: saved ? <BookmarkFilledIcon /> : <BookmarkIcon />,
      onSelect: () => void actions.toggleLater(video),
    },
    { label: t("watch.askPanda"), icon: <SparkleIcon />, onSelect: () => actions.askPanda(video) },
    { label: t("watch.copyLink"), icon: <CopyIcon />, onSelect: () => void actions.copyLink(video) },
    ...extra,
  ];
  return { saved, items, toggle: () => void actions.toggleLater(video) };
}

/** The bookmark over a thumbnail's corner. */
function LaterButton({ saved, onToggle, title }: { saved: boolean; onToggle: () => void; title: string }) {
  const { t } = useI18n();
  const label = t(saved ? "watch.removeWatchLater" : "watch.addWatchLater");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={`${label}: ${title}`}
      title={label}
      className="watch-hover-action tap-sq absolute right-1.5 top-1.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-ui-sm bg-black/70 text-white backdrop-blur-sm hover:bg-black/85"
    >
      {saved ? <BookmarkFilledIcon className="h-[18px] w-[18px]" /> : <BookmarkIcon className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function VideoCard({ video, queue, progress, playing, showBecause, extraItems, eager }: CardProps) {
  const { t, locale } = useI18n();
  const { saved, items, toggle } = useCardItems(video, extraItems);
  const href = watchHref({ v: video.id });
  const meta = metaLine(video, t, locale);

  return (
    <article className="group relative min-w-0">
      <div className="relative">
        <Link href={href} prefetch={false} onClick={() => prepareOpen(video, queue)} tabIndex={-1} aria-hidden="true" className="block">
          <Thumbnail video={video} progress={progress} playing={playing} eager={eager} />
        </Link>
        <LaterButton saved={saved} onToggle={toggle} title={video.title} />
      </div>

      <div className="mt-3 flex gap-3">
        <ChannelAvatar name={video.channel} size={36} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold leading-snug text-ink">
            <Link
              prefetch={false}
              href={href}
              onClick={() => prepareOpen(video, queue)}
              title={video.title}
              className="line-clamp-2 rounded-sm hover:text-accent-text"
            >
              {video.title}
            </Link>
          </h3>
          {video.channel && <p className="mt-1 truncate text-[13px] text-ink-dim">{video.channel}</p>}
          {meta && <p className="truncate text-[12.5px] text-ink-faint">{meta}</p>}
          {showBecause && video.because && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-accent-text">
              <SparkleIcon className="mt-[1px] h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{video.because}</span>
            </p>
          )}
        </div>
        <CardMenu items={items} label={t("watch.moreActions")} />
      </div>
    </article>
  );
}

function isNew(iso: string) {
  const at = Date.parse(iso);
  return Number.isFinite(at) && Date.now() - at < 7 * 24 * 3600_000;
}

export function VideoRow({ video, queue, progress, extraItems, eager }: CardProps) {
  const { t, locale } = useI18n();
  const { saved, items, toggle } = useCardItems(video, extraItems);
  const href = watchHref({ v: video.id });
  const meta = metaLine(video, t, locale);

  return (
    <article className="group relative flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
      <div className="relative w-full shrink-0 sm:w-[min(360px,42%)]">
        <Link href={href} prefetch={false} onClick={() => prepareOpen(video, queue)} tabIndex={-1} aria-hidden="true" className="block">
          <Thumbnail video={video} progress={progress} eager={eager} sizes="(max-width: 640px) 100vw, 360px" />
        </Link>
        <LaterButton saved={saved} onToggle={toggle} title={video.title} />
      </div>

      <div className="min-w-0 flex-1 sm:py-0.5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[15.5px] font-semibold leading-snug text-ink sm:text-[17px]">
            <Link
              prefetch={false}
              href={href}
              onClick={() => prepareOpen(video, queue)}
              title={video.title}
              className="line-clamp-2 rounded-sm hover:text-accent-text"
            >
              {video.title}
            </Link>
          </h3>
          <CardMenu items={items} label={t("watch.moreActions")} />
        </div>
        {meta && <p className="mt-1 text-[12.5px] text-ink-faint">{meta}</p>}
        {video.channel && (
          <p className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-dim">
            <ChannelAvatar name={video.channel} size={24} />
            <span className="truncate">{video.channel}</span>
          </p>
        )}
        {video.snippet && (
          <p className="mt-2.5 hidden text-[13px] leading-relaxed text-ink-faint sm:block">
            <span className="line-clamp-2">{video.snippet}</span>
          </p>
        )}
        {(video.captions || isNew(video.publishedAt)) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {isNew(video.publishedAt) && <Badge tone="accent">{t("watch.newBadge")}</Badge>}
            {video.captions && (
              <Badge title={t("watch.ccLabel")} aria-label={t("watch.ccLabel")}>
                {t("watch.ccBadge")}
              </Badge>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function CompactRow({ video, queue, progress, playing, extraItems }: CardProps) {
  const { t, locale } = useI18n();
  const { items } = useCardItems(video, extraItems);
  const href = watchHref({ v: video.id });
  const meta = metaLine(video, t, locale);

  return (
    <article className="group relative flex min-w-0 gap-2.5">
      <Link
        prefetch={false}
        href={href}
        onClick={() => prepareOpen(video, queue)}
        tabIndex={-1}
        aria-hidden="true"
        className="block w-[42%] max-w-[168px] shrink-0"
      >
        <Thumbnail video={video} progress={progress} playing={playing} sizes="168px" className="!rounded-ui-sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold leading-snug text-ink">
          <Link
            prefetch={false}
            href={href}
            onClick={() => prepareOpen(video, queue)}
            title={video.title}
            aria-current={playing ? "true" : undefined}
            className="line-clamp-2 rounded-sm hover:text-accent-text"
          >
            {video.title}
          </Link>
        </h3>
        {video.channel && <p className="mt-1 truncate text-[12.5px] text-ink-dim">{video.channel}</p>}
        {meta && <p className="truncate text-[12px] text-ink-faint">{meta}</p>}
      </div>
      <CardMenu items={items} label={t("watch.moreActions")} />
    </article>
  );
}

/** The "Remove from history" entry the library adds to a card's menu. */
export function historyItem(label: string, onSelect: () => void): MenuItem {
  return { label, icon: <TrashIcon />, onSelect, danger: true };
}
