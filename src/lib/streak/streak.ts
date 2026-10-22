import { addDaysToKey, diffDateKeys } from "@/lib/time/zone";

// Study streak: consecutive days (in the student's time zone) with at least
// one real study action. Every 7 days in a row earns a rest day (up to 2
// banked); a missed day spends one instead of breaking the streak. Today
// never breaks it: there's still time.

export const STUDY_EVENTS = ["study_session_completed", "assignment_completed", "assessment_completed", "tutor_message", "draft_reviewed"];
export const MAX_REST_DAYS = 2;

export interface Streak {
  current: number;
  longest: number;
  restDays: number;
  todayDone: boolean;
  /** The last 7 days, oldest first: "done" | "rest" (a rest day was spent) | "missed" | "today". */
  week: ("done" | "rest" | "missed" | "today")[];
}

export function computeStreak(activeDays: Iterable<string>, todayKey: string): Streak {
  const active = new Set(activeDays);
  const sorted = [...active].filter((d) => d <= todayKey).sort();
  const status = new Map<string, "done" | "rest" | "missed">();
  let current = 0;
  let longest = 0;
  let restDays = 0;

  if (sorted.length) {
    for (let day = sorted[0]; day <= todayKey; day = addDaysToKey(day, 1)) {
      if (active.has(day)) {
        current++;
        if (current % 7 === 0) restDays = Math.min(MAX_REST_DAYS, restDays + 1);
        status.set(day, "done");
      } else if (day === todayKey) {
        break;
      } else if (current > 0 && restDays > 0) {
        restDays--;
        status.set(day, "rest");
      } else {
        current = 0;
        restDays = 0;
        status.set(day, "missed");
      }
      longest = Math.max(longest, current);
    }
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDaysToKey(todayKey, i - 6);
    if (day === todayKey) return active.has(day) ? "done" : "today";
    return status.get(day) ?? "missed";
  }) as Streak["week"];

  return { current, longest, restDays, todayDone: active.has(todayKey), week };
}

/** Days since a streak was last extended, for "you're about to lose it" nudges. */
export function daysSince(lastKey: string | null, todayKey: string): number | null {
  return lastKey ? diffDateKeys(lastKey, todayKey) : null;
}
