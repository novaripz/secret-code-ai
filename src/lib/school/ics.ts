// Due dates as a calendar file.
//
// An `.ics` is the one format every calendar a student might have -- Google,
// Apple, Outlook, the one on their phone -- opens without an account, an API
// key or a sync to break. It is a snapshot, not a subscription: the file says
// so in its name and the button says so in its label, because a calendar that
// silently stops updating is worse than one that never claimed to.
//
// Written by hand to RFC 5545 because the subset needed is small: one VEVENT
// per open assignment, escaped text, folded lines, CRLF endings. A date-only
// deadline becomes an all-day event on its day; a timed one becomes a short
// event ending at the deadline, so it sits where "due at 8am" belongs.

import { addDays, isDateOnly, startOfDay } from "./due";
import type { Assignment, SchoolClass } from "./types";

/** Text values escape backslash, semicolon, comma and newline. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Lines longer than 75 octets are folded: CRLF then a single space. Octets,
 * not characters, so a line of accented or CJK text is folded where a parser
 * expects it, and never inside a multi-byte character.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      // Continuation lines start with a space, which counts towards the 75.
      limit = 74;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC timestamp form, `20261014T150000Z`. */
function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Local calendar date form, `20261014`, for all-day events. */
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export interface IcsOptions {
  now?: number;
  /** Shown before each title, e.g. "Due". Already translated by the caller. */
  prefix?: string;
}

/** Open assignments with a deadline, as one calendar. Done work is left out. */
export function buildIcs(assignments: Assignment[], classes: SchoolClass[], { now = Date.now(), prefix = "Due" }: IcsOptions = {}): string {
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Panda//School planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  const due = assignments
    .filter((a) => a.status !== "done" && a.dueAt !== null)
    .sort((a, b) => (a.dueAt as number) - (b.dueAt as number));

  for (const a of due) {
    const at = a.dueAt as number;
    const className = names.get(a.classId);
    const summary = `${prefix}: ${a.title}${className ? ` (${className})` : ""}`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${a.id}@panda.school`);
    lines.push(`DTSTAMP:${utcStamp(now)}`);
    if (isDateOnly(at)) {
      const day = startOfDay(at);
      lines.push(`DTSTART;VALUE=DATE:${localDate(day)}`);
      lines.push(`DTEND;VALUE=DATE:${localDate(addDays(day, 1))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(at - 15 * 60_000)}`);
      lines.push(`DTEND:${utcStamp(at)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (a.instructions) lines.push(`DESCRIPTION:${escapeIcsText(a.instructions.slice(0, 1000))}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
