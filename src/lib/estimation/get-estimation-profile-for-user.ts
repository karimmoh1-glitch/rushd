import "server-only";
import { db } from "@/lib/db";
import { buildEstimationProfile, type EstimationProfile } from "./build-estimation-profile";
import type { SessionRecord } from "@/lib/insights/build-insights";

/** Single query + computation shared by every caller that needs a
 * student's estimation profile — the plan generator (so scheduling uses
 * calibrated minutes) and session-start prediction (so a new session's
 * plannedMinutes is already calibrated, which is what lets accuracy
 * converge toward 1.0 over time instead of forever comparing against the
 * original raw guess). One query, not duplicated per caller. */
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

  const sessions: SessionRecord[] = rows.map((r) => ({
    className: r.className,
    classColor: r.classColor,
    status: r.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: r.plannedMinutes,
    actualMinutes: r.actualMinutes,
    perceivedDifficulty: r.perceivedDifficulty,
    startedAt: r.startedAt,
  }));

  return buildEstimationProfile(sessions);
}
