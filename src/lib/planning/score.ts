import { SCORING_WEIGHTS } from "./constants";
import type { WorkItem, ScoredItem, ReasonCode } from "./types";

/** Whole calendar days between two dates, ignoring time-of-day. Negative
 * means `date` is in the past relative to `now`. */
export function calendarDaysUntil(date: Date, now: Date): number {
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDate.getTime() - startOfNow.getTime()) / msPerDay);
}

export function scoreItem(item: WorkItem, now: Date): ScoredItem {
  const w = SCORING_WEIGHTS;
  const daysUntil = calendarDaysUntil(item.dueAt, now);
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

export function scoreAndRank(items: WorkItem[], now: Date): ScoredItem[] {
  return items.map((item) => scoreItem(item, now)).sort((a, b) => b.score - a.score);
}
