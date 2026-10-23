import { SCORING_WEIGHTS } from "./constants";
import { calendarDaysBetween } from "@/lib/time/zone";
import type { WorkItem, ScoredItem, ReasonCode, ScoreBreakdown } from "./types";

/** Urgency at or above this means the item is due within about 3 days. */
const DUE_SOON_URGENCY = 60;

/** Whole calendar days from `now` until `date`, read in the student's
 * timezone. Negative means `date` is already in the past. */
export function calendarDaysUntil(date: Date, now: Date, timeZone?: string | null): number {
  return calendarDaysBetween(date, now, timeZone);
}

export function scoreItem(item: WorkItem, now: Date, timeZone?: string | null): ScoredItem {
  const weights = SCORING_WEIGHTS;
  const daysUntilDue = calendarDaysUntil(item.dueAt, now, timeZone);
  const isOverdue = item.dueAt.getTime() < now.getTime();

  // Urgency starts at the max and drops a fixed amount for each day left.
  const daysLeft = Math.max(0, daysUntilDue);
  const urgency = Math.max(0, weights.urgencyMax - daysLeft * weights.urgencyPerDay);

  // Importance: the item's own priority, plus its class's priority at half weight.
  const importance =
    weights.priorityWeight[item.priority] +
    weights.priorityWeight[item.classPriority] * weights.classPriorityMultiplier;

  let overdue = 0;
  if (isOverdue) {
    const daysLate = Math.max(0, -daysUntilDue);
    overdue = Math.min(weights.overdueCap, weights.overdueBase + daysLate * weights.overduePerDay);
  }

  let examProximity = 0;
  if (item.kind === "exam" && daysUntilDue >= 0 && daysUntilDue <= weights.examProximityWindowDays) {
    examProximity = (weights.examProximityWindowDays - daysUntilDue) * weights.examProximityPerDay;
  }

  // Shorter tasks get a small bonus, kept between 0 and the max.
  const effortPoints = weights.effortTiebreakMax - item.remainingMinutes / weights.effortTiebreakDivisor;
  const effortTiebreak = Math.max(0, Math.min(weights.effortTiebreakMax, effortPoints));

  const score =
    urgency + importance + overdue + examProximity + effortTiebreak * weights.effortTiebreakWeight;

  const breakdown: ScoreBreakdown = { urgency, importance, overdue, examProximity, effortTiebreak };

  return {
    item,
    score,
    reasonCode: pickReasonCode(breakdown),
    breakdown,
  };
}

/** The main reason an item ranks where it does, checked from strongest to weakest. */
function pickReasonCode(breakdown: ScoreBreakdown): ReasonCode {
  if (breakdown.overdue > 0) return "OVERDUE";
  if (breakdown.examProximity > 0) return "EXAM_PROXIMITY";
  if (breakdown.urgency >= DUE_SOON_URGENCY) return "DUE_SOON";
  if (breakdown.importance >= SCORING_WEIGHTS.priorityWeight.HIGH) return "HIGH_PRIORITY";
  return "STANDARD";
}

/** Sorts highest score first. Ties break on due date, then id, so the
 * ranking (and the whole schedule) doesn't depend on database row order. */
function compareByRank(a: ScoredItem, b: ScoredItem): number {
  if (a.score > b.score) return -1;
  if (a.score < b.score) return 1;

  const aDue = a.item.dueAt.getTime();
  const bDue = b.item.dueAt.getTime();
  if (aDue < bDue) return -1;
  if (aDue > bDue) return 1;

  return a.item.id.localeCompare(b.item.id);
}

export function scoreAndRank(
  items: WorkItem[],
  now: Date,
  timeZone?: string | null,
): ScoredItem[] {
  const scored: ScoredItem[] = [];
  for (const item of items) {
    scored.push(scoreItem(item, now, timeZone));
  }
  scored.sort(compareByRank);
  return scored;
}
