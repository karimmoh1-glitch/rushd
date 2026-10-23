import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ACTIVE_EVENTS, SETUP_EVENTS, STUDY_EVENTS } from "./events";

// Admin-only growth metrics. Public steps are cookieless page counts; account
// steps come from the Event table. Test and staff accounts are excluded
// everywhere, and only real student actions count as activity (see events.ts).

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** SQL filter for real students, for a "User" aliased as u. */
const REAL = Prisma.sql`u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'`;

export interface Growth {
  sinceDays: number;
  // Public, anonymous (unique browsers per day, summed over the window).
  visitors: number;
  plannerStarts: number;
  rankings: number;
  saves: number;
  shares: number;
  toolVisits: number;
  examPlans: number;
  signupPage: number;
  referralVisits: number;
  // Accounts created in the window.
  signups: number;
  onboarded: number;
  firstSetup: number;
  firstStudy: number;
  importedWeek: number;
  /** Active on the day after signup; out of students at least 2 days old. */
  day1: { active: number; eligible: number };
  /** Active in days 7-13 after signup; out of students at least 14 days old. */
  day7: { active: number; eligible: number };
  referralsJoined: number;
  referralsActivated: number;
  paid: number;
}

type CohortMember = { id: string; createdAt: Date; onboarded: boolean };
type PageViewTotal = { path: string; _sum: { count: number | null } };

/** Total views over the given paths. */
function sumViews(views: PageViewTotal[], paths: string[]): number {
  let total = 0;
  for (const path of paths) {
    const row = views.find((v) => v.path === path);
    total += row?._sum.count ?? 0;
  }
  return total;
}

/** How many of these users have at least one event with one of these names. */
async function usersWhoReached(userIds: string[], eventNames: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const groups = await db.event.groupBy({ by: ["userId"], where: { userId: { in: userIds }, name: { in: eventNames } } });
  return groups.length;
}

/** Day-N retention, measured from each student's own signup time: active between
 * fromDays and toDays after signup, out of students at least minAgeDays old. */
