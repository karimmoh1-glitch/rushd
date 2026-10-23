"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";

/** Logs whether the student acted on a suggested plan item. Completing one is
 * also a `recommended_task_completed` (the Next up card or a block on Today).
 * Ids and kinds only. Skipping goes through skipForToday (plan-overrides.ts),
 * which changes the plan and logs `block_skipped`. */
export async function logPlanItemInteraction(
  action: "completed" | "skipped",
  itemId: string,
  itemKind: "assignment" | "exam" | "review",
  surface: "next_up" | "today" = "today",
): Promise<void> {
  const user = await requireUserOrThrow();
  await logEvent(user.id, `plan_item_${action}`, { itemId, itemKind });
  if (action === "completed") {
    await logEvent(user.id, "recommended_task_completed", { itemId, itemKind, surface });
  }
}
