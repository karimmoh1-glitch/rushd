"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";

/**
 * Logs interaction with the what-if simulator — a client-only widget with
 * no server round-trip otherwise, so there's nowhere else to record "did a
 * student actually use this."
 */
export async function logWhatIfSimulatorUsed(): Promise<void> {
  const user = await requireUserOrThrow();
  await logEvent(user.id, "what_if_simulator_used");
}
