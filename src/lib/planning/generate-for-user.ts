import "server-only";
import { db } from "@/lib/db";
import { buildWorkItems } from "./build-work-items";
import { generatePlan } from "./schedule";
import type { PlanResult } from "./types";

/**
 * Fetches a user's open assignments, upcoming exams, and study availability
 * (excluding archived classes — archiving a class means "I'm done planning
 * around this"), then runs the deterministic planning engine. This is the
 * single function
 * both the dashboard (live, read-only) and the plan-snapshot persistence
 * (src/server/actions/plans.ts, triggered on mutations) call — one source
 * of truth for "what does this user's plan look like right now."
 */
export async function generatePlanForUser(
  userId: string,
  now: Date = new Date(),
): Promise<PlanResult> {
  const [assignments, exams, availability] = await Promise.all([
    db.assignment.findMany({
      where: {
        userId,
        status: { not: "COMPLETED" },
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
  ]);

  const workItems = buildWorkItems(assignments, exams);

  return generatePlan({ workItems, availability, now });
}
