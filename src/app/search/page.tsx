"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SearchIcon } from "@/components/icons";
import type { SearchResult } from "@/app/api/search/route";

// Search that stays inside Panda: results render here and open in a reader
// pane rather than sending the student out to the open web.

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setSearched(q);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed.");
        setResults([]);
      } else {
        setResults(data.results ?? []);
      }
    } catch {
      setError("Couldn't reach search.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="mx-auto w-full max-w-3xl px-4 pt-8">
          <form onSubmit={run}>
            <div className="flex items-center gap-3 rounded-3xl border border-[var(--line-strong)] bg-[var(--surface-1)] px-5 py-3.5 focus-within:border-[var(--focus)]">
              <SearchIcon className="h-[18px] w-[18px] shrink-0 text-[var(--text-faint)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Look anything up"
                className="flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              />
            </div>
          </form>
          {results === null && !loading && (
            <p className="mt-3 text-center text-xs text-[var(--text-faint)]">
              Results open here in Panda.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {loading && <p className="text-sm text-[var(--text-faint)]">Searching…</p>}

            {error && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-0)] p-5">
                <p className="text-sm leading-relaxed text-[var(--text-dim)]">{error}</p>
              </div>
            )}

            {!loading && !error && results?.length === 0 && (
              <p className="text-sm text-[var(--text-faint)]">Nothing found for “{searched}”.</p>
            )}

            <div className="divide-y divide-[var(--line)]">
              {results?.map((r) => (
                <div key={r.link} className="animate-rise py-4">
                  <p className="mb-1 text-xs text-[var(--text-faint)]">{r.displayLink}</p>
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-medium text-[#a8c7fa] hover:underline"
                  >
                    {r.title}
                  </a>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-dim)]">{r.snippet}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
