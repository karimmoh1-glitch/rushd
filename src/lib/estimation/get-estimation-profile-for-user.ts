import "server-only";
import { db } from "@/lib/db";
import { buildEstimationProfile, type EstimationProfile } from "./build-estimation-profile";
import type { SessionRecord } from "@/lib/insights/build-insights";

/** Loads a student's estimation profile. Shared by the plan generator and by
 * session start, so new sessions are planned with already-adjusted minutes. */
export async function getEstimationProfileForUser(userId: string): Promise<EstimationProfile> {
  const rows = await db.studySession.findMany({
    where: { userId, status: { in: ["COMPLETED", "ABANDONED"] } },
    select: {
      className: true,
      classColor: true,
      status: true,
      plannedMinutes: true,
      actualMinutes: true,
      perceivedDifficulty: true,
      startedAt: true,
    },
  });

  const sessions: SessionRecord[] = rows.map((row) => ({
    className: row.className,
    classColor: row.classColor,
    status: row.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: row.plannedMinutes,
    actualMinutes: row.actualMinutes,
    perceivedDifficulty: row.perceivedDifficulty,
    startedAt: row.startedAt,
  }));

  return buildEstimationProfile(sessions);
}
