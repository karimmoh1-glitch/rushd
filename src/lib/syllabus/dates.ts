import { addDaysToKey, dayOfWeekForKey, diffDateKeys, toDateKey } from "@/lib/time/zone";
import type { Confidence } from "./types";

// Date reading for syllabi, without AI. Finds the dates a syllabus writes in
// the usual ways ("Oct 14", "October 14th, 2026", "10/14", "10/14/26",
// "2026-10-14", "14 Oct", ranges like "Oct 14–16" or "9/8 - 9/12", "Week 3",
// weekdays, times, "TBA"), then turns them into calendar days using only what
// the syllabus or the student's course settings say. Anything it has to
// assume (a missing year, a week without a day) comes back as an issue.

export interface MonthDay {
  month: number; // 1-12
  day: number;
  year: number | null; // only when written
}

export type DateToken =
  | { kind: "date"; value: MonthDay; numeric: boolean; raw: string; index: number; end: number }
  | { kind: "range"; start: MonthDay; finish: MonthDay; numeric: boolean; raw: string; index: number; end: number }
  | { kind: "week"; week: number; lastWeek: number | null; raw: string; index: number; end: number }
  | { kind: "tba"; reason: "tba" | "finals"; raw: string; index: number; end: number }
  | { kind: "weekday"; dow: number; raw: string; index: number; end: number }
  | { kind: "time"; minutes: number; raw: string; index: number; end: number };

const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const ORD = "(?:st|nd|rd|th)?";
const DASH = "\\s*(?:[-–—]|to|through|thru)\\s*";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const RE = {
  iso: /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
  mdRange: new RegExp(`\\b${MON}\\s+(\\d{1,2})${ORD}${DASH}(?:${MON}\\s+)?(\\d{1,2})${ORD}\\b(?:,?\\s+(\\d{4}))?`, "gi"),
  md: new RegExp(`\\b${MON}\\s+(\\d{1,2})${ORD}\\b(?:,?\\s+(\\d{4})\\b)?`, "gi"),
  dm: new RegExp(`\\b(\\d{1,2})${ORD}\\s+${MON}\\b(?:,?\\s+(\\d{4})\\b)?`, "gi"),
  numRange: /(?<![\d/.])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\s*[-–—]\s*(?:(\d{1,2})\/)?(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g,
  num: /(?<![\d/.])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/%])/g,
  week: /\b(?:weeks?|wk)\.?\s*#?\s*(\d{1,2})(?:\s*(?:[-–—&]|and|to)\s*(\d{1,2}))?\b/gi,
  tba: /\b(?:TBA|TBD|to be (?:announced|determined|scheduled|confirmed))\b/gi,
  finals: /\b(?:finals?|exam)\s+(?:week|period)\b|\bduring finals\b/gi,
  weekday: /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?/gi,
  time12: /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi,
  timeWord: /\b(noon|midnight)\b/gi,
  time24: /(?<![\d/:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g,
};

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase().slice(0, 3)) + 1;
}

function fullYear(text: string | undefined): number | null {
  if (!text) return null;
  const n = Number(text);
  if (text.length === 2) return 2000 + n;
  return n;
}

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function validMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** A range must run forward (a December–January range wraps the year). */
function forwardRange(start: MonthDay, finish: MonthDay): boolean {
  if (!validMonthDay(start.month, start.day) || !validMonthDay(finish.month, finish.day)) return false;
  if (start.month === 12 && finish.month === 1) return true;
  return finish.month > start.month || (finish.month === start.month && finish.day > start.day);
}

