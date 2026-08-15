"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";

/**
 * Logs interaction with a specific suggested plan item, distinct from
 * assignment_completed/exam-level events — this answers "did the student
 * act on what the plan suggested today," not just "was the underlying
 * assignment eventually completed from somewhere in the app."
 *
 * Sessions are computed live (see docs/PLANNING_ENGINE.md) rather than
 * read from a persisted PlanItem row, so this only logs the event; it
 * never mutates plan state itself.
 */
export async function logPlanItemInteraction(
  action: "completed" | "skipped",
  itemId: string,
  itemKind: "assignment" | "exam",
): Promise<void> {
  const user = await requireUserOrThrow();
  await logEvent(user.id, `plan_item_${action}`, { itemId, itemKind });
}
