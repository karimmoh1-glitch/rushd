"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import * as z from "zod";
import { logEvent } from "@/lib/analytics/log-event";

const PlanItemInteraction = z.object({
  action: z.enum(["completed", "skipped"]),
  itemId: z.string().min(1).max(64),
  itemKind: z.enum(["assignment", "exam", "review"]),
  surface: z.enum(["next_up", "today"]),
});

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
  // Arguments come straight from the browser: only known values reach the event log.
  const parsed = PlanItemInteraction.safeParse({ action, itemId, itemKind, surface });
  if (!parsed.success) return;
  const { itemId: id, itemKind: kind } = parsed.data;
  await logEvent(user.id, `plan_item_${parsed.data.action}`, { itemId: id, itemKind: kind });
  if (parsed.data.action === "completed") {
    await logEvent(user.id, "recommended_task_completed", { itemId: id, itemKind: kind, surface: parsed.data.surface });
  }
}
