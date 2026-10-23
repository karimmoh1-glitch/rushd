import "server-only";
import { recordPlanSnapshot } from "@/lib/planning/snapshots";
import type { PlanTrigger } from "@/lib/planning/diff";
import { currentTime } from "@/lib/time/now";
import { log } from "@/lib/log";

/**
 * Regenerates the plan after a change that can move it, stores the snapshot
 * with what changed (Today and /plan show it), and logs plan_regenerated with
 * the reason. The pages always compute the plan live; this is the history.
 * Never throws: a failure here must not break the user's action.
 */
export async function regeneratePlanSnapshot(
  userId: string,
  trigger: PlanTrigger = "other",
  options: { estimateChanged?: string[] } = {},
): Promise<void> {
  try {
    await recordPlanSnapshot(userId, trigger, { now: await currentTime(), estimateChanged: options.estimateChanged });
  } catch (error) {
    log.error("plans.snapshot_failed", { err: error });
  }
}
