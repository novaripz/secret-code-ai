"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LockIcon, SearchIcon, SparkleIcon, XIcon } from "@/components/icons";
import { Player } from "@/components/watch/Player";
import { VideoGrid, VideoGridSkeleton } from "@/components/watch/VideoGrid";
import { STARTER_SEEDS, deriveSeeds, toVideo, useWatchStore } from "@/store/useWatchStore";
import type { Seed, Video, WatchProblem } from "@/app/api/watch/route";

// Watch: two lists and a player, and nothing that leads out of Panda.
//
// The page is split in two because a student arrives here for one of exactly
// two reasons — "show me something" or "take me back to that thing" — and
// those want different answers. Feed is a live call to YouTube and can fail;
// Saved is read out of IndexedDB and cannot, which is why the two are separate
// tabs rather than one list with a filter: when the key is missing or the
// quota is gone, Saved still works, and the page can say so.
//
// The feed is deliberately not re-fetched every time someone saves something.
// Each feed costs three YouTube searches, and a grid that reshuffles under the
// hand that just clicked Save is disorienting besides. Instead the page
// notices its seeds have gone stale and offers to rebuild — the student
// decides when the ground moves.

type Tab = "feed" | "saved";

/** Enough to tell two seed sets apart without caring about their order. */
function seedKey(seeds: Seed[]): string {
  return seeds.map((s) => s.term.toLowerCase()).sort().join("|");
}

