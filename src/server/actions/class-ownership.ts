import "server-only";
import { db } from "@/lib/db";

/** True only if this user owns the class. Call it before every assignment or
 * exam write, even when the classId came from AI (see docs/SECURITY.md). */
export async function assertOwnsClass(userId: string, classId: string): Promise<boolean> {
  const ownedClass = await db.class.findFirst({
    where: { id: classId, userId },
    select: { id: true },
  });
  return ownedClass !== null;
}
