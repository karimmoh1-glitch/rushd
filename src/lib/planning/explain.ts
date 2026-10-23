import { calendarDaysUntil } from "./score";
import { formatDuration } from "@/lib/format";
import type { MasterySummary, ReviewTopic, ScoredItem } from "./types";

/** An item "needs more time" when it's at least 30% above the average of the other open work. */
const EFFORT_STANDOUT_RATIO = 1.3;
/** Items shorter than this are never called out; comparing tiny tasks is just noise. */
const EFFORT_STANDOUT_FLOOR_MINUTES = 20;
/** Review blocks name at most this many topics in their reasons. */
const REVIEW_TOPICS_NAMED = 2;

/** True if `scored` needs clearly more time than the rest of the open work. */
function isEffortStandout(scored: ScoredItem, allScored: ScoredItem[]): boolean {
  let otherCount = 0;
  let otherMinutes = 0;
  for (const other of allScored) {
    if (other.item.id === scored.item.id && other.item.kind === scored.item.kind) continue;
    if (other.item.kind === "review") continue;
    otherCount++;
    otherMinutes += other.item.remainingMinutes;
  }
  if (otherCount === 0) return false;

  const averageMinutes = otherMinutes / otherCount;
  const minutes = scored.item.remainingMinutes;
  return minutes >= EFFORT_STANDOUT_FLOOR_MINUTES && minutes >= averageMinutes * EFFORT_STANDOUT_RATIO;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "2 of 4 topics need review", "all 3 topics look secure", or null without topics. */
export function masteryPhrase(m: MasterySummary): string | null {
  if (m.total <= 0) return null;
  const of = (n: number) => (n === m.total ? `all ${m.total}` : `${n} of ${m.total}`);
  if (m.needsReview > 0) return `${of(m.needsReview)} ${plural(m.total, "topic", "topics")} ${plural(m.needsReview, "needs", "need")} review`;
  if (m.developing > 0) return `${of(m.developing)} ${plural(m.total, "topic", "topics")} ${plural(m.developing, "is", "are")} still developing`;
  if (m.unknown > 0) return `${of(m.unknown)} ${plural(m.total, "topic", "topics")} ${plural(m.unknown, "has", "have")} too little practice to judge`;
  return `all ${m.total} ${plural(m.total, "topic", "topics")} look secure`;
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
    return isExam ? "Exam is today" : "Due today.";
  }
  if (daysUntilDue === 1) {
    return isExam ? "Exam is tomorrow" : "Due tomorrow.";
  }
  if (daysUntilDue <= 7) {
    return isExam ? `Exam in ${daysUntilDue} days` : `Due in ${daysUntilDue} days.`;
  }
  if (isExam && scored.item.mastery && scored.breakdown.masteryGap > 0) {
    return `Exam in ${daysUntilDue} days`;
  }
  return null;
}

/** "Exam in 5 days and 2 of 4 topics need review." The mastery half only
 * appears when the course has a topic map. */
function examDeadlineSentence(base: string, mastery: MasterySummary | undefined): string {
  const phrase = mastery ? masteryPhrase(mastery) : null;
  if (!phrase) return `${base}.`;
  const joiner = mastery && mastery.needsReview + mastery.developing + mastery.unknown === 0 ? "; " : " and ";
  return `${base}${joiner}${phrase}.`;
}

function reviewTopicReason(topic: ReviewTopic): string {
  if (topic.daysSinceRecall === null) {
    return `Review due: ${topic.title}. You haven't answered it cleanly yet.`;
  }
  const when =
    topic.daysSinceRecall < 1 ? "earlier today" : topic.daysSinceRecall < 2 ? "yesterday" : `${topic.daysSinceRecall} days ago`;
  const slipping = topic.status === "needs_review" ? " It may be slipping." : "";
  return `Review due: ${topic.title}, last recalled ${when}.${slipping}`;
}

