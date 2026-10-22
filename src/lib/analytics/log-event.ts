import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { qualifiesForReferral } from "@/lib/referral/constants";
import { qualifyReferral } from "@/lib/referral/referral";

// Product analytics events — see docs/PRODUCT.md#analytics for the event
// list and the "understand, don't surveil" intent behind it.
//
// Best-effort: a logging failure must never break the user-facing action it
// describes, so errors are swallowed (and reported to the server console for
// operator visibility) rather than propagated.
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
    console.error(`[analytics] failed to log event "${name}"`, error);
  }
}
