import "server-only";
import { db } from "@/lib/db";
import { localDateKey } from "@/lib/time/zone";
import { computeStreak, STUDY_EVENTS, type Streak } from "./streak";

const WINDOW_DAYS = 180;

export async function getStreak(userId: string, timeZone: string, now = new Date()): Promise<Streak> {
  const rows = await db.event.findMany({
    where: { userId, name: { in: STUDY_EVENTS }, createdAt: { gte: new Date(now.getTime() - WINDOW_DAYS * 86_400_000) } },
    select: { createdAt: true },
  });
  return computeStreak(
    rows.map((r) => localDateKey(r.createdAt, timeZone)),
    localDateKey(now, timeZone),
  );
}
