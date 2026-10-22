import "server-only";
import { db } from "@/lib/db";

// Admin-only product metrics from first-party data: public page counts,
// account milestones from the Event table, and weekly cohort retention.

const MEANINGFUL = ["assessment_completed", "tutor_message", "draft_reviewed", "assignment_created", "canvas_synced", "study_session_completed"];

export interface Funnel {
  sinceDays: number;
  homeViews: number;
  tryRanked: number;
  trySaved: number;
  signupViews: number;
  signups: number;
  tryImported: number;
  onboarded: number;
  firstMeaningful: number;
  firstAssessment: number;
  firstTutor: number;
  returned: number;
  paid: number;
}

export async function getFunnel(sinceDays = 30): Promise<Funnel> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const views = await db.pageView.groupBy({ by: ["path"], where: { day: { gte: since } }, _sum: { count: true } });
  const viewsOf = (p: string) => views.find((v) => v.path === p)?._sum.count ?? 0;
  const cohort = await db.user.findMany({ where: { createdAt: { gte: since } }, select: { id: true } });
  const ids = cohort.map((u) => u.id);
  const reached = async (names: string[]) =>
    ids.length === 0
      ? 0
      : (await db.event.groupBy({ by: ["userId"], where: { userId: { in: ids }, name: { in: names } } })).length;
  // Came back: activity on a later UTC day than the signup day.
  const returnedRows = ids.length
    ? await db.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT e."userId")::bigint AS n
        FROM "Event" e JOIN "User" u ON u.id = e."userId"
        WHERE u."createdAt" >= ${since} AND e."createdAt"::date > u."createdAt"::date`
    : [{ n: BigInt(0) }];
  return {
    sinceDays,
    homeViews: viewsOf("/"),
    tryRanked: viewsOf("#try"),
    trySaved: viewsOf("#try-save"),
    signupViews: viewsOf("/signup"),
    signups: ids.length,
    tryImported: await reached(["try_week_imported"]),
    onboarded: await reached(["onboarding_completed"]),
    firstMeaningful: await reached(MEANINGFUL),
    firstAssessment: await reached(["assessment_completed"]),
    firstTutor: await reached(["tutor_message"]),
    returned: Number(returnedRows[0]?.n ?? 0),
    paid: ids.length ? await db.subscription.count({ where: { userId: { in: ids }, status: { in: ["active", "trialing"] }, plan: { not: "FREE" } } }) : 0,
  };
}

export interface CohortRow {
  week: string;
  users: number;
  week1: number;
  week2: number;
  week4: number;
}

/** Share of each weekly signup cohort with any activity in weeks 1, 2 and 4 after signup. */
export async function getCohorts(weeks = 8): Promise<CohortRow[]> {
  const rows = await db.$queryRaw<{ week: Date; users: bigint; w1: bigint; w2: bigint; w4: bigint }[]>`
    WITH cohort AS (
      SELECT id, "createdAt", date_trunc('week', "createdAt") AS week FROM "User"
      WHERE "createdAt" >= now() - (${weeks} * interval '1 week')
    ),
    activity AS (
      SELECT c.id, c.week, floor(extract(epoch FROM (e."createdAt" - c."createdAt")) / 604800)::int AS wk
      FROM cohort c JOIN "Event" e ON e."userId" = c.id
    )
    SELECT c.week,
      COUNT(DISTINCT c.id)::bigint AS users,
      COUNT(DISTINCT a.id) FILTER (WHERE a.wk = 1)::bigint AS w1,
      COUNT(DISTINCT a.id) FILTER (WHERE a.wk = 2)::bigint AS w2,
      COUNT(DISTINCT a.id) FILTER (WHERE a.wk = 4)::bigint AS w4
    FROM cohort c LEFT JOIN activity a ON a.id = c.id
    GROUP BY c.week ORDER BY c.week DESC`;
  return rows.map((r) => ({
    week: r.week.toISOString().slice(0, 10),
    users: Number(r.users),
    week1: Number(r.w1),
    week2: Number(r.w2),
    week4: Number(r.w4),
  }));
}

export interface Recurring {
  /** Active (a meaningful action) in at least 2 of the last 4 weeks: the 10k goal's metric. */
  recurring: number;
  activeThisWeek: number;
  activeLastWeek: number;
  /** Of last week's active students, the share active again this week. */
  retainedPct: number | null;
}

export async function getRecurring(now = new Date()): Promise<Recurring> {
  const WEEK = 7 * 86_400_000;
  const since = new Date(now.getTime() - 4 * WEEK);
  const rows = await db.$queryRaw<{ userId: string; week: number }[]>`
    SELECT DISTINCT e."userId", FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - e."createdAt")) / 604800)::int AS week
    FROM "Event" e
    WHERE e."createdAt" >= ${since} AND e.name = ANY(${MEANINGFUL})`;
  const weeks = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!weeks.has(r.userId)) weeks.set(r.userId, new Set());
    weeks.get(r.userId)!.add(Number(r.week));
  }
  let recurring = 0;
  let thisWeek = 0;
  let lastWeek = 0;
  let retained = 0;
  for (const set of weeks.values()) {
    if (set.size >= 2) recurring++;
    if (set.has(0)) thisWeek++;
    if (set.has(1)) {
      lastWeek++;
      if (set.has(0)) retained++;
    }
  }
  return { recurring, activeThisWeek: thisWeek, activeLastWeek: lastWeek, retainedPct: lastWeek ? Math.round((retained / lastWeek) * 100) : null };
}
