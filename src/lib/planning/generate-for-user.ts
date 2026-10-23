import "server-only";
import { db } from "@/lib/db";
import { buildWorkItems } from "./build-work-items";
import { generatePlan } from "./schedule";
import { getEstimationProfileForUser } from "@/lib/estimation/get-estimation-profile-for-user";
import { getLearningOverview, type LearningOverview } from "@/lib/learning/load";
import { calendarDaysBetween, localDateKey, resolveTimeZone } from "@/lib/time/zone";
import { applyMasteryToExam, buildReviewWorkItems, summarizeMastery } from "./mastery-inputs";
import { dateColumnKey } from "./outcomes";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_MAX_DAILY_MINUTES,
  DEFAULT_PREFERRED_SESSION_MINUTES,
  PLANNING_HORIZON_DAYS,
} from "./constants";
import type { MasterySummary, PlanExclusion, PlanInput, PlanResult, PinnedBlock } from "./types";

export interface PlanningContext extends PlanInput {
  timeZone: string;
  learning: LearningOverview;
  /** Mastery summary per active course with confirmed topics. */
  masteryByClass: Map<string, MasterySummary>;
}

export type UserPlan = PlanResult & {
  timeZone: string;
  /** The student's topic maps and estimates, as the planner used them. */
  learning: LearningOverview;
  /** Mastery summary per course id (courses with confirmed topics only). */
  masteryByClass: Map<string, MasterySummary>;
};

/**
 * Reads everything the planner needs for one student: open assignments (not
 * in archived classes, not removed from Canvas), upcoming exams, weekly
 * availability, preferences, timezone, pinned blocks, the student's "skip
 * today" / "not this week" overrides, course terms, and the learning state
 * (topic estimates and due reviews) from learning-core.
 */
