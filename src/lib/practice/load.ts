import "server-only";
import { db } from "@/lib/db";
import { computeMastery, type TopicMastery } from "./mastery";

/** The signed-in student's topic mastery, computed from their own evidence. */
export async function getMastery(userId: string, now: Date = new Date()): Promise<TopicMastery[]> {
  const rows = await db.masteryEvidence.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 2000,
    select: { topicKey: true, topicLabel: true, classId: true, score: true, weight: true, createdAt: true },
  });
  return computeMastery(rows, now);
}
