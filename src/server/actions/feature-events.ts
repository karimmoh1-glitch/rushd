"use server";

import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";

/** Logs use of the what-if simulator. It runs only in the browser, so this is
 * the one place its use gets recorded. */
export async function logWhatIfSimulatorUsed(): Promise<void> {
  const user = await requireUserOrThrow();
  await logEvent(user.id, "what_if_simulator_used");
}