/** Every date-like token in a line, earliest first, without overlaps. */
export function findDateTokens(text: string): DateToken[] {
  const found: DateToken[] = [];
  const taken: [number, number][] = [];
  const free = (index: number, end: number) => taken.every(([a, b]) => end <= a || index >= b);
  const add = (token: DateToken) => {
    if (!free(token.index, token.end)) return;
    taken.push([token.index, token.end]);
    found.push(token);
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) fn(m);
  };
  const span = (m: RegExpExecArray) => ({ raw: m[0].trim(), index: m.index, end: m.index + m[0].length });

  each(RE.iso, (m) => {
    const value = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
    if (validMonthDay(value.month, value.day)) add({ kind: "date", value, numeric: true, ...span(m) });
  });
  each(RE.mdRange, (m) => {
    const startMonth = monthIndex(m[1]);
    const finishMonth = m[3] ? monthIndex(m[3]) : startMonth;
    const year = fullYear(m[5]);
    const start = { month: startMonth, day: Number(m[2]), year };
    const finish = { month: finishMonth, day: Number(m[4]), year };
    if (forwardRange(start, finish)) add({ kind: "range", start, finish, numeric: false, ...span(m) });
  });
  each(RE.md, (m) => {
    const value = { month: monthIndex(m[1]), day: Number(m[2]), year: fullYear(m[3]) };
    // "May" is also a word: only a date when a day number follows (the regex requires it).
    if (validMonthDay(value.month, value.day)) add({ kind: "date", value, numeric: false, ...span(m) });
  });
  each(RE.dm, (m) => {
    const value = { month: monthIndex(m[2]), day: Number(m[1]), year: fullYear(m[3]) };
    if (validMonthDay(value.month, value.day)) add({ kind: "date", value, numeric: false, ...span(m) });
  });
  each(RE.numRange, (m) => {
    const start = { month: Number(m[1]), day: Number(m[2]), year: fullYear(m[3]) };
    const finish = { month: m[4] ? Number(m[4]) : start.month, day: Number(m[5]), year: fullYear(m[6]) ?? start.year };
    if (forwardRange(start, finish)) add({ kind: "range", start, finish, numeric: true, ...span(m) });
  });
  each(RE.num, (m) => {
    const value = { month: Number(m[1]), day: Number(m[2]), year: fullYear(m[3]) };
    if (validMonthDay(value.month, value.day)) add({ kind: "date", value, numeric: true, ...span(m) });
  });
  each(RE.week, (m) => {
    const week = Number(m[1]);
    const lastWeek = m[2] ? Number(m[2]) : null;
    if (week >= 1 && week <= 60) add({ kind: "week", week, lastWeek: lastWeek && lastWeek > week ? lastWeek : null, ...span(m) });
  });
  each(RE.tba, (m) => add({ kind: "tba", reason: "tba", ...span(m) }));
  each(RE.finals, (m) => add({ kind: "tba", reason: "finals", ...span(m) }));
  each(RE.time12, (m) => {
    let hour = Number(m[1]);
    if (hour < 1 || hour > 12) return;
    const pm = m[3].toLowerCase().startsWith("p");
    if (hour === 12) hour = 0;
    add({ kind: "time", minutes: (hour + (pm ? 12 : 0)) * 60 + Number(m[2] ?? 0), ...span(m) });
  });
  each(RE.timeWord, (m) => add({ kind: "time", minutes: m[1].toLowerCase() === "noon" ? 720 : 23 * 60 + 59, ...span(m) }));
  each(RE.time24, (m) => add({ kind: "time", minutes: Number(m[1]) * 60 + Number(m[2]), ...span(m) }));
  each(RE.weekday, (m) => {
    // "SAT" in capitals is the test, not Saturday.
    if (m[1] === "SAT" || m[1] === "SUN") return;
    add({ kind: "weekday", dow: DOW[m[1].toLowerCase().slice(0, 3)], ...span(m) });
  });

  return found.sort((a, b) => a.index - b.index);
}

export interface YearContext {
  termStart: string | null;
  termEnd: string | null;
  /** Where the term dates came from. */
  termSource: "course" | "syllabus" | null;
  /** A term the syllabus names, like "Fall 2026" or "2026–2027". */
  docTerm: { season: "fall" | "spring" | "summer" | "winter" | "year"; year: number } | null;
  /** Today in the student's calendar (YYYY-MM-DD). */
  today: string;
}

export interface ResolvedDate {
  date: string | null;
  confidence: Confidence;
  issues: string[];
}

