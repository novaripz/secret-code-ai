"use client";

import type { Video } from "@/app/api/watch/route";
import { XIcon } from "@/components/icons";
import { BookmarkFilledIcon, BookmarkIcon } from "./icons";
import { age, duration, views } from "./format";

// The one iframe in the whole tab.
//
// A single video can be embedded where youtube.com itself cannot, and the
// nocookie host with rel=0 and modestbranding gives a player with no related
// videos, no search box and no channel link hanging off it. That is the whole
// reason the rest of Watch is built out of data instead of frames: this player
// is a video, not a door.
//
// There is deliberately no "open on YouTube" link. The header promises the tab
// is locked to Panda, and a link that hands them the open web makes that a lie.

interface PlayerProps {
  video: Video;
  saved: boolean;
  onSave: (video: Video) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function Player({ video, saved, onSave, onRemove, onClose }: PlayerProps) {
  const length = duration(video.seconds);
  const watched = views(video.viewCount);
  const old = video.publishedAt ? age(video.publishedAt) : null;
  const meta = [video.channel, watched, old, length].filter(Boolean).join(" · ");

  return (
    <section className="animate-rise mb-8" aria-label="Now playing">
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-black">
        <iframe
          key={video.id}
          src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0&modestbranding=1`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>

      <div className="mt-3.5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-[var(--text)]">
            {video.title}
          </h2>
          {meta && <p className="mt-1 text-[13px] text-[var(--text-faint)]">{meta}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => (saved ? onRemove(video.id) : onSave(video))}
            aria-pressed={saved}
            aria-label={saved ? "Remove this video from saved" : "Save this video"}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] transition-colors ${
              saved
                ? "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)]"
                : "border-[var(--line-strong)] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            }`}
          >
            {saved ? <BookmarkFilledIcon className="h-3.5 w-3.5" /> : <BookmarkIcon className="h-3.5 w-3.5" />}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={onClose}
            aria-label="Close the player"
            title="Close the player"
            className="rounded-xl border border-[var(--line-strong)] p-2 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
