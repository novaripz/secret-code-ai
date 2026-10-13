"use client";

import { authHeader, authReady, deviceHeader } from "@/lib/security/device";
import { filterEntries, type SearchFilters } from "@/lib/watch/query";
import type { FeedResult, SearchPage, Seed, Video, VideoLookup, WatchProblem } from "@/lib/watch/types";

// Every request Watch makes, with the same headers the chat sends.
//
// The headers are the point of this file. Without the device id every guest in
// a classroom looked like one caller, and without the sign-in token every
// student got the guest limit — so the only limit that ever applied was the
// per-address ceiling, which is sized for a whole class and let one tab spend
// the day's quota. Now each student is counted as themselves.

export class WatchFailure extends Error {
  constructor(
    readonly problem: WatchProblem,
    message: string,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  await authReady();
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...deviceHeader(), ...authHeader() },
    });
  } catch {
    // A thrown fetch is the network, not YouTube — the same shape of problem to
    // the student either way, so it lands in the same branch.
    throw new WatchFailure("failed", "");
  }
  const data = (await res.json().catch(() => ({}))) as { problem?: WatchProblem; error?: string; retryAfter?: number };
  if (!res.ok) {
    const problem = data.problem ?? (res.status === 429 ? "busy" : res.status === 401 ? "auth" : "failed");
    throw new WatchFailure(problem, data.error ?? "", typeof data.retryAfter === "number" ? data.retryAfter : null);
  }
  return data as T;
}

function query(pairs: [string, string | null | undefined][]): string {
  const params = new URLSearchParams();
  for (const [k, v] of pairs) if (v) params.set(k, v);
  return params.toString();
}

export const watchApi = {
  search(q: string, filters: SearchFilters, lang: string, page?: string | null) {
    return request<SearchPage>(`/api/watch?${query([["q", q], ...filterEntries(filters), ["lang", lang], ["page", page]])}`);
  },
  topic(id: string, lang: string, page?: string | null) {
    return request<SearchPage>(`/api/watch?${query([["topic", id], ["lang", lang], ["page", page]])}`);
  },
  video(id: string, lang: string) {
    return request<VideoLookup>(`/api/watch?${query([["v", id], ["lang", lang]])}`);
  },
  related(id: string, lang: string) {
    return request<{ videos: Video[] }>(`/api/watch?${query([["related", id], ["lang", lang]])}`);
  },
  feed(seeds: Seed[], lang: string) {
    return request<FeedResult>(`/api/watch?${query([["lang", lang]])}`, {
      method: "POST",
      body: JSON.stringify({ seeds }),
    });
  },
};
