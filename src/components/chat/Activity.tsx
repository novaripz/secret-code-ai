"use client";

// What Panda is doing, while it is doing it.
//
// The gap between pressing send and the first word is the one moment the app
// has nothing to say, and three bouncing dots say nothing — a student cannot
// tell a model that is composing an answer from one that has gone out to the
// web and back, or from a screen that has simply frozen. The server already
// distinguishes those; this draws the distinction.
//
// Two rules shape everything below.
//
// It only ever reports what the server actually sent. There is no "almost
// done", no fake progress bar, no phase this file invents to make the wait
// feel shorter. A status line that guesses is worse than none, because the
// student learns to stop believing it.
//
// And it is announced rather than merely drawn: `role="status"` with
// aria-live="polite" means a screen reader hears "Searching the web for
// photosynthesis" at the moment it becomes true, and waits its turn instead of
// interrupting. The dot is decorative and is hidden from that announcement.

import { useI18n } from "@/lib/i18n";
import type { Phase, Source } from "./frames";

/** The live state, or null when there is nothing being done. */
export interface ActivityState {
  phase: Phase;
  query?: string;
  count?: number;
  reason?: string;
}

export function Activity({ state }: { state: ActivityState | null }) {
  const { t } = useI18n();
  if (!state) return null;

  const label = describe(state, t);

  return (
    <div
      role="status"
      aria-live="polite"
      // The label is the accessible name as well as the visible text, so a
      // screen reader hears one sentence rather than the sentence twice.
      className="flex items-start gap-2.5 text-[13px] font-medium leading-5 text-[var(--text-dim)]"
    >
      {/* Top-aligned rather than centred: a long query wraps to two or three
          lines on a phone, and a dot floating beside the middle of that block
          reads as unrelated to the sentence it belongs to. */}
      <span aria-hidden="true" className="activity-dot mt-1.5 h-2 w-2 shrink-0 rounded-full bg-current" />
      <span className="min-w-0">
        {label}
        {/* The query is the most useful part of the whole indicator: seeing
            WHAT Panda searched is how a student judges whether the answer is
            about to be relevant. Quoted and dimmed so it reads as the
            student's words being used, not as Panda's prose. */}
        {state.query ? (
          <span className="ml-1 break-words font-normal text-[var(--text-faint)]">
            &ldquo;{state.query}&rdquo;
          </span>
        ) : null}
      </span>
    </div>
  );
}

function describe(state: ActivityState, t: ReturnType<typeof useI18n>["t"]): string {
  switch (state.phase) {
    case "searching":
      // With a query the line runs into it ("Searching the web for
      // “photosynthesis”"); without one it has to be a complete
      // sentence on its own, so it is a separate string rather than the same
      // one left dangling.
      return state.query ? t("chat.statusSearchingFor") : t("chat.statusSearching");
    case "reading":
      // The count is real — the route puts the number of results on the frame
      // — so it is worth saying. Without one the sentence still stands.
      return typeof state.count === "number"
        ? t("chat.statusReadingCount", { count: state.count })
        : t("chat.statusReading");
    case "search_failed":
      // Not an error the student needs to act on: the answer is still coming,
      // just without the web. Saying which of the two happened matters,
      // because "busy" is worth retrying and "unavailable" is not.
      return state.reason === "rate-limited"
        ? t("chat.statusSearchBusy")
        : t("chat.statusSearchUnavailable");
    case "thinking":
    default:
      return t("chat.statusThinking");
  }
}

/**
 * Citations, under the reply, as links.
 *
 * The route sends these as structured data specifically so they never get
 * glued into the prose, and this keeps that promise: a real anchor with a
 * visible domain, so a student can see where a claim came from before they
 * click. `rel="noopener noreferrer"` because these URLs come from a search
 * index — nothing about them is trusted, and a new tab that can reach back
 * into this one through `window.opener` is a real hole.
 */
export function Sources({ items }: { items: Source[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[var(--line)] pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {t("chat.sourcesTitle")}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              // The label names the destination, because "read more" repeated
              // five times is useless to anyone listing the links on a page.
              aria-label={t("chat.sourceLink", { title: s.title, domain: domainOf(s.url) })}
              className="group flex items-baseline gap-2 rounded-md text-[13px] text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
            >
              <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{i + 1}.</span>
              <span className="min-w-0">
                <span className="font-medium underline decoration-[var(--line-strong)] underline-offset-2 group-hover:decoration-current">
                  {s.title}
                </span>
                <span className="ml-1.5 text-[var(--text-faint)]">{domainOf(s.url)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Host only, for the little grey hint beside each title. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // The parser already rejected anything that is not http(s), so this is
    // close to unreachable; falling back to the raw string still shows
    // something rather than throwing during a render.
    return url;
  }
}
