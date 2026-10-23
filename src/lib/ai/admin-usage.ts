import "server-only";
import { db } from "@/lib/db";
import { getAiSettings, globalSpendThisMonth, monthStart } from "./usage";

// Aggregates for the admin AI page. Never includes prompts or content.

const DAY_MS = 86400000;

type FeatureRow = { feature: string; requests: bigint; micros: bigint | null; input: bigint | null; output: bigint | null };
type TopUserRow = { email: string | null; micros: bigint; requests: bigint };
type DailyRow = { day: Date; micros: bigint };

function spendByFeature(since: Date) {
  return db.$queryRaw<FeatureRow[]>`
      SELECT feature, COUNT(*)::bigint AS requests,
        SUM(CASE WHEN status = 'reserved' THEN "estimatedCostMicros" ELSE COALESCE("costMicros", 0) END)::bigint AS micros,
        SUM("inputTokens")::bigint AS input, SUM("outputTokens")::bigint AS output
      FROM "AiUsage" WHERE "createdAt" >= ${since} GROUP BY feature ORDER BY micros DESC NULLS LAST`;
}

function topSpenders(since: Date) {
  return db.$queryRaw<TopUserRow[]>`
      SELECT u.email, SUM(COALESCE(a."costMicros", a."estimatedCostMicros"))::bigint AS micros, COUNT(*)::bigint AS requests
      FROM "AiUsage" a LEFT JOIN "User" u ON u.id = a."userId"
      WHERE a."createdAt" >= ${since} GROUP BY u.email ORDER BY micros DESC LIMIT 10`;
}

function dailySpend(since: Date) {
  return db.$queryRaw<DailyRow[]>`
      SELECT date_trunc('day', "createdAt") AS day,
        SUM(CASE WHEN status = 'reserved' THEN "estimatedCostMicros" ELSE COALESCE("costMicros", 0) END)::bigint AS micros
      FROM "AiUsage" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`;
}

export async function getAdminAiUsage(now: Date = new Date()) {
  const since = monthStart(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const [settings, spent, byFeature, byStatus, rejections, topUsers, daily] = await Promise.all([
    getAiSettings(),
    globalSpendThisMonth(now),
    spendByFeature(since),
    db.aiUsage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.aiRejection.groupBy({ by: ["reason"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    topSpenders(since),
    dailySpend(thirtyDaysAgo),
  ]);

  const requestsByStatus: Record<string, number> = {};
  for (const row of byStatus) requestsByStatus[row.status] = row._count._all;

  return {
    settings,
    spentMicros: spent,
    byFeature: byFeature.map((row) => ({
      feature: row.feature,
      requests: Number(row.requests),
      micros: Number(row.micros ?? 0),
      input: Number(row.input ?? 0),
      output: Number(row.output ?? 0),
    })),
    byStatus: requestsByStatus,
    rejections: rejections.map((row) => ({ reason: row.reason, count: row._count._all })),
    topUsers: topUsers.map((row) => ({
      email: row.email ?? "(deleted)",
      micros: Number(row.micros),
      requests: Number(row.requests),
    })),
    daily: daily.map((row) => ({ day: row.day.toISOString().slice(0, 10), micros: Number(row.micros) })),
  };
}
