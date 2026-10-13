// Quick-add: "bio lab fri 45m" into a class, a title, a day and a length.
//
// A student remembers homework at the bus stop, not at a form. Typing one line
// is the difference between it landing in the planner and it living on the
// back of their hand. So this reads the line the way they wrote it and pulls
// out the parts it is sure about; everything it is not sure about stays in the
// title, where the student can see it and fix it. Nothing is guessed silently:
// the result says which words became which field, and the UI previews that
// before anything is saved.
//
// Deliberately a handful of regular expressions rather than a date library.
// The vocabulary a student uses for homework is small -- today, tomorrow, a
// weekday, a date, "45m" -- and a parser this size can be read in one sitting
// and tested line by line. English words only, for now; the field still works
// in any language, it just takes the whole line as the title.

import { addDays, dateOnlyDue, startOfDay } from "./due";
import type { SchoolClass } from "./types";

export interface QuickAddResult {
  title: string;
  classId: string | null;
  dueAt: number | null;
  minutes?: number;
  points?: number;
  /** The words that became each field, for the preview chips. */
  matched: { class?: string; due?: string; minutes?: string; points?: string };
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** Words that only ever join a date or a class to the rest of the line. */
const CONNECTOR = "(?:due\\s+|by\\s+|on\\s+|for\\s+)?";

interface Cut {
  text: string;
}

/**
 * Finds a match, removes it from the working string, and returns it. `last`
 * takes the final occurrence instead of the first: the day usually ends the
 * line, and "sat prep tue" means Tuesday.
 */
function take(work: Cut, pattern: RegExp, last = false): RegExpExecArray | null {
  let match: RegExpExecArray | null = null;
  if (last) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (let m = global.exec(work.text); m; m = global.exec(work.text)) {
      match = m;
      // The leading \s is part of each match, so step back one to let the
      // next occurrence claim the space between them.
      global.lastIndex = m.index + Math.max(1, m[0].length - 1);
    }
  } else {
    match = pattern.exec(work.text);
  }
  if (!match) return null;
  work.text = `${work.text.slice(0, match.index)} ${work.text.slice(match.index + match[0].length)}`;
  return match;
}

