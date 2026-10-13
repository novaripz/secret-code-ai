"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import type { SearchPage, Video } from "@/lib/watch/types";
import type { WatchFailure } from "./api";
import { Trouble } from "./Trouble";

// "Load more" for a search or a subject.
//
// Every search already fetched fifty results for the price of one, so the
// first few presses just show more of what is here. Only when those run out
// does Load more ask YouTube for the next page — which is another full search
// (100 units), and so is only ever done when a student explicitly asks.

export const PAGE_SIZE = 24;

export function usePaged(first: SearchPage | null, fetchPage: (token: string) => Promise<SearchPage>) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const [pages, setPages] = useState<SearchPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WatchFailure | null>(null);

  // Later pages can repeat a video from an earlier one; each shows once.
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: Video[] = [];
    for (const page of [first, ...pages]) {
      for (const v of page?.videos ?? []) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        out.push(v);
      }
    }
    return out;
  }, [first, pages]);
  const token = pages.length ? pages[pages.length - 1].nextPageToken : (first?.nextPageToken ?? null);
  const canMore = shown < all.length || Boolean(token);

  async function more() {
    setError(null);
    if (shown < all.length) {
      setShown((s) => s + PAGE_SIZE);
      return;
    }
    if (!token) return;
    setLoading(true);
    try {
      const page = await fetchPage(token);
      setPages((p) => [...p, page]);
      setShown((s) => s + PAGE_SIZE);
    } catch (err) {
      setError(err as WatchFailure);
    } finally {
      setLoading(false);
    }
  }

  return { videos: all.slice(0, shown), all, canMore, more, loading, error };
}

export function LoadMore({
  canMore,
  loading,
  error,
  onMore,
  doneText,
}: {
  canMore: boolean;
  loading: boolean;
  error: WatchFailure | null;
  onMore: () => void;
  doneText?: string;
}) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="mt-8">
        <Trouble failure={error} onRetry={onMore} compact />
      </div>
    );
  }
  if (!canMore) {
    return doneText ? <p className="mt-10 text-center text-[13px] text-ink-faint">{doneText}</p> : null;
  }
  return (
    <div className="mt-8 flex justify-center">
      <Button variant="secondary" pill loading={loading} onClick={onMore} icon={<ChevronDownIcon />} className="tap min-w-40">
        {t("watch.loadMore")}
      </Button>
    </div>
  );
}
