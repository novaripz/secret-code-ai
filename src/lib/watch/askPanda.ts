// "Ask Panda about this video", as a draft for the chat to pick up.
//
// The chat lives in another part of the app and keeps its composer in its own
// state, so Watch never reaches into it. Instead it leaves a draft in
// sessionStorage under a key the chat reads when it mounts, then navigates
// there. The student sees the whole message in the composer before anything
// is sent, which is also what keeps this honest: Panda cannot watch a video,
// and the draft says so in its own words rather than letting the student
// assume otherwise.

import { formatClock } from "./parse";

export const PENDING_DRAFT_KEY = "panda:pending-draft";

/** How much of the description travels along. Enough for context, not a wall. */
export const DESCRIPTION_BUDGET = 800;

export interface DraftSource {
  id: string;
  title: string;
  channel: string;
  description?: string | null;
  /** Where the student was, in seconds, if the player had started. */
  at?: number | null;
}

type Translate = (key: "watch.askPandaDraft" | "watch.askPandaDraftAt" | "watch.askPandaDraftDescription", vars?: Record<string, string | number>) => string;

/**
 * The message the chat composer is prefilled with. Written in the student's
 * interface language (through `t`) so it reads as theirs, and kept to plain
 * text so it survives any composer.
 */
export function buildDraft(source: DraftSource, t: Translate): string {
  const link = `https://www.youtube.com/watch?v=${source.id}`;
  const at = source.at && source.at >= 5 ? Math.floor(source.at) : null;

  const lines = [t("watch.askPandaDraft", { title: source.title, channel: source.channel || "?", link })];
  if (at !== null) lines.push(t("watch.askPandaDraftAt", { time: formatClock(at) }));

  const description = (source.description ?? "").replace(/\n{3,}/g, "\n\n").trim();
  if (description) {
    const clipped =
      description.length > DESCRIPTION_BUDGET
        ? `${description.slice(0, DESCRIPTION_BUDGET).replace(/\s+\S*$/, "")}…`
        : description;
    lines.push(t("watch.askPandaDraftDescription", { description: clipped }));
  }
  return lines.join("\n\n");
}

/** Leaves the draft where the chat will find it. False when storage is blocked. */
export function leaveDraft(text: string): boolean {
  try {
    sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify({ text, newThread: true }));
    return true;
  } catch {
    return false;
  }
}