export default function WatchPage() {
  const { saved, hydrated, hydrate, save, remove } = useWatchStore();

  const [tab, setTab] = useState<Tab>("feed");
  const [playing, setPlaying] = useState<Video | null>(null);

  const [feed, setFeed] = useState<Video[] | null>(null);
  const [feedSeeds, setFeedSeeds] = useState<Seed[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Video[] | null>(null);
  const [searched, setSearched] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [trouble, setTrouble] = useState<{ problem: WatchProblem; message: string } | null>(null);

  // Saves live in the store, but the card needs a synchronous yes/no per
  // render, so read the list rather than calling the store's isSaved — that
  // one is a getter and wouldn't re-render the grid when the list changes.
  const savedIds = useMemo(() => new Set(saved.map((v) => v.id)), [saved]);
  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  const seeds = useMemo(() => {
    const derived = deriveSeeds(saved);
    return derived.length ? derived : STARTER_SEEDS;
  }, [saved]);

  // Read the seeds out of a ref inside the loader, so loading the feed doesn't
  // become a dependency of every save the student makes.
  const seedsRef = useRef(seeds);
  seedsRef.current = seeds;

  const loadFeed = useCallback(async () => {
    const using = seedsRef.current;
    setLoading(true);
    setTrouble(null);
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds: using }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTrouble({ problem: data.problem ?? "failed", message: data.error ?? "" });
        setFeed([]);
      } else {
        setFeed(data.videos ?? []);
        setFeedSeeds(data.seeds ?? using);
      }
      setLoadedKey(seedKey(using));
    } catch {
      // A thrown fetch is the network, not YouTube — same shape of problem to
      // the student either way, so it lands in the same branch.
      setTrouble({ problem: "failed", message: "" });
      setFeed([]);
      setLoadedKey(seedKey(using));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Wait for the store before the first feed: asking YouTube for the starter
  // seeds and then immediately asking again for the real ones would spend
  // six searches to show one grid.
  useEffect(() => {
    if (hydrated && feed === null && !loading) void loadFeed();
  }, [hydrated, feed, loading, loadFeed]);

  async function runSearch(q: string) {
    setLoading(true);
    setTrouble(null);
    try {
      const res = await fetch(`/api/watch?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setTrouble({ problem: data.problem ?? "failed", message: data.error ?? "" });
        setResults([]);
      } else {
        setResults(data.videos ?? []);
      }
      setSearched(q);
    } catch {
      setTrouble({ problem: "failed", message: "" });
      setResults([]);
      setSearched(q);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setResults(null);
    setSearched(null);
    setQuery("");
    setTrouble(null);
  }

  function openTab(next: Tab) {
    setTab(next);
    // Saved can't fail, so carrying a YouTube problem across to it would be a
    // warning about nothing.
    if (next === "saved") setTrouble(null);
  }

  const stale = loadedKey !== null && loadedKey !== seedKey(seeds) && results === null;
  const savedVideos = useMemo(() => saved.map(toVideo), [saved]);

  const showing = tab === "saved" ? savedVideos : results ?? feed ?? [];
  const busy = loading && tab === "feed";

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
          <div role="tablist" aria-label="Watch" className="flex items-center gap-1">
            <TabButton current={tab} value="feed" onSelect={openTab}>
              Feed
            </TabButton>
            <TabButton current={tab} value="saved" onSelect={openTab}>
              Saved{saved.length > 0 && <span className="ml-1 tabular-nums opacity-60">{saved.length}</span>}
            </TabButton>
          </div>

          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--success)]">
            <LockIcon className="h-3 w-3" />
            Locked to Panda
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5">
            {playing && (
              <Player
                video={playing}
                saved={isSaved(playing.id)}
                onSave={(v) => void save(v)}
                onRemove={(id) => void remove(id)}
                onClose={() => setPlaying(null)}
              />
            )}

            {tab === "feed" && (
              <form
                className="mb-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = query.trim();
                  if (q) void runSearch(q);
                }}
              >
                <div className="flex items-center gap-2.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-1)] px-4 py-2.5 focus-within:border-[var(--focus)]">
                  <SearchIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search videos"
                    placeholder="Search videos"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                  />
                  {searched && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      aria-label="Clear the search and go back to the feed"
                      title="Back to the feed"
                      className="shrink-0 rounded-full p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </form>
            )}

            {tab === "feed" && !trouble && (
              searched ? (
                <p className="mb-4 text-[13px] text-[var(--text-dim)]">
                  Results for <span className="text-[var(--text)]">“{searched}”</span>
                </p>
              ) : (
                <Reasoning seeds={feedSeeds} personal={saved.length > 0} stale={stale} onRefresh={() => void loadFeed()} />
              )
            )}

            {tab === "feed" && trouble && (
              <Trouble
                problem={trouble.problem}
                message={trouble.message}
                savedCount={saved.length}
                onRetry={() => (searched ? void runSearch(searched) : void loadFeed())}
                onOpenSaved={() => openTab("saved")}
              />
            )}

            {busy && showing.length === 0 && !trouble ? (
              <VideoGridSkeleton />
            ) : showing.length > 0 ? (
              <VideoGrid
                videos={showing}
                isSaved={isSaved}
                onPlay={(v) => setPlaying(v)}
                onSave={(v) => void save(v)}
                onRemove={(id) => void remove(id)}
                action={tab === "saved" ? "remove" : "save"}
                playingId={playing?.id ?? null}
              />
            ) : (
              <Empty tab={tab} searched={searched} trouble={Boolean(trouble)} hydrated={hydrated} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(value)}
      className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-[var(--surface-2)] font-medium text-[var(--text)]"
          : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Where the feed came from, in the same words the store used to build it.
 *
 * The cards each carry their own reason, but a student scanning a grid sees
 * the whole of it before they see any one card, so the rule gets stated once
 * at the top too. When nothing is saved this says so plainly rather than
 * letting three generic study searches pass for personalisation.
 */
function Reasoning({
  seeds,
  personal,
  stale,
  onRefresh,
}: {
  seeds: Seed[] | null;
  personal: boolean;
  stale: boolean;
  onRefresh: () => void;
}) {
  if (!seeds?.length) return null;

  return (
    <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--surface-0)] px-4 py-3">
      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-dim)]">
        <SparkleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
        <span>
          {personal
            ? "Built by searching YouTube for the channels and words that come up in what you've saved. It's keyword matching, not a model of your taste."
            : "Nothing saved yet, so this is a plain search for study videos. Save something and the feed starts following it."}
        </span>
      </p>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {seeds.map((seed) => (
          <li
            key={seed.term}
            className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--text-faint)]"
          >
            {seed.because}
          </li>
        ))}
      </ul>

      {stale && (
        <button
          onClick={onRefresh}
          className="mt-3 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-[12px] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          What you save has changed — rebuild the feed
        </button>
      )}
    </div>
  );
}

/**
 * Four failures, four different next steps, none of which is "try again"
 * unless trying again might actually work.
 *
 * The route already writes a full explanation for three of them, so those are
 * printed as sent rather than paraphrased here into something less true. What
 * this adds is the part only the page knows: whether there are saved videos to
 * fall back on, since every one of these still plays.
 */
function Trouble({
  problem,
  message,
  savedCount,
  onRetry,
  onOpenSaved,
}: {
  problem: WatchProblem;
  message: string;
  savedCount: number;
  onRetry: () => void;
  onOpenSaved: () => void;
}) {
  const headline: Record<WatchProblem, string> = {
    "missing-key": "Watch isn't switched on yet",
    quota: "YouTube is done answering for today",
    "wrong-key": "YouTube won't accept the key this copy is using",
    failed: "Couldn't reach YouTube",
  };

  const fallback: Record<WatchProblem, string> = {
    "missing-key": "Someone needs to add a YOUTUBE_API_KEY to this copy of Panda.",
    quota: "The daily limit resets at midnight Pacific time.",
    "wrong-key": "The key needs YouTube Data API v3 enabled on its project.",
    failed: "It might be the connection, or YouTube having a moment. Nothing is broken on your side.",
  };

  // Quota and a dropped connection both come back on their own; a missing or
  // wrong key never will, and a retry button there just teaches them the
  // button is a lie.
  const retryable = problem === "quota" || problem === "failed";

  return (
    <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] px-5 py-4">
      <p className="text-[14px] font-medium text-[var(--text)]">{headline[problem]}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-dim)]">{message || fallback[problem]}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {retryable && (
          <button
            onClick={onRetry}
            className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-[12px] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            Try again
          </button>
        )}
        {savedCount > 0 && (
          <button
            onClick={onOpenSaved}
            className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-[12px] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            {savedCount === 1 ? "Your 1 saved video still plays" : `Your ${savedCount} saved videos still play`}
          </button>
        )}
      </div>
    </div>
  );
}

/** The blank states, worded so none of them reads as something going wrong. */
function Empty({
  tab,
  searched,
  trouble,
  hydrated,
}: {
  tab: Tab;
  searched: string | null;
  trouble: boolean;
  hydrated: boolean;
}) {
  if (tab === "saved" && !hydrated) {
    return <p className="py-10 text-center text-[13px] text-[var(--text-faint)]">Looking up what you saved…</p>;
  }

  const line =
    tab === "saved"
      ? "Nothing saved yet. The Save button on any video puts it here, and it stays on this laptop."
      : trouble
        ? "Saved videos still play while this is sorted out."
        : searched
          ? `Nothing came back for “${searched}”. Fewer words usually finds more.`
          : "Nothing to show yet.";

  return (
    <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
      <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">{line}</p>
    </div>
  );
}
