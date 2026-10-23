// Timezone-aware calendar math that runs the same on the server, in the
// browser, and in tests.
//
// Why: the planner must use the *student's* calendar days. A Pacific
// student's 11:59 PM Friday deadline is 06:59 UTC Saturday, so using the
// server's clock would put it on the wrong day.
//
// A "date key" is a "YYYY-MM-DD" string naming a calendar day. Date-key math
// is done in UTC, which has no daylight-saving jumps, so one day is always
// exactly one step.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

// Creating formatters is slow, so we keep one per timezone.
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone to use when the caller didn't pass one: the runtime's own. */
export function resolveTimeZone(timeZone?: string | null): string {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  for (const part of parts) {
    if (part.type === type) return Number(part.value);
  }
  return 0;
}

/** The wall-clock year, month, day and time of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  const parts = formatterFor(resolveTimeZone(timeZone)).formatToParts(date);
  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    // Some engines write midnight as "24", so wrap it back to 0.
    hour: readPart(parts, "hour") % 24,
    minute: readPart(parts, "minute"),
    second: readPart(parts, "second"),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const pieces = key.split("-");
  return { year: Number(pieces[0]), month: Number(pieces[1]), day: Number(pieces[2]) };
}

/** The calendar day `date` falls on, in `timeZone`. */
export function localDateKey(date: Date, timeZone?: string | null): string {
  const p = zonedParts(date, timeZone);
  return toDateKey(p.year, p.month, p.day);
}

/** Minutes since local midnight for `date` in `timeZone` (0-1439). */
export function localMinuteOfDay(date: Date, timeZone?: string | null): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

const MS_PER_DAY = 86_400_000;

/** Midnight UTC on the given day, in milliseconds. */
function keyToUtcMs(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return Date.UTC(year, month - 1, day);
}

export function addDaysToKey(key: string, days: number): string {
  const date = new Date(keyToUtcMs(key) + days * MS_PER_DAY);
  return toDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole calendar days from `fromKey` to `toKey` (negative if `toKey` is earlier). */
export function diffDateKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / MS_PER_DAY);
}

/** 0 = Sunday .. 6 = Saturday, for a calendar day (zone-independent). */
export function dayOfWeekForKey(key: string): number {
  return new Date(keyToUtcMs(key)).getUTCDay();
}

/** Calendar days from `now`'s day to `date`'s day, both read in `timeZone`. */
export function calendarDaysBetween(
  date: Date,
  now: Date,
  timeZone?: string | null,
): number {
  return diffDateKeys(localDateKey(now, timeZone), localDateKey(date, timeZone));
}

/**
 * The real instant when the clock in `timeZone` shows `dateKey` at
 * `minuteOfDay`. We guess, see what the clock would show, and correct by the
 * difference (twice, so daylight-saving changes come out right). A time
 * skipped by spring-forward lands just after the gap.
 */
export function zonedTimeToUtc(
  dateKey: string,
  minuteOfDay: number,
  timeZone?: string | null,
): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const wallMs = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let guess = wallMs;
  for (let i = 0; i < 2; i++) {
    const shown = zonedParts(new Date(guess), timeZone);
    const shownMs = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    guess += wallMs - shownMs;
  }
  return new Date(guess);
}

// --- Display helpers. Always pass the student's zone, so the server render
// and the browser render show the same thing. --------------------------------

export function formatTimeInZone(date: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateInZone(
  date: Date,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    ...options,
  }).format(date);
}

/** "2026-10-25" -> a label like "Sun, Oct 25" with no zone shifting. */
export function formatDateKey(key: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(
    new Date(keyToUtcMs(key)),
  );
}

/** "3:05 PM" for a minute-of-day (no zone involved). */
export function formatMinuteOfDay(minute: number): string {
  const hour24 = Math.floor(minute / 60) % 24;
  const minutesPastHour = minute % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) {
    hour12 = 12;
  }
  return `${hour12}:${pad(minutesPastHour)} ${period}`;
}
