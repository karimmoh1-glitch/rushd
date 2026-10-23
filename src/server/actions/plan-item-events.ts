"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";

/** Logs whether the student acted on a suggested plan item today. The plan is
 * computed live, so this only logs; it never changes plan state. */
export async function logPlanItemInteraction(
  action: "completed" | "skipped",
  itemId: string,
  itemKind: "assignment" | "exam",
): Promise<void> {
  const user = await requireUserOrThrow();
  await logEvent(user.id, `plan_item_${action}`, { itemId, itemKind });
}
