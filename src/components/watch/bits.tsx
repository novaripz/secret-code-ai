"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/primitives";
import { CheckIcon, PlayIcon, VideoIcon, XIcon } from "@/components/icons";
import type { Video } from "@/lib/watch/types";
import { channelHue, duration } from "./format";
import { dismissToast, useToast } from "./session";

// The small pieces every Watch view is built from.

/**
 * A thumbnail with the sizes YouTube offers as a srcset, so a phone's 2x
 * screen gets the 480px image instead of a blurry 320px one stretched to fit.
 */
export function Thumbnail({
  video,
  progress = null,
  playing = false,
  sizes = "(max-width: 640px) 100vw, 360px",
  className = "",
  eager = false,
}: {
  video: Video;
  progress?: number | null;
  playing?: boolean;
  sizes?: string;
  className?: string;
  eager?: boolean;
}) {
  const { t } = useI18n();
  const length = duration(video.seconds);
  const srcSet = [
    video.thumbnail && `${video.thumbnail} 320w`,
    video.thumbnailHigh && `${video.thumbnailHigh} 480w`,
    video.thumbnailMax && `${video.thumbnailMax} 1280w`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-ui bg-surface-2 ${className}`}>
      {video.thumbnail ? (
        // next/image would need every YouTube thumbnail host allow-listed in
        // next.config.ts, and these are already sized and cached by Google's
        // CDN, so there is nothing left for it to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail}
          srcSet={srcSet || undefined}
          sizes={srcSet ? sizes : undefined}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-faint">
          <VideoIcon className="h-7 w-7" />
        </div>
      )}

      {/* White on black over a photograph, in every theme, because the
          thumbnail underneath doesn't know which theme it's in. */}
      {length && !playing && (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums leading-none text-white">
          {length}
        </span>
      )}

      {playing && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 text-[12px] font-medium uppercase tracking-wide text-white">
          <PlayIcon className="h-3.5 w-3.5" />
          {t("watch.playing")}
        </span>
      )}

      {progress != null && progress > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 h-[3px] bg-white/35"
          role="img"
          aria-label={t("watch.watchedPercent", { percent: Math.round(progress * 100) })}
        >
          <div className="h-full bg-accent" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * A channel's face. The real avatar costs a channels.list call, so lists draw
 * an initial on a colour picked from the name instead — the same channel is
 * always the same colour, which is most of what an avatar is for at a glance.
 */
export function ChannelAvatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-surface-2 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `hsl(${channelHue(name)} 45% 42%)`,
      }}
    >
      {initial}
    </span>
  );
}

/** The thin bar across the top of the page while something newer loads. */
export function RefreshBar({ active }: { active: boolean }) {
  return <div className="watch-progress" data-active={active} aria-hidden="true" />;
}

/** A section heading: an icon tile, a title, a quiet line, and an action. */
export function SectionTitle({
  icon,
  title,
  hint,
  action,
  id,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3.5 flex items-end gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-sm bg-accent-soft text-accent-text [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={id} className="truncate text-[17px] font-semibold tracking-tight text-ink sm:text-[18px]">
            {title}
          </h2>
          {hint && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-faint">{hint}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

// --- Skeletons ------------------------------------------------------------------------

// Columns follow the space Watch actually has (a container query on its
// scroll area), not the window: the app sidebar takes a different share of
// the screen on every device, and a card stops being readable below ~240px.
export const GRID = "grid grid-cols-1 gap-x-4 gap-y-8 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 @[112rem]:grid-cols-5";

export function CardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-video w-full !rounded-ui" />
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-9 w-9 shrink-0 !rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-[64%]" />
          <Skeleton className="h-3 w-[40%]" />
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function RowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Skeleton className="aspect-video w-full shrink-0 !rounded-ui sm:w-[min(360px,40%)]" />
          <div className="flex-1 space-y-2.5 py-1">
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-3 w-[35%]" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-6 w-6 !rounded-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-3 w-[70%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CompactSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-2.5">
          <Skeleton className="aspect-video w-[168px] shrink-0 !rounded-ui-sm" />
          <div className="flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3.5 w-[92%]" />
            <Skeleton className="h-3.5 w-[60%]" />
            <Skeleton className="h-3 w-[45%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Toast ----------------------------------------------------------------------------

/** "Saved to Watch later · Undo", bottom centre, gone in a few seconds. */
export function ToastHost() {
  const toast = useToast();
  const { t } = useI18n();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      {toast && (
        <div
          key={toast.id}
          className="animate-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-ui border border-line bg-surface-3 py-2 pl-3.5 pr-2 text-[13.5px] text-ink shadow-ui-pop"
        >
          <CheckIcon className="h-4 w-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-ghost btn-sm tap !text-accent-text"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="icon-btn icon-btn-sm tap-sq" aria-label={t("watch.close")} onClick={dismissToast}>
            <XIcon />
          </button>
        </div>
      )}
    </div>
  );
}
