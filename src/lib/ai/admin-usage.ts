import "server-only";
import { db } from "@/lib/db";
import { getAiSettings, globalSpendThisMonth, monthStart } from "./usage";

// Aggregates for the admin AI page. Never includes prompts or content.
export async function getAdminAiUsage(now: Date = new Date()) {
  const since = monthStart(now);
  const [settings, spent, byFeature, byStatus, rejections, topUsers, daily] = await Promise.all([
    getAiSettings(),
    globalSpendThisMonth(now),
    db.$queryRaw<{ feature: string; requests: bigint; micros: bigint | null; input: bigint | null; output: bigint | null }[]>`
      SELECT feature, COUNT(*)::bigint AS requests,
        SUM(CASE WHEN status = 'reserved' THEN "estimatedCostMicros" ELSE COALESCE("costMicros", 0) END)::bigint AS micros,
        SUM("inputTokens")::bigint AS input, SUM("outputTokens")::bigint AS output
      FROM "AiUsage" WHERE "createdAt" >= ${since} GROUP BY feature ORDER BY micros DESC NULLS LAST`,
    db.aiUsage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.aiRejection.groupBy({ by: ["reason"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.$queryRaw<{ email: string | null; micros: bigint; requests: bigint }[]>`
      SELECT u.email, SUM(COALESCE(a."costMicros", a."estimatedCostMicros"))::bigint AS micros, COUNT(*)::bigint AS requests
      FROM "AiUsage" a LEFT JOIN "User" u ON u.id = a."userId"
      WHERE a."createdAt" >= ${since} GROUP BY u.email ORDER BY micros DESC LIMIT 10`,
    db.$queryRaw<{ day: Date; micros: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
        SUM(CASE WHEN status = 'reserved' THEN "estimatedCostMicros" ELSE COALESCE("costMicros", 0) END)::bigint AS micros
      FROM "AiUsage" WHERE "createdAt" >= ${new Date(now.getTime() - 30 * 86400000)} GROUP BY 1 ORDER BY 1`,
  ]);
  return {
    settings,
    spentMicros: spent,
    byFeature: byFeature.map((f) => ({ feature: f.feature, requests: Number(f.requests), micros: Number(f.micros ?? 0), input: Number(f.input ?? 0), output: Number(f.output ?? 0) })),
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>,
    rejections: rejections.map((r) => ({ reason: r.reason, count: r._count._all })),
    topUsers: topUsers.map((u) => ({ email: u.email ?? "(deleted)", micros: Number(u.micros), requests: Number(u.requests) })),
    daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), micros: Number(d.micros) })),
  };
}
