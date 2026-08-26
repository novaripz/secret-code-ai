"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LockIcon, SearchIcon } from "@/components/icons";
import type { Video } from "@/app/api/watch/route";

// Watch: find and play videos without leaving Pand-AI.
//
// youtube.com refuses to be framed, and framing it would hand over the whole
// site to wander around in anyway. So we search with the Data API and play
// through the embedded player. There is no route out to the open web from
// here — no related-video sidebar, no channel pages, no search box that isn't
// ours.

function Player({ video }: { video: Video }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-black">
        <iframe
          key={video.id}
          // modestbranding + rel=0 keep the player from advertising a way out.
          src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0&modestbranding=1`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-[var(--text)]">{video.title}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-faint)]">{video.channel}</p>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${video.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-[13px] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          Open on YouTube
        </a>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [active, setActive] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(q: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/watch?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load videos.");
        setVideos([]);
      } else {
        setVideos(data.videos ?? []);
        if (!active && data.videos?.length) setActive(data.videos[0]);
      }
    } catch {
      setError("Couldn't reach video search.");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }

  // Something to watch on arrival, rather than an empty screen. A fetch on
  // mount is what an effect is for; the lint rule below is aimed at derived
  // state, which this is not.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("study tips for high school");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <span className="text-[13px] text-[var(--text-faint)]">Watch</span>
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--success)]">
            <LockIcon className="h-3 w-3" />
            Locked to Pand-AI
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-5 lg:flex-row">
            <div className="min-w-0 flex-1">
              {active ? (
                <Player video={active} />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] text-sm text-[var(--text-faint)]">
                  {loading ? "Loading…" : "Search for something to watch"}
                </div>
              )}
            </div>

            <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) void load(query.trim());
                }}
              >
                <div className="flex items-center gap-2.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-1)] px-4 py-2.5 focus-within:border-[var(--focus)]">
                  <SearchIcon className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search videos"
                    className="flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                  />
                </div>
              </form>

              {error && (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-0)] p-4 text-[13px] leading-relaxed text-[var(--text-dim)]">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {videos?.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setActive(v)}
                    className={`flex gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-[var(--surface-2)] ${
                      active?.id === v.id ? "bg-[var(--surface-2)]" : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="h-[68px] w-[120px] shrink-0 rounded-lg object-cover"
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-[13px] font-medium leading-snug text-[var(--text)]">
                        {v.title}
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-[var(--text-faint)]">{v.channel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
