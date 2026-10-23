import {
  calendarDaysBetween,
  formatDateInZone,
  formatTimeInZone,
  localDateKey,
  resolveTimeZone,
} from "@/lib/time/zone";

// Every date and time a student sees is shown in THEIR timezone, passed in
// explicitly. Otherwise the server would render UTC and the browser would
// re-render in the device zone: wrong times and hydration mismatches.

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  if (leftoverMinutes === 0) return `${hours}h`;
  return `${hours}h ${leftoverMinutes}m`;
}

export function formatDueDate(date: Date, timeZone?: string | null, now: Date = new Date()): string {
  const tz = resolveTimeZone(timeZone);
  const time = formatTimeInZone(date, tz);
  const days = calendarDaysBetween(date, now, tz);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;

  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  // Within the coming week, the weekday name helps ("Fri, Oct 23").
  if (days > 1 && days < 7) {
    options.weekday = "short";
  }
  const year = localDateKey(date, tz).slice(0, 4);
  const thisYear = localDateKey(now, tz).slice(0, 4);
  if (year !== thisYear) {
    options.year = "numeric";
  }
  const day = formatDateInZone(date, tz, options);
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

export type DueStatus = "overdue" | "today" | "soon" | "later";

/** How urgent a deadline is: past, today, within the next two days, or later. */
export function dueStatus(date: Date, timeZone?: string | null, now: Date = new Date()): DueStatus {
  if (date.getTime() < now.getTime()) return "overdue";
  const days = calendarDaysBetween(date, now, timeZone);
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  return "later";
}
