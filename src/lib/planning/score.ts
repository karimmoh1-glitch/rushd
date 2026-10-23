import { SCORING_WEIGHTS } from "./constants";
import { calendarDaysBetween } from "@/lib/time/zone";
import type { WorkItem, ScoredItem, ReasonCode, ScoreBreakdown, MasterySummary } from "./types";

/** Urgency at or above this means the item is due within about 3 days. */
const DUE_SOON_URGENCY = 60;

/** Whole calendar days from `now` until `date`, read in the student's
 * timezone. Negative means `date` is already in the past. */
export function calendarDaysUntil(date: Date, now: Date, timeZone?: string | null): number {
  return calendarDaysBetween(date, now, timeZone);
}

/** Share of a course's topics that are weak: needs-review counts fully,
 * developing and unknown count half. 0 when there are no topics. */
export function weakShare(mastery: MasterySummary): number {
  if (mastery.total <= 0) return 0;
  return (mastery.needsReview + 0.5 * mastery.developing + 0.5 * mastery.unknown) / mastery.total;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Grade weight when known; the default exam weight when the weight is
 * explicitly unknown (null); nothing when the caller doesn't model it. */
function assessmentWeightPoints(item: WorkItem): number {
  const weights = SCORING_WEIGHTS;
  if (typeof item.weightPercent === "number" && item.weightPercent > 0) {
    return Math.min(weights.weightCap, item.weightPercent * weights.weightPointsPerPercent);
  }
  if (item.weightPercent === null && item.kind === "exam") return weights.examDefaultWeight;
  return 0;
}

/** Exams only: the weaker the course's topics, the more an approaching exam pulls. */
function masteryGapPoints(item: WorkItem, daysUntilDue: number): number {
  const weights = SCORING_WEIGHTS;
  if (item.kind !== "exam" || !item.mastery || item.mastery.total === 0) return 0;
  if (daysUntilDue < 0 || daysUntilDue > weights.masteryGapWindowDays) return 0;
  const closeness = daysUntilDue <= weights.examProximityWindowDays ? 1 : 0.5;
  return round1(weakShare(item.mastery) * weights.masteryGapMax * closeness);
}

/** Review blocks: overdue relative to the interval, weak topics, an exam near. */
function reviewPoints(item: WorkItem): number {
  const weights = SCORING_WEIGHTS;
  const topics = item.review?.topics ?? [];
  let worstRatio = 0;
  let needsReview = false;
  for (const topic of topics) {
    worstRatio = Math.max(worstRatio, topic.overdueDays / Math.max(1, topic.intervalDays));
    if (topic.status === "needs_review") needsReview = true;
  }
  let points = weights.reviewBase + Math.min(weights.reviewOverdueMax, worstRatio * weights.reviewOverduePerInterval);
  if (needsReview) points += weights.reviewNeedsReviewBonus;
  const examDays = item.review?.examDaysAway;
  if (examDays !== null && examDays !== undefined && examDays <= weights.examProximityWindowDays) {
    points += weights.reviewExamBonus;
  }
  return round1(points);
}

export function scoreItem(item: WorkItem, now: Date, timeZone?: string | null): ScoredItem {
  const weights = SCORING_WEIGHTS;
  const daysUntilDue = calendarDaysUntil(item.dueAt, now, timeZone);
  const isReview = item.kind === "review";
  const isOverdue = !isReview && item.dueAt.getTime() < now.getTime();

  // Urgency starts at the max and drops a fixed amount for each day left.
  // Review blocks have no deadline in that sense; reviewUrgency carries them.
  const daysLeft = Math.max(0, daysUntilDue);
  const urgency = isReview ? 0 : Math.max(0, weights.urgencyMax - daysLeft * weights.urgencyPerDay);

  // Importance: the item's own priority, plus its class's priority at half weight.
  // A review block has no priority of its own, only its course's.
  const ownPriority = isReview ? 0 : weights.priorityWeight[item.priority];
  const importance = ownPriority + weights.priorityWeight[item.classPriority] * weights.classPriorityMultiplier;

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

  const assessmentWeight = assessmentWeightPoints(item);
  const masteryGap = masteryGapPoints(item, daysUntilDue);
  const reviewUrgency = isReview ? reviewPoints(item) : 0;

  const score =
    urgency +
    importance +
    overdue +
    examProximity +
    effortTiebreak * weights.effortTiebreakWeight +
    assessmentWeight +
    masteryGap +
    reviewUrgency;

  const breakdown: ScoreBreakdown = {
    urgency,
    importance,
    overdue,
    examProximity,
    effortTiebreak,
    assessmentWeight,
    masteryGap,
    reviewUrgency,
  };

  return {
    item,
    score,
    reasonCode: pickReasonCode(item, breakdown),
    breakdown,
  };
}

/** The main reason an item ranks where it does, checked from strongest to weakest. */
function pickReasonCode(item: WorkItem, breakdown: ScoreBreakdown): ReasonCode {
  if (breakdown.overdue > 0) return "OVERDUE";
  if (item.kind === "review") return "REVIEW_DUE";
  if (breakdown.examProximity > 0) return "EXAM_PROXIMITY";
  if (breakdown.urgency >= DUE_SOON_URGENCY) return "DUE_SOON";
  if (breakdown.importance >= SCORING_WEIGHTS.priorityWeight.HIGH) return "HIGH_PRIORITY";
  if (typeof item.weightPercent === "number" && breakdown.assessmentWeight >= SCORING_WEIGHTS.highWeightPoints) {
    return "HIGH_WEIGHT";
  }
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

  const byId = a.item.id.localeCompare(b.item.id);
  if (byId !== 0) return byId;
  // A course's review block shares the course id space with nothing else, but be exact anyway.
  return a.item.kind.localeCompare(b.item.kind);
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
