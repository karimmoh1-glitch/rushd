import { SCORING_WEIGHTS } from "./constants";
import { calendarDaysBetween } from "@/lib/time/zone";
import type { WorkItem, ScoredItem, ReasonCode } from "./types";

/** Whole calendar days between two instants, read in the student's
 * timezone (the runtime's zone when none is given), ignoring time-of-day.
 * Negative means `date` is in the past relative to `now`. */
export function calendarDaysUntil(date: Date, now: Date, timeZone?: string | null): number {
  return calendarDaysBetween(date, now, timeZone);
}

export function scoreItem(item: WorkItem, now: Date, timeZone?: string | null): ScoredItem {
  const w = SCORING_WEIGHTS;
  const daysUntil = calendarDaysUntil(item.dueAt, now, timeZone);
  const preciselyOverdue = item.dueAt.getTime() < now.getTime();

  const urgency = Math.max(0, w.urgencyMax - Math.max(0, daysUntil) * w.urgencyPerDay);

  const importance =
    w.priorityWeight[item.priority] +
    w.priorityWeight[item.classPriority] * w.classPriorityMultiplier;

  const overdue = preciselyOverdue
    ? Math.min(
        w.overdueCap,
        w.overdueBase + Math.max(0, -daysUntil) * w.overduePerDay,
      )
    : 0;

  const examProximity =
    item.kind === "exam" && daysUntil >= 0 && daysUntil <= w.examProximityWindowDays
      ? (w.examProximityWindowDays - daysUntil) * w.examProximityPerDay
      : 0;

  const effortTiebreak = Math.max(
    0,
    Math.min(
      w.effortTiebreakMax,
      w.effortTiebreakMax - item.remainingMinutes / w.effortTiebreakDivisor,
    ),
  );

  const score =
    urgency + importance + overdue + examProximity + effortTiebreak * w.effortTiebreakWeight;

  const reasonCode: ReasonCode =
    overdue > 0
      ? "OVERDUE"
      : examProximity > 0
        ? "EXAM_PROXIMITY"
        : urgency >= 60
          ? "DUE_SOON"
          : importance >= w.priorityWeight.HIGH
            ? "HIGH_PRIORITY"
            : "STANDARD";

  return {
    item,
    score,
    reasonCode,
    breakdown: { urgency, importance, overdue, examProximity, effortTiebreak },
  };
}

export function scoreAndRank(
  items: WorkItem[],
  now: Date,
  timeZone?: string | null,
): ScoredItem[] {
  // Ties break on due date then id so the ranking — and therefore the whole
  // schedule — is stable regardless of the order rows come back from the DB.
  return items
    .map((item) => scoreItem(item, now, timeZone))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.dueAt.getTime() - b.item.dueAt.getTime() ||
        a.item.id.localeCompare(b.item.id),
    );
}
