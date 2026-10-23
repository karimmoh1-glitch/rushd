"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import * as z from "zod";
import { logEvent } from "@/lib/analytics/log-event";

const PlanItemInteraction = z.object({
  action: z.enum(["completed", "skipped"]),
  itemId: z.string().min(1).max(64),
  itemKind: z.enum(["assignment", "exam"]),
});

/** Logs whether the student acted on a suggested plan item today. The plan is
 * computed live, so this only logs; it never changes plan state. */
export async function logPlanItemInteraction(
  action: "completed" | "skipped",
  itemId: string,
  itemKind: "assignment" | "exam",
): Promise<void> {
  const user = await requireUserOrThrow();
  // Arguments come straight from the browser: only known values reach the event log.
  const parsed = PlanItemInteraction.safeParse({ action, itemId, itemKind });
  if (!parsed.success) return;
  await logEvent(user.id, `plan_item_${parsed.data.action}`, { itemId: parsed.data.itemId, itemKind: parsed.data.itemKind });
}
