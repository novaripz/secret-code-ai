"use client";

import type { Video } from "@/app/api/watch/route";
import { VideoCard } from "./VideoCard";

// The grid itself, and the thing it shows while there is nothing to show.
//
// Column counts follow the card, not the breakpoint names: a video card stops
// being readable below about 240px, so the grid drops to one column on a phone
// and climbs to four only when there is room for four proper cards. Nothing
// here is fixed-width, which is what keeps it honest at 400px.

const COLUMNS = "grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

interface VideoGridProps {
  videos: Video[];
  isSaved: (id: string) => boolean;
  onPlay: (video: Video) => void;
  onSave: (video: Video) => void;
  onRemove: (id: string) => void;
  action: "save" | "remove";
  playingId?: string | null;
}

export function VideoGrid({ videos, isSaved, onPlay, onSave, onRemove, action, playingId }: VideoGridProps) {
  return (
    <div className={COLUMNS}>
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          saved={isSaved(video.id)}
          onPlay={onPlay}
          onSave={onSave}
          onRemove={onRemove}
          action={action}
          playing={playingId === video.id}
        />
      ))}
    </div>
  );
}

/**
 * Placeholders in the shape of the cards that are coming, so the page doesn't
 * jump when they land. Eight of them: enough to fill the fold on a laptop
 * without promising a screenful on a phone.
 */
export function VideoGridSkeleton() {
  return (
    <div className={COLUMNS} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-video w-full rounded-xl bg-[var(--surface-2)]" />
          <div className="mt-2.5 h-3 w-[92%] rounded bg-[var(--surface-2)]" />
          <div className="mt-1.5 h-3 w-[60%] rounded bg-[var(--surface-2)]" />
          <div className="mt-2.5 h-2.5 w-[40%] rounded bg-[var(--surface-2)]" />
        </div>
      ))}
    </div>
  );
}
