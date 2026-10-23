import { calendarDaysUntil } from "./score";
import type { ScoredItem } from "./types";

/** An item "needs more time" when it's at least 30% above the average of the other open work. */
const EFFORT_STANDOUT_RATIO = 1.3;
/** Items shorter than this are never called out; comparing tiny tasks is just noise. */
const EFFORT_STANDOUT_FLOOR_MINUTES = 20;

/** True if `scored` needs clearly more time than the rest of the open work. */
function isEffortStandout(scored: ScoredItem, allScored: ScoredItem[]): boolean {
  let otherCount = 0;
  let otherMinutes = 0;
  for (const other of allScored) {
    if (other.item.id === scored.item.id) continue;
    otherCount++;
    otherMinutes += other.item.remainingMinutes;
  }
  if (otherCount === 0) return false;

  const averageMinutes = otherMinutes / otherCount;
  const minutes = scored.item.remainingMinutes;
  return minutes >= EFFORT_STANDOUT_FLOOR_MINUTES && minutes >= averageMinutes * EFFORT_STANDOUT_RATIO;
}

/** The sentence about when the item is due, or null if it's more than a week away. */
function deadlineReason(scored: ScoredItem, daysUntilDue: number): string | null {
  const isExam = scored.item.kind === "exam";

  if (scored.breakdown.overdue > 0) {
    const daysLate = Math.max(0, -daysUntilDue);
    if (daysLate <= 0) return "Overdue.";
    if (daysLate === 1) return "Overdue by 1 day.";
    return `Overdue by ${daysLate} days.`;
  }
  if (daysUntilDue <= 0) {
    return isExam ? "Exam is today." : "Due today.";
  }
  if (daysUntilDue === 1) {
    return isExam ? "Exam is tomorrow." : "Due tomorrow.";
  }
  if (daysUntilDue <= 7) {
    return isExam ? `Exam in ${daysUntilDue} days.` : `Due in ${daysUntilDue} days.`;
  }
  return null;
}

/**
 * Turns a scored item's real score breakdown into plain-language reasons.
 * The ranking is plain arithmetic, so we read the true reason from the math
 * instead of asking an AI to guess. Passing `allScored` also allows the
 * "needs more time than your other work" reason.
 */
export function explainScore(
  scored: ScoredItem,
  now: Date,
  allScored?: ScoredItem[],
  timeZone?: string | null,
): string[] {
  const item = scored.item;
  const daysUntilDue = calendarDaysUntil(item.dueAt, now, timeZone);
  const reasons: string[] = [];

  const deadline = deadlineReason(scored, daysUntilDue);
  if (deadline !== null) {
    reasons.push(deadline);
  }

  if (scored.breakdown.examProximity > 0) {
    reasons.push("The exam is close enough that prep time matters now.");
  }

  if (item.priority === "HIGH") {
    reasons.push("You marked this high priority.");
  } else if (item.classPriority === "HIGH") {
    reasons.push(`${item.className} is a high-priority class for you.`);
  }

  if (allScored && isEffortStandout(scored, allScored)) {
    reasons.push("It needs more time than most of your other open work.");
  }

  if (reasons.length === 0) {
    reasons.push("Part of your regular workload — nothing urgent, but worth doing.");
  }

  return reasons;
}