function reviewReasons(scored: ScoredItem): string[] {
  const review = scored.item.review;
  if (!review) return [];
  const reasons = review.topics.slice(0, REVIEW_TOPICS_NAMED).map(reviewTopicReason);
  const more = review.topics.length - REVIEW_TOPICS_NAMED;
  if (more > 0) reasons.push(`And ${more} more ${plural(more, "topic", "topics")} from ${scored.item.className} ${plural(more, "is", "are")} due.`);
  if (review.examDaysAway !== null && review.examDaysAway <= 7) {
    reasons.push(
      review.examDaysAway <= 0
        ? `${scored.item.className} has an exam today.`
        : `${scored.item.className} has an exam in ${review.examDaysAway} ${plural(review.examDaysAway, "day", "days")}.`,
    );
  }
  reasons.push("Checking before you're likely to forget makes the next gap longer.");
  return reasons;
}

function prepReason(scored: ScoredItem): string | null {
  const prep = scored.item.prep;
  if (!prep || prep.factor === 1) return null;
  const now = scored.item.remainingMinutes;
  if (now === prep.baseMinutes) return null;
  const phrase = masteryPhrase(prep.mastery);
  if (now > prep.baseMinutes) {
    return `Prep is ${formatDuration(now)}, up from ${formatDuration(prep.baseMinutes)}, because ${phrase}.`;
  }
  return `Prep is ${formatDuration(now)}, down from ${formatDuration(prep.baseMinutes)}, because ${phrase}.`;
}

function weightReason(scored: ScoredItem): string | null {
  const weight = scored.item.weightPercent;
  if (typeof weight === "number" && weight > 0) return `Worth ${weight}% of your ${scored.item.className} grade.`;
  if (weight === null && scored.item.kind === "exam" && scored.breakdown.assessmentWeight > 0) {
    return "Weighted as an exam, since its share of your grade isn't set.";
  }
  return null;
}

function paceReason(scored: ScoredItem): string | null {
  const note = scored.item.estimateNote;
  if (!note || !scored.item.estimateAdjusted || note.percentOff === 0) return null;
  const scope = note.source === "class" ? `${scored.item.className} work` : "study sessions";
  const sessions = `${note.sampleSize} ${plural(note.sampleSize, "session", "sessions")}`;
  if (note.percentOff > 0) {
    return `Your ${scope} has taken about ${note.percentOff}% longer than planned (${sessions}), so it gets ${formatDuration(scored.item.remainingMinutes)} instead of ${formatDuration(scored.item.rawEstimatedMinutes)}.`;
  }
  return `Your ${scope} has gone about ${Math.abs(note.percentOff)}% faster than planned (${sessions}), so it gets ${formatDuration(scored.item.remainingMinutes)} instead of ${formatDuration(scored.item.rawEstimatedMinutes)}.`;
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
  if (item.kind === "review") {
    const reasons = reviewReasons(scored);
    if (item.classPriority === "HIGH") reasons.push(`${item.className} is a high-priority class for you.`);
    return reasons.length > 0 ? reasons : ["Spaced review keeps what you've learned from fading."];
  }

  const daysUntilDue = calendarDaysUntil(item.dueAt, now, timeZone);
  const reasons: string[] = [];

  const deadline = deadlineReason(scored, daysUntilDue);
  if (deadline !== null) {
    reasons.push(item.kind === "exam" && scored.breakdown.overdue === 0 ? examDeadlineSentence(deadline, item.mastery) : deadline);
  }

  if (scored.breakdown.examProximity > 0 && !item.mastery) {
    reasons.push("The exam is close enough that prep time matters now.");
  }

  const prep = prepReason(scored);
  if (prep) reasons.push(prep);

  const weight = weightReason(scored);
  if (weight) reasons.push(weight);

  if (item.priority === "HIGH") {
    reasons.push("You marked this high priority.");
  } else if (item.classPriority === "HIGH") {
    reasons.push(`${item.className} is a high-priority class for you.`);
  }

  const pace = paceReason(scored);
  if (pace) reasons.push(pace);

  if (allScored && isEffortStandout(scored, allScored)) {
    reasons.push("It needs more time than most of your other open work.");
  }

  if (reasons.length === 0) {
    reasons.push("Part of your regular workload — nothing urgent, but worth doing.");
  }

  return reasons;
}
