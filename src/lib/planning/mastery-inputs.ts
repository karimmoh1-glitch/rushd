// Turns learning-core output (topic estimates, the review queue) into planner
// inputs. Pure: the same topics, evidence and "now" always give the same
// work items. See docs/PLANNING_ENGINE.md → "Mastery inputs".

import { DAY_MS, type MasteryStatusV2, type TopicEstimate } from "@/lib/learning/estimator";
import { reviewQueue } from "@/lib/learning/review";
import { addDaysToKey, localDateKey, zonedTimeToUtc } from "@/lib/time/zone";
import {
  PREP_FACTOR_MAX,
  PREP_FACTOR_MIN,
  REVIEW_BLOCK_MAX_MINUTES,
  REVIEW_BLOCK_MIN_MINUTES,
  REVIEW_TOPICS_PER_BLOCK,
  REVIEW_WINDOW_DAYS,
} from "./constants";
import type { MasterySummary, PriorityValue, ReviewTopic, WorkItem } from "./types";

export function summarizeMastery(statuses: MasteryStatusV2[]): MasterySummary {
  const summary: MasterySummary = { total: 0, secure: 0, developing: 0, needsReview: 0, unknown: 0 };
  for (const status of statuses) {
    summary.total++;
    if (status === "secure") summary.secure++;
    else if (status === "developing") summary.developing++;
    else if (status === "needs_review") summary.needsReview++;
    else summary.unknown++;
  }
  return summary;
}

/** How much to scale an exam's prep time by the course's mastery. 1 without topics. */
export function prepFactor(m: MasterySummary): number {
  if (m.total <= 0) return 1;
  const raw = 1 + (0.5 * m.needsReview + 0.25 * m.developing + 0.25 * m.unknown - 0.25 * m.secure) / m.total;
  const bounded = Math.min(PREP_FACTOR_MAX, Math.max(PREP_FACTOR_MIN, raw));
  return Math.round(bounded * 100) / 100;
}

function roundTo5(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** Scales an exam's prep minutes by its course's mastery and records why.
 * Assignments, and exams in courses without a topic map, come back as is
 * (apart from carrying the summary). */
export function applyMasteryToExam(item: WorkItem, mastery: MasterySummary | undefined): WorkItem {
  if (item.kind !== "exam" || !mastery || mastery.total === 0) return item;
  const factor = prepFactor(mastery);
  const base = item.remainingMinutes;
  const adjusted = factor === 1 ? base : roundTo5(base * factor);
  return {
    ...item,
    mastery,
    remainingMinutes: adjusted,
    prep: { baseMinutes: base, factor, mastery },
  };
}

export interface ReviewCourse {
  id: string;
  name: string;
  color: string;
  priority: PriorityValue;
  term?: { start: string | null; end: string | null };
}

export interface ReviewTopicInput {
  topicId: string;
  classId: string;
  title: string;
  estimate: TopicEstimate;
}

/**
 * One review block per course with due topics (most urgent first, at most
 * REVIEW_TOPICS_PER_BLOCK). Length is the sum of learning-core's suggested
 * minutes (20 for needs-review, 10 otherwise), kept between 15 and 45. The
 * block is "due" at the end of the review window, so the planner places it
 * in the next few days or not at all (reviews are soft work).
 */
export function buildReviewWorkItems(input: {
  topics: ReviewTopicInput[];
  courses: ReviewCourse[];
  /** Days until each course's next exam (only courses that have one). */
  examDaysByClass: Map<string, number>;
  now: Date;
  timeZone: string;
}): WorkItem[] {
  const courseById = new Map(input.courses.map((c) => [c.id, c]));
  const estimateById = new Map(input.topics.map((t) => [t.topicId, t.estimate]));
  const queue = reviewQueue(
    input.topics.filter((t) => courseById.has(t.classId)),
    input.now,
  );

  const byCourse = new Map<string, typeof queue>();
  for (const review of queue) {
    const list = byCourse.get(review.classId);
    if (list) list.push(review);
    else byCourse.set(review.classId, [review]);
  }

  const todayKey = localDateKey(input.now, input.timeZone);
  const windowEnd = zonedTimeToUtc(addDaysToKey(todayKey, REVIEW_WINDOW_DAYS - 1), 23 * 60 + 59, input.timeZone);

  const items: WorkItem[] = [];
  for (const [classId, reviews] of byCourse) {
    const course = courseById.get(classId)!;
    const chosen = reviews.slice(0, REVIEW_TOPICS_PER_BLOCK);
    let minutes = 0;
    const topics: ReviewTopic[] = [];
    for (const review of chosen) {
      minutes += review.minutes;
      const estimate = estimateById.get(review.topicId);
      const lastSuccess = estimate?.lastSuccessAt ?? null;
      topics.push({
        topicId: review.topicId,
        title: review.title,
        status: review.status,
        daysSinceRecall: lastSuccess ? Math.floor((input.now.getTime() - lastSuccess.getTime()) / DAY_MS) : null,
        overdueDays: Math.max(0, Math.floor(review.overdueDays)),
        intervalDays: estimate?.intervalDays ?? 1,
      });
    }
    minutes = Math.min(REVIEW_BLOCK_MAX_MINUTES, Math.max(REVIEW_BLOCK_MIN_MINUTES, minutes));
    const titles = topics.map((t) => t.title);
    const title = titles.length <= 2 ? `Review: ${titles.join(" and ")}` : `Review: ${titles[0]}, ${titles[1]} +${titles.length - 2}`;
    items.push({
      kind: "review",
      id: classId,
      classId,
      title,
      className: course.name,
      classColor: course.color,
      priority: course.priority,
      classPriority: course.priority,
      dueAt: windowEnd,
      remainingMinutes: minutes,
      rawEstimatedMinutes: minutes,
      estimateAdjusted: false,
      review: { topics, examDaysAway: input.examDaysByClass.get(classId) ?? null },
      term: course.term,
      soft: true,
    });
  }
  return items;
}