function key(year: number, month: number, day: number): string | null {
  const k = toDateKey(year, month, day);
  // Rejects Feb 30 and friends: the key must round-trip.
  const d = new Date(`${k}T00:00:00Z`);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return k;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatKey(dateKey: string, withYear = false): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

/** Turns a month and day into a calendar day, saying how the year was chosen. */
export function resolveMonthDay(md: MonthDay, ctx: YearContext): ResolvedDate {
  if (md.year !== null) {
    const date = key(md.year, md.month, md.day);
    if (!date) return { date: null, confidence: "low", issues: ["That isn't a real calendar date — check it."] };
    return { date, confidence: "high", issues: [] };
  }

  if (ctx.termStart && ctx.termEnd) {
    const startYear = Number(ctx.termStart.slice(0, 4));
    const endYear = Number(ctx.termEnd.slice(0, 4));
    const candidates = [...new Set([startYear, endYear])];
    const lo = addDaysToKey(ctx.termStart, -21);
    const hi = addDaysToKey(ctx.termEnd, 28);
    for (const year of candidates) {
      const date = key(year, md.month, md.day);
      if (date && date >= lo && date <= hi) return { date, confidence: "high", issues: [] };
    }
    const date = key(startYear, md.month, md.day);
    if (!date) return { date: null, confidence: "low", issues: ["That isn't a real calendar date — check it."] };
    return {
      date,
      confidence: "low",
      issues: [`Falls outside the term (${formatKey(ctx.termStart)} – ${formatKey(ctx.termEnd)}). Check the date.`],
    };
  }

  if (ctx.docTerm) {
    const { season, year } = ctx.docTerm;
    let chosen = year;
    let consistent = true;
    if (season === "fall") {
      if (md.month <= 2) chosen = year + 1; // finals in early January
      consistent = md.month >= 8 || md.month <= 1;
    } else if (season === "spring") {
      consistent = md.month >= 1 && md.month <= 6;
    } else if (season === "summer") {
      consistent = md.month >= 5 && md.month <= 9;
    } else if (season === "winter") {
      consistent = md.month === 12 || md.month <= 3;
      if (md.month === 12) chosen = year - 1;
    } else if (season === "year") {
      chosen = md.month >= 7 ? year : year + 1;
    }
    const date = key(chosen, md.month, md.day);
    if (!date) return { date: null, confidence: "low", issues: ["That isn't a real calendar date — check it."] };
    if (!consistent) return { date, confidence: "low", issues: [`The year came from the term your syllabus names, but this month doesn't fit that term. Check the date.`] };
    return { date, confidence: "high", issues: [] };
  }

  // No year anywhere: the next time this date comes around (allowing for
  // recent past dates), flagged so the student checks it.
  const todayYear = Number(ctx.today.slice(0, 4));
  for (const year of [todayYear - 1, todayYear, todayYear + 1]) {
    const date = key(year, md.month, md.day);
    if (!date) continue;
    const offset = diffDateKeys(ctx.today, date);
    if (offset >= -60 && offset < 306) {
      return { date, confidence: "medium", issues: [`No year in your syllabus — assumed ${year}.`] };
    }
  }
  return { date: null, confidence: "low", issues: ["That isn't a real calendar date — check it."] };
}

/** Monday of the week containing `dateKey`. */
export function mondayOf(dateKey: string): string {
  const dow = dayOfWeekForKey(dateKey);
  return addDaysToKey(dateKey, dow === 0 ? -6 : 1 - dow);
}

/** The Monday–Friday span of "Week N", counted from the term start's week. */
export function weekSpan(termStart: string, week: number): { start: string; end: string } {
  const start = addDaysToKey(mondayOf(termStart), (week - 1) * 7);
  return { start, end: addDaysToKey(start, 4) };
}

/** A weekday inside a week span (Saturday/Sunday land after Friday). */
export function dayInWeek(weekStart: string, dow: number): string {
  return addDaysToKey(weekStart, dow === 0 ? 6 : dow - 1);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function dayName(dow: number): string {
  return DAY_NAMES[dow];
}

/** "HH:MM" for minutes after midnight. */
export function timeOfDay(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Finds a term the syllabus names: "Fall 2026", "Spring Semester 2027", "2026–2027". */
export function findDocTerm(text: string): YearContext["docTerm"] {
  const seasonal = text.match(/\b(fall|autumn|spring|summer|winter)\s+(?:semester\s+|term\s+|quarter\s+|session\s+)?(20\d{2})\b/i);
  if (seasonal) {
    const name = seasonal[1].toLowerCase();
    const season = name === "autumn" ? "fall" : (name as "fall" | "spring" | "summer" | "winter");
    return { season, year: Number(seasonal[2]) };
  }
  const span = text.match(/\b(20\d{2})\s*[-–—/]\s*(20)?(\d{2})\b/);
  if (span) {
    const first = Number(span[1]);
    const second = Number(`20${span[3]}`);
    if (second === first + 1) return { season: "year", year: first };
  }
  return null;
}
