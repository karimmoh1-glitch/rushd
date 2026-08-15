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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive: matches are often detected against a lowercased copy of
// the text (weekday names, keywords), but must still be stripped from the
// original-case text shown to the student.
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

function nextWeekday(now: Date, targetDow: number): Date {
  const currentDow = now.getDay();
  let diff = targetDow - currentDow;
  if (diff < 0) diff += 7;
  // "due Friday" said on Friday most naturally means today, not next week.
  const result = new Date(now);
  result.setDate(now.getDate() + diff);
  return result;
}

function extractDate(text: string, now: Date): { date: Date | null; remaining: string } {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return { date: endOfDay(now), remaining: stripMatch(text, "today") };
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    return { date: endOfDay(d), remaining: stripMatch(text, "tomorrow") };
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

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const full = WEEKDAYS[i];
    const abbr = WEEKDAY_ABBR[i];
    const re = new RegExp(`\\b(${full}|${abbr})\\b`, "i");
    const match = lower.match(re);
    if (match) {
      const date = nextWeekday(now, i);
      return { date: endOfDay(date), remaining: stripMatch(text, match[0]) };
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

  // Loose fallback: any word from a class name (4+ letters, so "AP"/"of"
  // etc. don't cause false positives) appearing in the text.
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

  const fallback = original.trim();
  const finalTitle =
    cleaned.length > 0 ? cleaned : fallback.length > 0 ? fallback : `New ${kind}`;
  return finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
}

/**
 * Deterministic, regex-based quick-add parser. Runs whenever AI isn't
 * configured (or the AI call fails) — see docs/ARCHITECTURE.md. Never
 * throws; always returns a usable draft, even if that just means "title is
 * the raw text and everything else is a default the student can edit."
 */
export function fallbackParseQuickAdd(
  rawText: string,
  classes: ClassRef[],
  now: Date,
): QuickAddDraft {
  const text = rawText.trim();
  const kind: "assignment" | "exam" = EXAM_KEYWORDS.test(text) ? "exam" : "assignment";

  const { date, remaining: afterDate } = extractDate(text, now);
  const { minutes, remaining: afterEffort } = extractEffort(afterDate);
  const { classId, remaining: afterClass } = extractClass(afterEffort, classes);

  const title = cleanTitle(afterClass, text, kind);

  return {
    kind,
    title,
    classId,
    dueAt: date ? date.toISOString() : null,
    minutes: minutes ?? (kind === "exam" ? 120 : 30),
    priority: "MEDIUM",
  };
}
