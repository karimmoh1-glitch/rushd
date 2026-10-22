// Timezone-aware calendar math. Pure and dependency-free so it runs the same
// on the server (UTC on most hosts), in the browser, and in tests.
//
// Why this exists: the planner buckets work into the *student's* calendar
// days. A Pacific student's 11:59 PM Friday deadline is 06:59 UTC Saturday —
// bucketing it with the server's clock puts the deadline on the wrong day
// and lets work be scheduled after it. Every day-level decision goes through
// these helpers with an explicit IANA zone instead.
//
// A "date key" is a "YYYY-MM-DD" string naming a calendar day in a zone.
// Date-key arithmetic is done in UTC on the (y, m, d) triple, which has no
// DST edge cases — a calendar day is always exactly one key step.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
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

export function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  const parts = formatterFor(resolveTimeZone(timeZone)).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
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

function keyToUtcMs(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return Date.UTC(year, month - 1, day);
}

export function addDaysToKey(key: string, days: number): string {
  const d = new Date(keyToUtcMs(key) + days * 86_400_000);
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole calendar days from `fromKey` to `toKey` (negative if `toKey` is earlier). */
export function diffDateKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / 86_400_000);
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
 * The UTC instant at which the wall clock in `timeZone` reads
 * `dateKey` + `minuteOfDay`. Iterates once to absorb the zone's offset at
 * that moment (correct across DST changes; for a nonexistent spring-forward
 * time it resolves to the equivalent instant just after the gap).
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
    const p = zonedParts(new Date(guess), timeZone);
    const seenMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += wallMs - seenMs;
  }
  return new Date(guess);
}

// --- Display helpers (always pass the student's zone explicitly so the
// server render and the client hydrate agree). -------------------------------

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
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${period}`;
}
