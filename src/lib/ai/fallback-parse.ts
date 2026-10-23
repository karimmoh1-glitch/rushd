import type { QuickAddDraft } from "./schemas";

export interface ClassRef {
  id: string;
  name: string;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const WEEKDAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const EXAM_KEYWORDS = /\b(exam|test|quiz|midterm|final)\b/i;

const EFFORT_RE =
  /~?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i;

const EXPLICIT_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\b/;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "Dec 12", "December 12th", "sept. 3". Needs the day number, so "may" alone stays a word.
const MONTH_DATE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive, because matches are often found in a lowercased copy of the text.
function stripMatch(text: string, match: string): string {
  return text
    .replace(new RegExp(escapeRegExp(match), "i"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(date.getDate() + days);
  return result;
}

// "due Friday" said on a Friday means today, not next week.
function nextWeekday(now: Date, targetDayOfWeek: number): Date {
  let daysAhead = targetDayOfWeek - now.getDay();
  if (daysAhead < 0) daysAhead += 7;
  return addDays(now, daysAhead);
}

function extractDate(text: string, now: Date): { date: Date | null; remaining: string } {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return { date: endOfDay(now), remaining: stripMatch(text, "today") };
  }
  if (/\btomorrow\b/.test(lower)) {
    return { date: endOfDay(addDays(now, 1)), remaining: stripMatch(text, "tomorrow") };
  }

  const explicit = text.match(EXPLICIT_DATE_RE);
  if (explicit) {
    const month = Number(explicit[1]) - 1;
    const day = Number(explicit[2]);
    let year = now.getFullYear();
    let candidate = new Date(year, month, day, 23, 59, 0, 0);
    if (candidate.getTime() < now.getTime()) {
      year += 1;
      candidate = new Date(year, month, day, 23, 59, 0, 0);
    }
    if (candidate.getMonth() === month && candidate.getDate() === day) {
      return { date: candidate, remaining: stripMatch(text, explicit[0]) };
    }
  }

  const relative = lower.match(/\bin (\d{1,2}) days?\b/);
  if (relative) {
    return { date: endOfDay(addDays(now, Number(relative[1]))), remaining: stripMatch(text, relative[0]) };
  }
  if (/\bnext week\b/.test(lower)) {
    return { date: endOfDay(addDays(now, 7)), remaining: stripMatch(text, "next week") };
  }

  const named = text.match(MONTH_DATE_RE);
  if (named) {
    const month = MONTHS.indexOf(named[1].toLowerCase().slice(0, 3));
    const day = Number(named[2]);
    let candidate = new Date(now.getFullYear(), month, day, 23, 59, 0, 0);
    // More than a day in the past means next year's date.
    const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    if (candidate.getTime() < oneDayAgo) {
      candidate = new Date(now.getFullYear() + 1, month, day, 23, 59, 0, 0);
    }
    if (candidate.getMonth() === month && candidate.getDate() === day) {
      return { date: candidate, remaining: stripMatch(text, named[0]) };
    }
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const full = WEEKDAYS[i];
    const abbr = WEEKDAY_ABBR[i];
    const re = new RegExp(`\\b(${full}|${abbr})\\b`, "i");
    const match = lower.match(re);
    if (match) {
      return { date: endOfDay(nextWeekday(now, i)), remaining: stripMatch(text, match[0]) };
    }
  }

  return { date: null, remaining: text };
}

function extractEffort(text: string): { minutes: number | null; remaining: string } {
  const match = text.match(EFFORT_RE);
  if (!match) return { minutes: null, remaining: text };

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const isHours = unit.startsWith("h");
  const minutes = Math.round(isHours ? value * 60 : value);

  return { minutes, remaining: stripMatch(text, match[0]) };
}

function extractClass(
  text: string,
  classes: ClassRef[],
): { classId: string | null; remaining: string } {
  const lower = text.toLowerCase();

  for (const c of classes) {
    if (lower.includes(c.name.toLowerCase())) {
      return { classId: c.id, remaining: stripMatch(text, c.name) };
    }
  }

  // Loose match: any 4+ letter word of a class name (so "AP" or "of" don't match).
  for (const c of classes) {
    const words = c.name.split(/\s+/).filter((w) => w.length >= 4);
    for (const word of words) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      const match = text.match(re);
      if (match) {
        return { classId: c.id, remaining: stripMatch(text, match[0]) };
      }
    }
  }

  return { classId: null, remaining: text };
}

function cleanTitle(text: string, original: string, kind: "assignment" | "exam"): string {
  const cleaned = text
    .replace(/\bdue\b/gi, "")
    .replace(/[,\-:]+$/g, "")
    .replace(/^[,\-:]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  let title = cleaned;
  if (title.length === 0) title = original.trim();
  if (title.length === 0) title = `New ${kind}`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Regex-based quick-add parser, used when AI is off or fails. Never throws:
 * at worst the title is the raw text and everything else is a default. */
export function fallbackParseQuickAdd(
  rawText: string,
  classes: ClassRef[],
  now: Date,
): QuickAddDraft {
  const text = rawText.trim();
  const kind: "assignment" | "exam" = EXAM_KEYWORDS.test(text) ? "exam" : "assignment";
  const defaultMinutes = kind === "exam" ? 120 : 30;

  const { date, remaining: afterDate } = extractDate(text, now);
  const { minutes, remaining: afterEffort } = extractEffort(afterDate);
  const { classId, remaining: afterClass } = extractClass(afterEffort, classes);

  const title = cleanTitle(afterClass, text, kind);

  return {
    kind,
    title,
    classId,
    dueAt: date ? date.toISOString() : null,
    minutes: minutes ?? defaultMinutes,
    priority: "MEDIUM",
  };
}
