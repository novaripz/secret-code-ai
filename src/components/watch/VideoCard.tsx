"use client";

import type { Video } from "@/app/api/watch/route";
import { SparkleIcon, XIcon } from "@/components/icons";
import { BookmarkFilledIcon, BookmarkIcon } from "./icons";
import { age, duration, views } from "./format";

// One video, as a card.
//
// The thumbnail and the title are a single button, because they are a single
// idea — "play this" — and two tab stops for one action makes a keyboard user
// press Tab twice to get past every video on the page. Saving is the only
// other thing you can do to a card, so it is the only other control on it.
//
// Every number on the card is there to answer a question a student actually
// asks before committing eight minutes: how long is it, who made it, is anyone
// else watching it, and is it old enough to be teaching the old way.

interface VideoCardProps {
  video: Video;
  saved: boolean;
  onPlay: (video: Video) => void;
  onSave: (video: Video) => void;
  onRemove: (id: string) => void;
  /**
   * "save" toggles; "remove" is for the Saved tab, where the only thing the
   * button can do is take it off the list and should say so.
   */
  action: "save" | "remove";
  /** True while this video is the one playing, so the grid can mark it. */
  playing?: boolean;
}

export function VideoCard({ video, saved, onPlay, onSave, onRemove, action, playing }: VideoCardProps) {
  const length = duration(video.seconds);
  const watched = views(video.viewCount);
  const old = video.publishedAt ? age(video.publishedAt) : null;
  const meta = [watched, old].filter(Boolean).join(" · ");

  return (
    <article className="animate-rise flex flex-col">
      <button
        onClick={() => onPlay(video)}
        className="group block w-full rounded-xl text-left"
        aria-current={playing ? "true" : undefined}
      >
        <div
          className={`relative overflow-hidden rounded-xl border bg-[var(--surface-2)] transition-colors ${
            playing ? "border-[var(--text)]" : "border-[var(--line)] group-hover:border-[var(--line-strong)]"
          }`}
        >
          {video.thumbnail ? (
            // next/image would need every YouTube thumbnail host allow-listed in
            // next.config.ts, and these are already the right size and cached by
            // Google's CDN, so there is nothing left for it to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div className="aspect-video w-full" />
          )}

          {/* White on black over a photograph, in both themes, because the
              thumbnail underneath doesn't know which theme it's in. */}
          {length && (
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {length}
            </span>
          )}
          {playing && (
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
              Playing
            </span>
          )}
        </div>

        {/* Two lines and then an ellipsis: YouTube titles run to 100 characters
            and a card that grows to fit one breaks the row it sits in. */}
        <h3
          title={video.title}
          className="mt-2.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-[var(--text)] group-hover:underline group-hover:decoration-[var(--line-strong)] group-hover:underline-offset-2"
        >
          {video.title}
        </h3>
      </button>

      <div className="mt-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {video.channel && (
            <p className="truncate text-[12px] text-[var(--text-dim)]" title={video.channel}>
              {video.channel}
            </p>
          )}
          {meta && <p className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">{meta}</p>}
        </div>

        <SaveButton
          saved={saved}
          action={action}
          title={video.title}
          onSave={() => onSave(video)}
          onRemove={() => onRemove(video.id)}
        />
      </div>

      {video.because && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[var(--text-faint)]">
          <SparkleIcon className="mt-[1px] h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{video.because}</span>
        </p>
      )}
    </article>
  );
}

/**
 * The label is spelled out rather than left as a bare icon: this is the one
 * control the whole tab is built around, and a student shouldn't have to hover
 * a bookmark glyph to find out what it does.
 */
function SaveButton({
  saved,
  action,
  title,
  onSave,
  onRemove,
}: {
  saved: boolean;
  action: "save" | "remove";
  title: string;
  onSave: () => void;
  onRemove: () => void;
}) {
  if (action === "remove") {
    return (
      <button
        onClick={onRemove}
        aria-label={`Remove ${title} from saved`}
        title="Remove from saved"
        className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--text-faint)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
      >
        <XIcon className="h-3 w-3" />
        Remove
      </button>
    );
  }

  return (
    <button
      onClick={saved ? onRemove : onSave}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      title={saved ? "Saved — click to remove" : "Save this video"}
      className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
        saved
          ? "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)]"
          : "border-[var(--line)] text-[var(--text-faint)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
      }`}
    >
      {saved ? <BookmarkFilledIcon className="h-3 w-3" /> : <BookmarkIcon className="h-3 w-3" />}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
