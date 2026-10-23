// Spaced review: which topics are due, in what order, and why. Pure, so the
// planner (src/lib/planning, later) can call it with the same inputs and get
// the same queue. The schedule itself (expanding intervals, failures shorten
// them) lives in estimateTopic(); this only ranks what it produced.

import { DAY_MS, daysAgoPhrase, type TopicEstimate } from "./estimator";

export interface ReviewCandidate {
  topicId: string;
  classId: string;
  title: string;
  estimate: TopicEstimate;
}

export interface ReviewItem {
  topicId: string;
  classId: string;
  title: string;
  dueAt: Date;
  /** Days past due; negative when it falls inside the look-ahead window but isn't due yet. */
  overdueDays: number;
  status: TopicEstimate["status"];
  /** One sentence: why this is on the list. */
  reason: string;
  /** Suggested length of the review, in minutes. */
  minutes: number;
}

export interface ReviewQueueOptions {
  /** Also include topics that come due within this many days. Default 0 (due now only). */
  horizonDays?: number;
  limit?: number;
}

function reasonFor(c: ReviewCandidate, now: Date): string {
  const e = c.estimate;
  const sinceSuccess = e.lastSuccessAt ? daysAgoPhrase((now.getTime() - e.lastSuccessAt.getTime()) / DAY_MS) : null;
  if (!e.lastSuccessAt) return "You haven't answered it cleanly yet; a short retry helps it stick.";
  if (e.status === "needs_review" && e.repeatedMistakes > 0) return `The same mistake has come up more than once (last correct ${sinceSuccess}).`;
  if (e.status === "needs_review") return `Last correct ${sinceSuccess}; it may be slipping, so review it before it fades further.`;
  if (e.overdueDays < 0) return `Coming due: last correct ${sinceSuccess}.`;
  return `Last correct ${sinceSuccess}; checking now, before you're likely to forget, makes the next gap longer.`;
}

/** Topics due for review, most urgent first: furthest past due relative to
 * their interval, then needs-review before developing, then lower estimates. */
export function reviewQueue(candidates: ReviewCandidate[], now: Date, options: ReviewQueueOptions = {}): ReviewItem[] {
  const horizon = (options.horizonDays ?? 0) * DAY_MS;
  const items: (ReviewItem & { urgency: number; rank: number; score: number })[] = [];
  for (const c of candidates) {
    const e = c.estimate;
    if (!e.nextReviewAt || e.answers === 0) continue;
    if (e.nextReviewAt.getTime() > now.getTime() + horizon) continue;
    const overdueDays = (now.getTime() - e.nextReviewAt.getTime()) / DAY_MS;
    items.push({
      topicId: c.topicId,
      classId: c.classId,
      title: c.title,
      dueAt: e.nextReviewAt,
      overdueDays,
      status: e.status,
      reason: reasonFor({ ...c, estimate: { ...e, overdueDays } }, now),
      minutes: e.status === "needs_review" ? 20 : 10,
      urgency: overdueDays / Math.max(1, e.intervalDays ?? 1),
      rank: e.status === "needs_review" ? 0 : e.status === "developing" ? 1 : e.status === "not_enough_evidence" ? 2 : 3,
      score: e.estimate ?? 0,
    });
  }
  items.sort((a, b) => b.urgency - a.urgency || a.rank - b.rank || a.score - b.score || a.title.localeCompare(b.title));
  const limited = options.limit ? items.slice(0, options.limit) : items;
  return limited.map((item) => ({
    topicId: item.topicId,
    classId: item.classId,
    title: item.title,
    dueAt: item.dueAt,
    overdueDays: item.overdueDays,
    status: item.status,
    reason: item.reason,
    minutes: item.minutes,
  }));
}
