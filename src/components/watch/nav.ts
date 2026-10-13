"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { buildDraft, leaveDraft } from "@/lib/watch/askPanda";
import { filterEntries, type SearchFilters, type TopicId } from "@/lib/watch/query";
import type { Video } from "@/lib/watch/types";
import { useWatchStore } from "@/store/useWatchStore";
import { watchUrl } from "./format";
import { markInternalNavigation, rememberVideos, setQueue, showToast, type Queue } from "./session";

// Where everything in Watch lives: the address bar.
//
//   /watch                     home
//   /watch?c=math              home, filtered to one subject chip
//   /watch?q=…&dur=&date=…     search results
//   /watch?v=ID                the watch page
//   /watch?list=later          the library (later | history | continue)
//
// Every move is a router.push, so Back goes where a student expects, a reload
// lands on the same thing, and a link to a video can be shared with a friend.

export type LibraryList = "later" | "history" | "continue";

export interface WatchLocation {
  v?: string | null;
  q?: string | null;
  filters?: SearchFilters;
  list?: LibraryList | null;
  c?: TopicId | null;
}

export function watchHref(at: WatchLocation = {}): string {
  const params = new URLSearchParams();
  if (at.v) params.set("v", at.v);
  else if (at.q) {
    params.set("q", at.q);
    for (const [k, v] of filterEntries(at.filters ?? {})) params.set(k, v);
  } else if (at.list) params.set("list", at.list);
  else if (at.c) params.set("c", at.c);
  const qs = params.toString();
  return qs ? `/watch?${qs}` : "/watch";
}

/**
 * Called on the way into a video, from any card. Leaves the list behind for
 * the watch page's Up next and remembers the card so the page draws at once.
 */
export function prepareOpen(video: Video, queue?: Queue) {
  if (queue) setQueue(queue);
  rememberVideos([video]);
  markInternalNavigation();
}

export function useWatchNav() {
  const router = useRouter();
  return useMemo(
    () => ({
      open(video: Video, queue?: Queue) {
        prepareOpen(video, queue);
        router.push(watchHref({ v: video.id }));
      },
      search(q: string, filters: SearchFilters = {}) {
        markInternalNavigation();
        router.push(watchHref({ q, filters }));
      },
      /** Filters are a refinement of the same search, so they replace rather than stack history. */
      refine(q: string, filters: SearchFilters) {
        router.replace(watchHref({ q, filters }), { scroll: false });
      },
      library(list: LibraryList = "later", replace = false) {
        markInternalNavigation();
        if (replace) router.replace(watchHref({ list }), { scroll: false });
        else router.push(watchHref({ list }));
      },
      home(c?: TopicId | null, replace = false) {
        markInternalNavigation();
        if (replace) router.replace(watchHref({ c }), { scroll: false });
        else router.push(watchHref({ c }));
      },
      back() {
        router.back();
      },
    }),
    [router],
  );
}

/** Watch later, Copy link and Ask Panda — the same three things from every card and the watch page. */
export function useVideoActions() {
  const { t } = useI18n();
  const router = useRouter();
  const toggleSaved = useWatchStore((s) => s.toggleSaved);

  return useMemo(
    () => ({
      async toggleLater(video: Video) {
        const result = await toggleSaved(video);
        showToast(t(result === "saved" ? "watch.toastSaved" : "watch.toastRemoved"), {
          label: t("watch.undo"),
          run: () => void toggleSaved(video),
        });
      },
      async copyLink(video: Video) {
        try {
          await navigator.clipboard.writeText(watchUrl(window.location.origin, video.id));
          showToast(t("watch.toastCopied"));
        } catch {
          showToast(t("watch.toastCopyFailed"));
        }
      },
      askPanda(video: Video, extra: { description?: string | null; at?: number | null } = {}) {
        const text = buildDraft(
          { id: video.id, title: video.title, channel: video.channel, description: extra.description ?? video.snippet, at: extra.at },
          t,
        );
        leaveDraft(text);
        router.push("/");
      },
    }),
    [t, router, toggleSaved],
  );
}
