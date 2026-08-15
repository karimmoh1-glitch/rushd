import "server-only";
import { db } from "@/lib/db";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { DEFAULT_HORIZON_DAYS } from "@/lib/planning/constants";
import { logEvent } from "@/lib/analytics/log-event";

/**
 * Persists a snapshot of the current plan (a Plan row + its PlanItems) and
 * logs a `plan_generated` event.
 *
 * This is NOT what the dashboard reads — the dashboard always computes the
 * plan live (see docs/ARCHITECTURE.md and docs/PLANNING_ENGINE.md). This
 * snapshot exists purely as a history/analytics record, so "is Rushd
 * actually adapting" and "how often does the plan change" can be answered
 * from real data later (admin area, docs/PRODUCT.md#analytics).
 *
 * Called from every mutation that can change scoring or scheduling:
 * assignment/exam create-update-delete-complete, class priority/archive
 * changes, and availability changes. Best-effort — a failure here must
 * never break the user-facing action that triggered it, so errors are
 * caught and logged, not thrown.
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
      await db.planItem.createMany({
        data: result.sessions.map((s) => ({
          planId: plan.id,
          userId,
          assignmentId: s.item.kind === "assignment" ? s.item.id : null,
          examId: s.item.kind === "exam" ? s.item.id : null,
          scheduledDate: new Date(`${s.scheduledDate}T00:00:00`),
          scheduledMinutes: s.scheduledMinutes,
          score: s.score,
          reasonCode: s.reasonCode,
        })),
      });
    }

    await logEvent(userId, "plan_generated", {
      sessionCount: result.sessions.length,
      workItemCount: result.scored.length,
    });
  } catch (error) {
    console.error("[plans] failed to persist plan snapshot", error);
  }
}