export async function loadPlanningContext(
  userId: string,
  now: Date = new Date(),
): Promise<PlanningContext> {
  const classSelect = { name: true, color: true, priority: true, termStart: true, termEnd: true } as const;
  const [profile, assignments, exams, availability, estimationProfile, learning, classes] = await Promise.all([
    db.profile.findUnique({
      where: { userId },
      select: { timezone: true, preferredSessionMinutes: true, maxDailyMinutes: true },
    }),
    db.assignment.findMany({
      where: {
        userId,
        status: { not: "COMPLETED" },
        canvasRemovedAt: null,
        class: { archived: false },
      },
      select: {
        id: true,
        classId: true,
        title: true,
        dueAt: true,
        estimatedMinutes: true,
        priority: true,
        status: true,
        source: true,
        weightPercent: true,
        class: { select: classSelect },
      },
    }),
    db.exam.findMany({
      where: { userId, examAt: { gte: now }, class: { archived: false } },
      select: {
        id: true,
        classId: true,
        title: true,
        examAt: true,
        prepMinutes: true,
        priority: true,
        weightPercent: true,
        class: { select: classSelect },
      },
    }),
    db.studyAvailability.findMany({
      where: { userId },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    getEstimationProfileForUser(userId),
    getLearningOverview(userId, now),
    db.class.findMany({
      where: { userId, archived: false },
      select: { id: true, name: true, color: true, priority: true, termStart: true, termEnd: true },
    }),
  ]);

  const timeZone = resolveTimeZone(profile?.timezone);
  const todayKey = localDateKey(now, timeZone);

  const [blocks, overrides] = await Promise.all([
    db.scheduleBlock.findMany({
      where: { userId, localDate: { gte: todayKey } },
      select: {
        id: true,
        assignmentId: true,
        examId: true,
        localDate: true,
        startMinute: true,
        durationMinutes: true,
      },
    }),
    db.planOverride.findMany({
      where: { userId, localDate: { gte: todayKey } },
      select: { kind: true, assignmentId: true, examId: true, classId: true, localDate: true },
    }),
  ]);
  const pinnedBlocks: PinnedBlock[] = [];
  for (const block of blocks) {
    let kind: PinnedBlock["kind"];
    let itemId: string;
    if (block.assignmentId) {
      kind = "assignment";
      itemId = block.assignmentId;
    } else if (block.examId) {
      kind = "exam";
      itemId = block.examId;
    } else {
      continue; // The block isn't linked to any work.
    }
    pinnedBlocks.push({
      id: block.id,
      kind,
      itemId,
      date: block.localDate,
      startMinute: block.startMinute,
      durationMinutes: block.durationMinutes,
    });
  }

  const exclusions: PlanExclusion[] = [];
  for (const override of overrides) {
    const target = override.assignmentId
      ? { kind: "assignment" as const, itemId: override.assignmentId }
      : override.examId
        ? { kind: "exam" as const, itemId: override.examId }
        : override.classId
          ? { kind: "review" as const, itemId: override.classId }
          : null;
    if (!target) continue;
    exclusions.push({ ...target, type: override.kind === "SKIP_DAY" ? "skip" : "not_this_week", date: override.localDate });
  }

  const withTerm = <T extends { class: { termStart: Date | null; termEnd: Date | null } }>(row: T) => ({
    ...row,
    class: { ...row.class, termStart: dateColumnKey(row.class.termStart), termEnd: dateColumnKey(row.class.termEnd) },
  });
  const baseItems = buildWorkItems(assignments.map(withTerm), exams.map(withTerm), estimationProfile);
  const sourceByAssignmentId = new Map<string, (typeof assignments)[number]["source"]>();
  for (const assignment of assignments) {
    sourceByAssignmentId.set(assignment.id, assignment.source);
  }

  // Mastery per course, from confirmed topics only.
  const activeIds = new Set(classes.map((c) => c.id));
  const masteryByClass = new Map<string, MasterySummary>();
  for (const course of learning.courses) {
    if (!activeIds.has(course.id) || course.learning.topics.length === 0) continue;
    masteryByClass.set(course.id, summarizeMastery(course.learning.topics.map((t) => t.estimate.status)));
  }

  const workItems = baseItems.map((item) => {
    if (item.kind === "assignment") item.source = sourceByAssignmentId.get(item.id);
    return applyMasteryToExam(item, masteryByClass.get(item.classId));
  });

  // Due reviews become one review block per course.
  const examDaysByClass = new Map<string, number>();
  for (const exam of exams) {
    const days = calendarDaysBetween(exam.examAt, now, timeZone);
    const known = examDaysByClass.get(exam.classId);
    if (known === undefined || days < known) examDaysByClass.set(exam.classId, days);
  }
  const reviewItems = buildReviewWorkItems({
    topics: learning.courses
      .filter((c) => activeIds.has(c.id))
      .flatMap((c) => c.learning.topics.map((t) => ({ topicId: t.id, classId: c.id, title: t.title, estimate: t.estimate }))),
    courses: classes.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      priority: c.priority,
      term: { start: dateColumnKey(c.termStart), end: dateColumnKey(c.termEnd) },
    })),
    examDaysByClass,
    now,
    timeZone,
  });

  return {
    workItems: [...workItems, ...reviewItems],
    availability,
    now,
    timeZone,
    horizonDays: PLANNING_HORIZON_DAYS,
    preferences: {
      preferredSessionMinutes: profile?.preferredSessionMinutes ?? DEFAULT_PREFERRED_SESSION_MINUTES,
      maxDailyMinutes: profile?.maxDailyMinutes ?? DEFAULT_MAX_DAILY_MINUTES,
      breakMinutes: DEFAULT_BREAK_MINUTES,
    },
    pinnedBlocks,
    exclusions,
    learning,
    masteryByClass,
  };
}

/**
 * The one place that answers "what does this student's plan look like now".
 * Also returns their timezone so pages show days and times in it, and the
 * learning state it used, so Today doesn't load it twice.
 */
export async function generatePlanForUser(
  userId: string,
  now: Date = new Date(),
): Promise<UserPlan> {
  const context = await loadPlanningContext(userId, now);
  return {
    ...generatePlan(context),
    timeZone: context.timeZone,
    learning: context.learning,
    masteryByClass: context.masteryByClass,
  };
}
