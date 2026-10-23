import "server-only";
import { db } from "@/lib/db";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { DEFAULT_HORIZON_DAYS } from "@/lib/planning/constants";
import { logEvent } from "@/lib/analytics/log-event";

/**
 * Saves a history snapshot of the current plan, for analytics only (the
 * dashboard always computes the plan live). Called after any change that can
 * move the plan. Never throws: a failure here must not break the user's action.
 */
export async function regeneratePlanSnapshot(userId: string): Promise<void> {
  try {
    const now = new Date();
    const result = await generatePlanForUser(userId, now);

    const plan = await db.plan.create({
      data: { userId, generatedAt: now, horizonDays: DEFAULT_HORIZON_DAYS },
      select: { id: true },
    });

    if (result.sessions.length > 0) {
      const rows = [];
      for (const session of result.sessions) {
        let assignmentId: string | null = null;
        let examId: string | null = null;
        if (session.item.kind === "assignment") {
          assignmentId = session.item.id;
        } else if (session.item.kind === "exam") {
          examId = session.item.id;
        }
        rows.push({
          planId: plan.id,
          userId,
          assignmentId,
          examId,
          scheduledDate: new Date(`${session.scheduledDate}T00:00:00`),
          scheduledMinutes: session.scheduledMinutes,
          score: session.score,
          reasonCode: session.reasonCode,
        });
      }
      await db.planItem.createMany({ data: rows });
    }

    await logEvent(userId, "plan_generated", {
      sessionCount: result.sessions.length,
      workItemCount: result.scored.length,
    });
  } catch (error) {
    console.error("[plans] failed to persist plan snapshot", error);
  }
}
