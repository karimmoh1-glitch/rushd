import "server-only";
import { db } from "@/lib/db";

/** Re-verifies a client-supplied classId against the actual owner before
 * any assignment/exam write — holds even when the classId came from an AI
 * suggestion (quick-add, screenshot import). See docs/SECURITY.md. */
export async function assertOwnsClass(userId: string, classId: string): Promise<boolean> {
  const cls = await db.class.findFirst({
    where: { id: classId, userId },
    select: { id: true },
  });
  return Boolean(cls);
}
