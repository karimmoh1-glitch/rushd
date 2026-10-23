import "server-only";
import { db } from "@/lib/db";
import { buildWorkItems } from "./build-work-items";
import { generatePlan } from "./schedule";
import { getEstimationProfileForUser } from "@/lib/estimation/get-estimation-profile-for-user";
import { localDateKey, resolveTimeZone } from "@/lib/time/zone";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_MAX_DAILY_MINUTES,
  DEFAULT_PREFERRED_SESSION_MINUTES,
  PLANNING_HORIZON_DAYS,
} from "./constants";
import type { PlanInput, PlanResult, PinnedBlock } from "./types";

export interface PlanningContext extends PlanInput {
  timeZone: string;
}

export type UserPlan = PlanResult & { timeZone: string };

/**
 * Reads everything the planner needs for one student: open assignments (not
 * in archived classes, not removed from Canvas), upcoming exams, weekly
 * availability, preferences, timezone, and pinned blocks.
 */
export async function loadPlanningContext(
  userId: string,
  now: Date = new Date(),
): Promise<PlanningContext> {
  const [profile, assignments, exams, availability, estimationProfile] = await Promise.all([
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
        class: { select: { name: true, color: true, priority: true } },
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
        class: { select: { name: true, color: true, priority: true } },
      },
    }),
    db.studyAvailability.findMany({
      where: { userId },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    getEstimationProfileForUser(userId),
  ]);

  const timeZone = resolveTimeZone(profile?.timezone);
  const todayKey = localDateKey(now, timeZone);

  const blocks = await db.scheduleBlock.findMany({
    where: { userId, localDate: { gte: todayKey } },
    select: {
      id: true,
      assignmentId: true,
      examId: true,
      localDate: true,
      startMinute: true,
      durationMinutes: true,
    },
  });
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

  const workItems = buildWorkItems(assignments, exams, estimationProfile);
  const sourceByAssignmentId = new Map<string, (typeof assignments)[number]["source"]>();
  for (const assignment of assignments) {
    sourceByAssignmentId.set(assignment.id, assignment.source);
  }
  for (const item of workItems) {
    if (item.kind === "assignment") {
      item.source = sourceByAssignmentId.get(item.id);
    }
  }

  return {
    workItems,
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
  };
}

/**
 * The one place that answers "what does this student's plan look like now".
 * Also returns their timezone so pages show days and times in it.
 */
export async function generatePlanForUser(
  userId: string,
  now: Date = new Date(),
): Promise<UserPlan> {
  const context = await loadPlanningContext(userId, now);
  return { ...generatePlan(context), timeZone: context.timeZone };
}
