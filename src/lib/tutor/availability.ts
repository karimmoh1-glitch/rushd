import "server-only";
import { aiEnabled } from "@/lib/env";
import { getAiSettings } from "@/lib/ai/usage";

/** Whether the tutor can answer right now: a provider key is configured and
 * AI isn't switched off (env kill switch or admin setting). Links into the
 * tutor are only shown when this is true; the tutor page itself always loads
 * and shows the no-AI path otherwise. */
export async function tutorAvailable(): Promise<boolean> {
  if (!aiEnabled) return false;
  return (await getAiSettings()).enabled;
}
