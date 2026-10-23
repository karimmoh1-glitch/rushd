import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { qualifiesForReferral } from "@/lib/referral/constants";
import { qualifyReferral } from "@/lib/referral/referral";
import { log } from "@/lib/log";

// Product analytics events (see docs/PRODUCT.md#analytics). Best effort: a
// logging failure must never break the action it describes, so errors are only logged.
export async function logEvent(
  userId: string,
  name: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.event.create({
      data: {
        userId,
        name,
        properties: properties as Prisma.InputJsonValue | undefined,
      },
    });
    // A real study action is what makes an invite count.
    if (qualifiesForReferral(name, properties)) await qualifyReferral(userId);
  } catch (error) {
    log.error("analytics.event_failed", { event: name, err: error });
  }
}
