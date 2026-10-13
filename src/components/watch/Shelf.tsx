"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { Video } from "@/lib/watch/types";
import { SectionTitle } from "./bits";
import type { Queue } from "./session";
import { VideoCard } from "./VideoCard";

// A row of videos that scrolls sideways: Continue watching, Watch later.
// Snaps card by card, swipes on a phone, and has arrow buttons on a desktop
// where a sideways swipe is not something a mouse can do.

export function Shelf({
  title,
  icon,
  hint,
  videos,
  queue,
  seeAllHref,
  progressFor,
}: {
  title: string;
  icon: ReactNode;
  hint?: ReactNode;
  videos: Video[];
  queue: Queue;
  seeAllHref?: string;
  progressFor?: (id: string) => number | null;
}) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLDivElement>(null);

  function scroll(direction: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    const rtl = getComputedStyle(row).direction === "rtl" ? -1 : 1;
    row.scrollBy({ left: direction * rtl * row.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <section aria-label={title}>
      <SectionTitle
        icon={icon}
        title={title}
        hint={hint}
        action={
          <>
            {seeAllHref && (
              <Link href={seeAllHref} className="btn btn-ghost btn-sm tap !text-accent-text">
                {t("watch.seeAll")}
              </Link>
            )}
            {videos.length > 3 && (
              <span className="hidden items-center gap-1 sm:flex">
                <button type="button" className="icon-btn tap-sq border border-line" aria-label={t("watch.scrollLeft")} onClick={() => scroll(-1)}>
                  <ChevronLeftIcon className="rtl:rotate-180" />
                </button>
                <button type="button" className="icon-btn tap-sq border border-line" aria-label={t("watch.scrollRight")} onClick={() => scroll(1)}>
                  <ChevronRightIcon className="rtl:rotate-180" />
                </button>
              </span>
            )}
          </>
        }
      />
      <div ref={rowRef} className="watch-shelf">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} queue={queue} progress={progressFor?.(v.id)} />
        ))}
      </div>
    </section>
  );
}