async function activeBetween(cohort: CohortMember[], now: Date, fromDays: number, toDays: number, minAgeDays: number) {
  const eligibleIds: string[] = [];
  for (const member of cohort) {
    const ageMs = now.getTime() - member.createdAt.getTime();
    if (ageMs >= minAgeDays * DAY) eligibleIds.push(member.id);
  }
  if (eligibleIds.length === 0) return { active: 0, eligible: 0 };

  const rows = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT u.id)::bigint AS n
      FROM "User" u JOIN "Event" e ON e."userId" = u.id
      WHERE u.id = ANY(${eligibleIds})
        AND e.name = ANY(${ACTIVE_EVENTS})
        AND e."createdAt" >= u."createdAt" + (${fromDays} * interval '1 day')
        AND e."createdAt" <  u."createdAt" + (${toDays} * interval '1 day')`;
  return { active: Number(rows[0]?.n ?? 0), eligible: eligibleIds.length };
}

async function countPaid(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  return db.subscription.count({ where: { userId: { in: userIds }, status: { in: ["active", "trialing"] }, plan: { not: "FREE" } } });
}

/** `userIds` (tests only) limits the account steps to those users, test accounts included. */
export async function getGrowth(sinceDays = 30, now = new Date(), opts: { userIds?: string[] } = {}): Promise<Growth> {
  const since = new Date(now.getTime() - sinceDays * DAY);
  const views = await db.pageView.groupBy({ by: ["path"], where: { day: { gte: since } }, _sum: { count: true } });

  const who = opts.userIds ? Prisma.sql`u.id = ANY(${opts.userIds})` : REAL;
  const cohort = await db.$queryRaw<CohortMember[]>`
    SELECT u.id, u."createdAt", (u."onboardingCompletedAt" IS NOT NULL) AS onboarded
    FROM "User" u WHERE u."createdAt" >= ${since} AND ${who}`;
  const ids = cohort.map((c) => c.id);
  let onboarded = 0;
  for (const member of cohort) {
    if (member.onboarded) onboarded++;
  }

  const referrals = await db.$queryRaw<{ joined: bigint; activated: bigint }[]>`
    SELECT COUNT(*)::bigint AS joined, COUNT(r."qualifiedAt")::bigint AS activated
    FROM "Referral" r JOIN "User" u ON u.id = r."referredId"
    WHERE r."createdAt" >= ${since} AND ${who}`;

  return {
    sinceDays,
    visitors: sumViews(views, ["/"]),
    plannerStarts: sumViews(views, ["#try-start"]),
    rankings: sumViews(views, ["#try"]),
    saves: sumViews(views, ["#try-save"]),
    shares: sumViews(views, ["#try-share"]),
    toolVisits: sumViews(views, ["/tools", "/tools/rank-my-week", "/tools/exam-study-planner"]),
    examPlans: sumViews(views, ["#exam-plan"]),
    signupPage: sumViews(views, ["/signup"]),
    referralVisits: sumViews(views, ["#ref-visit"]),
    signups: ids.length,
    onboarded,
    firstSetup: await usersWhoReached(ids, SETUP_EVENTS),
    firstStudy: await usersWhoReached(ids, STUDY_EVENTS),
    importedWeek: await usersWhoReached(ids, ["try_week_imported"]),
    day1: await activeBetween(cohort, now, 1, 2, 2),
    day7: await activeBetween(cohort, now, 7, 14, 14),
    referralsJoined: Number(referrals[0]?.joined ?? 0),
    referralsActivated: Number(referrals[0]?.activated ?? 0),
    paid: await countPaid(ids),
  };
}

export interface CohortRow {
  week: string;
  users: number;
  week1: number;
  week2: number;
  week4: number;
}

/** Share of each weekly signup cohort that was active (real student actions) in weeks 1, 2 and 4 after signup. */
export async function getCohorts(weeks = 8): Promise<CohortRow[]> {
  const rows = await db.$queryRaw<{ week: Date; users: bigint; w1: bigint; w2: bigint; w4: bigint }[]>`
    WITH cohort AS (
      SELECT u.id, u."createdAt", date_trunc('week', u."createdAt") AS week FROM "User" u
      WHERE u."createdAt" >= now() - (${weeks} * interval '1 week') AND ${REAL}
    ),
    activity AS (
      SELECT c.id, floor(extract(epoch FROM (e."createdAt" - c."createdAt")) / 604800)::int AS wk
      FROM cohort c JOIN "Event" e ON e."userId" = c.id
      WHERE e.name = ANY(${ACTIVE_EVENTS})
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
  /** Active in at least 2 of the last 4 weeks: the growth goal's metric. */
  recurring: number;
  activeThisWeek: number;
  activeLastWeek: number;
  /** Of last week's active students, the share active again this week. */
  retainedPct: number | null;
}

export async function getRecurring(now = new Date()): Promise<Recurring> {
  const since = new Date(now.getTime() - 4 * WEEK);
  const rows = await db.$queryRaw<{ userId: string; week: number }[]>`
    SELECT DISTINCT e."userId", FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - e."createdAt")) / 604800)::int AS week
    FROM "Event" e JOIN "User" u ON u.id = e."userId"
    WHERE e."createdAt" >= ${since} AND e.name = ANY(${ACTIVE_EVENTS}) AND ${REAL}`;
  // Week 0 is this week, week 1 last week, and so on.
  const activeWeeksByUser = new Map<string, Set<number>>();
  for (const row of rows) {
    let weeks = activeWeeksByUser.get(row.userId);
    if (!weeks) {
      weeks = new Set();
      activeWeeksByUser.set(row.userId, weeks);
    }
    weeks.add(Number(row.week));
  }

  let recurring = 0;
  let thisWeek = 0;
  let lastWeek = 0;
  let retained = 0;
  for (const weeks of activeWeeksByUser.values()) {
    if (weeks.size >= 2) recurring++;
    if (weeks.has(0)) thisWeek++;
    if (weeks.has(1)) {
      lastWeek++;
      if (weeks.has(0)) retained++;
    }
  }

  let retainedPct: number | null = null;
  if (lastWeek > 0) retainedPct = Math.round((retained / lastWeek) * 100);
  return { recurring, activeThisWeek: thisWeek, activeLastWeek: lastWeek, retainedPct };
}
