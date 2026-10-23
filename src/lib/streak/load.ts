import "server-only";
import { db } from "@/lib/db";
import { localDateKey } from "@/lib/time/zone";
import { computeStreak, STUDY_EVENTS, type Streak } from "./streak";

/** Only the last 180 days of activity are read. */
const WINDOW_DAYS = 180;

export async function getStreak(userId: string, timeZone: string, now = new Date()): Promise<Streak> {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const rows = await db.event.findMany({
    where: { userId, name: { in: STUDY_EVENTS }, createdAt: { gte: windowStart } },
    select: { createdAt: true },
  });

  const activeDays: string[] = [];
  for (const row of rows) {
    activeDays.push(localDateKey(row.createdAt, timeZone));
  }
  return computeStreak(activeDays, localDateKey(now, timeZone));
}
