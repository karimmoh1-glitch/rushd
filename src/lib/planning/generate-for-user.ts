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
 * Everything the deterministic engine needs for one student, read from the
 * database: open assignments (excluding archived classes and work Canvas no
 * longer lists), upcoming exams, weekly availability, scheduling
 * preferences, the student's timezone, and any blocks they pinned by hand.
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
  const pinnedBlocks: PinnedBlock[] = blocks.flatMap((b) => {
    const kind = b.assignmentId ? "assignment" : b.examId ? "exam" : null;
    const itemId = b.assignmentId ?? b.examId;
    return kind && itemId
      ? [{ id: b.id, kind, itemId, date: b.localDate, startMinute: b.startMinute, durationMinutes: b.durationMinutes }]
      : [];
  });

  const workItems = buildWorkItems(assignments, exams, estimationProfile);
  const sourceById = new Map(assignments.map((a) => [a.id, a.source]));
  for (const item of workItems) {
    if (item.kind === "assignment") item.source = sourceById.get(item.id);
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
 * The single source of truth for "what does this user's plan look like right
 * now" — used live by the dashboard and plan page, and by the plan-snapshot
 * persistence (src/server/actions/plans.ts). Returns the student's timezone
 * alongside the plan so pages render days/times in it.
 */
export async function generatePlanForUser(
  userId: string,
  now: Date = new Date(),
): Promise<UserPlan> {
  const context = await loadPlanningContext(userId, now);
  return { ...generatePlan(context), timeZone: context.timeZone };
}
