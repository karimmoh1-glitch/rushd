import {
  calendarDaysBetween,
  formatDateInZone,
  formatTimeInZone,
  localDateKey,
  resolveTimeZone,
} from "@/lib/time/zone";

// Every date/time a student sees is rendered in THEIR timezone (Profile.timezone),
// passed explicitly. Without it, server-rendered pages would show UTC (the
// host's clock) and the client would re-render in the device zone — wrong
// times and hydration mismatches. `timeZone` falls back to the runtime zone
// only for callers that genuinely don't know it.

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatDueDate(date: Date, timeZone?: string | null, now: Date = new Date()): string {
  const tz = resolveTimeZone(timeZone);
  const time = formatTimeInZone(date, tz);
  const days = calendarDaysBetween(date, now, tz);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  const sameYear = localDateKey(date, tz).slice(0, 4) === localDateKey(now, tz).slice(0, 4);
  const day = formatDateInZone(date, tz, {
    weekday: days > 1 && days < 7 ? "short" : undefined,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day}, ${time}`;
}

export function isOverdue(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

export function daysUntil(date: Date, timeZone?: string | null, now: Date = new Date()): number {
  return calendarDaysBetween(date, now, timeZone);
}

export function formatDaysUntil(date: Date, timeZone?: string | null, now: Date = new Date()): string {
  const days = daysUntil(date, timeZone, now);
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}