function at(day: number, hours: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

/** 12-hour clock to 24, for "9am" and "9:30 pm". */
function to24(hours: number, meridiem: string | undefined): number {
  if (!meridiem) return hours;
  const pm = meridiem.toLowerCase().startsWith("p");
  if (hours === 12) return pm ? 12 : 0;
  return pm ? hours + 12 : hours;
}

/**
 * Which class a word names, if exactly one fits. A word matches a class when
 * it starts the class name or one of its words ("bio" → Biology, "hist" →
 * World History), or spells its initials ("wh"). Three letters at least for a
 * prefix, so "a" and "in" never claim a class; a tie names nobody.
 */
function matchClass(word: string, classes: Pick<SchoolClass, "id" | "name">[]): string | null {
  const w = word.toLowerCase().replace(/^#/, "");
  if (!/^[\p{L}\p{N}]+$/u.test(w)) return null;
  const explicit = word.startsWith("#");
  const scored: { id: string; score: number }[] = [];
  for (const c of classes) {
    const name = c.name.toLowerCase();
    const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const initials = words.map((x) => x[0]).join("");
    let score = 0;
    if (name === w) score = 4;
    else if (w.length >= 3 && name.startsWith(w)) score = 3;
    else if (w.length >= 3 && words.some((x) => x.startsWith(w))) score = 2;
    else if (w.length >= 2 && initials === w) score = 1;
    else if (explicit && name.includes(w)) score = 1;
    if (score > 0) scored.push({ id: c.id, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].id;
}

export function parseQuickAdd(
  input: string,
  classes: Pick<SchoolClass, "id" | "name">[],
  now = Date.now(),
): QuickAddResult | null {
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const work: Cut = { text: ` ${raw} ` };
  const matched: QuickAddResult["matched"] = {};
  const today = startOfDay(now);

  // ------------------------------------------------------------ duration
  let minutes: number | undefined;
  const hm =
    take(work, /\s(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?(?=\s)/i) ??
    take(work, /\s(\d+)h(\d{1,2})(?=\s)/i);
  if (hm) {
    minutes = Math.round(Number(hm[1]) * 60 + Number(hm[2]));
    matched.minutes = hm[0].trim();
  } else {
    const h = take(work, /\s(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?(?=\s)/i);
    if (h) {
      minutes = Math.round(Number(h[1]) * 60);
      matched.minutes = h[0].trim();
    } else {
      const m = take(work, /\s(\d+)\s*m(?:in(?:ute)?s?)?(?=\s)/i);
      if (m) {
        minutes = Number(m[1]);
        matched.minutes = m[0].trim();
      }
    }
  }
  if (minutes !== undefined && (minutes <= 0 || minutes > 24 * 60)) minutes = undefined;

  // -------------------------------------------------------------- points
  let points: number | undefined;
  const p = take(work, /\s(\d+(?:\.\d+)?)\s*(?:pts?|points?)(?=\s)/i);
  if (p) {
    points = Number(p[1]);
    matched.points = p[0].trim();
  }

  // ---------------------------------------------------------------- time
  let time: { h: number; m: number } | null = null;
  let timeText = "";
  const t12 = take(work, /\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i);
  if (t12 && Number(t12[1]) >= 1 && Number(t12[1]) <= 12) {
    time = { h: to24(Number(t12[1]), t12[3]), m: Number(t12[2] ?? 0) };
    timeText = t12[0].trim();
  } else {
    const t24 = take(work, /\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/);
    if (t24) {
      time = { h: Number(t24[1]), m: Number(t24[2]) };
      timeText = t24[0].trim();
    }
  }

  // ---------------------------------------------------------------- date
  let day: number | null = null;
  let dayText = "";
  const rel = take(work, new RegExp(`\\s${CONNECTOR}(today|tonight|tomorrow|tmrw|tmr|tmw)(?=\\s)`, "i"));
  if (rel) {
    const word = rel[1].toLowerCase();
    day = word === "today" || word === "tonight" ? today : addDays(today, 1);
    dayText = rel[0].trim();
  }
  if (day === null) {
    const inDays = take(work, new RegExp(`\\s${CONNECTOR}in\\s+(\\d{1,2})\\s+days?(?=\\s)`, "i"));
    if (inDays) {
      day = addDays(today, Number(inDays[1]));
      dayText = inDays[0].trim();
    }
  }
  if (day === null) {
    const names = Object.keys(WEEKDAYS).join("|");
    const wd = take(work, new RegExp(`\\s${CONNECTOR}(next\\s+)?(${names})\\.?(?=\\s)`, "i"), true);
    if (wd) {
      const target = WEEKDAYS[wd[2].toLowerCase()];
      // "fri" on a Friday is today: a student adding something "due fri" on
      // Friday morning means this afternoon, not a week away. "next fri" is
      // always the one after that.
      let diff = (target - new Date(today).getDay() + 7) % 7;
      if (wd[1]) diff += 7;
      day = addDays(today, diff);
      dayText = wd[0].trim();
    }
  }
  if (day === null) {
    const names = Object.keys(MONTHS).join("|");
    const md = take(work, new RegExp(`\\s${CONNECTOR}(${names})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, "i"));
    const dm = md ? null : take(work, new RegExp(`\\s${CONNECTOR}(\\d{1,2})(?:st|nd|rd|th)?\\s+(${names})[a-z]*\\.?(?=\\s)`, "i"));
    const numeric = md || dm ? null : take(work, new RegExp(`\\s${CONNECTOR}(\\d{1,2})/(\\d{1,2})(?=\\s)`));
    let month: number | null = null;
    let date: number | null = null;
    if (md) {
      // The alternation captures only the short name ("sep" out of
      // "september"); the rest of the word is eaten by `[a-z]*`.
      month = MONTHS[md[1].toLowerCase()];
      date = Number(md[2]);
      dayText = md[0].trim();
    } else if (dm) {
      month = MONTHS[dm[2].toLowerCase()];
      date = Number(dm[1]);
      dayText = dm[0].trim();
    } else if (numeric) {
      // Month first, the way US school calendars write it. A date that cannot
      // be month/day (a 13th month) is left in the title rather than flipped.
      month = Number(numeric[1]) - 1;
      date = Number(numeric[2]);
      dayText = numeric[0].trim();
    }
    if (month !== null && date !== null && month >= 0 && month <= 11 && date >= 1 && date <= 31) {
      const year = new Date(today).getFullYear();
      let candidate = new Date(year, month, date).getTime();
      // A date well in the past is next year's ("jan 5" typed in December);
      // a few weeks back is a late assignment being logged, and stays put.
      if (candidate < addDays(today, -60)) candidate = new Date(year + 1, month, date).getTime();
      if (new Date(candidate).getDate() === date) day = candidate;
    }
    if (day === null && dayText) {
      // It looked like a date and was not one; give the words back.
      work.text = `${work.text} ${dayText} `;
      dayText = "";
    }
  }

  let dueAt: number | null = null;
  if (day !== null && time) dueAt = at(day, time.h, time.m);
  else if (day !== null) dueAt = dateOnlyDue(day);
  else if (time) {
    // A time with no day is the next time that clock comes round.
    const todayAt = at(today, time.h, time.m);
    dueAt = todayAt > now ? todayAt : at(addDays(today, 1), time.h, time.m);
  }
  if (dueAt !== null) matched.due = [dayText, timeText].filter(Boolean).join(" ");

  // --------------------------------------------------------------- class
  let classId: string | null = null;
  const words = work.text.trim().split(/\s+/).filter(Boolean);
  // Never the only word left: "biology" on its own is a title, not a class
  // with nothing to do in it.
  if (words.length > 1) {
    for (let i = 0; i < words.length; i++) {
      const found = matchClass(words[i], classes);
      if (!found) continue;
      classId = found;
      matched.class = words[i];
      words.splice(i, 1);
      // "essay for english" -- the joining word goes with the class.
      if (i > 0 && /^(for|in)$/i.test(words[i - 1])) words.splice(i - 1, 1);
      break;
    }
  }

  // --------------------------------------------------------------- title
  let title = words
    .filter((w) => !/^(due|by)$/i.test(w))
    .join(" ")
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, "")
    .trim();
  if (title) title = title[0].toLocaleUpperCase() + title.slice(1);

  return { title, classId, dueAt, minutes, points, matched };
}
