import { addDaysToKey } from "@/lib/time/zone";

// Study streak: days in a row (in the student's timezone) with at least one
// real study action. Every 7 days in a row earns a rest day (up to 2 saved);
// a missed day uses one up instead of breaking the streak. Today never
// breaks it, because there's still time.

export const STUDY_EVENTS = [
  "study_session_completed",
  "assignment_completed",
  "assessment_completed",
  "tutor_message",
  "draft_reviewed",
];
const MAX_REST_DAYS = 2;
const DAYS_PER_REST_DAY = 7;

type DayMark = "done" | "rest" | "missed" | "today";

export interface Streak {
  current: number;
  longest: number;
  restDays: number;
  todayDone: boolean;
  /** The last 7 days, oldest first: "done" | "rest" (a rest day was spent) | "missed" | "today". */
  week: DayMark[];
}

/** The earliest active day that isn't in the future, or null if there is none. */
function firstActiveDay(active: Set<string>, todayKey: string): string | null {
  let first: string | null = null;
  for (const day of active) {
    if (day > todayKey) continue;
    if (first === null || day < first) first = day;
  }
  return first;
}

export function computeStreak(activeDays: Iterable<string>, todayKey: string): Streak {
  const active = new Set(activeDays);
  const markByDay = new Map<string, DayMark>();
  let current = 0;
  let longest = 0;
  let restDays = 0;

  // Walk forward one day at a time from the first active day to today.
  const startDay = firstActiveDay(active, todayKey);
  if (startDay !== null) {
    for (let day = startDay; day <= todayKey; day = addDaysToKey(day, 1)) {
      if (active.has(day)) {
        current++;
        if (current % DAYS_PER_REST_DAY === 0) {
          restDays = Math.min(MAX_REST_DAYS, restDays + 1);
        }
        markByDay.set(day, "done");
      } else if (day === todayKey) {
        // Nothing yet today, but the day isn't over.
        break;
      } else if (current > 0 && restDays > 0) {
        restDays--;
        markByDay.set(day, "rest");
      } else {
        current = 0;
        restDays = 0;
        markByDay.set(day, "missed");
      }
      longest = Math.max(longest, current);
    }
  }

  const week: DayMark[] = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const day = addDaysToKey(todayKey, -daysAgo);
    if (day === todayKey) {
      week.push(active.has(day) ? "done" : "today");
    } else {
      week.push(markByDay.get(day) ?? "missed");
    }
  }

  return { current, longest, restDays, todayDone: active.has(todayKey), week };
}
