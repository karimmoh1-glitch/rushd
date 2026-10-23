import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { PLANS, monthlyAllowance, type AiFeature, type Plan, type PlanId } from "@/lib/billing/plans";
import { costMicros, toMicros, type TokenUsage } from "./pricing";
import { BONUS_COST_PER_MESSAGE_USD, BONUS_MESSAGES, referralBonus } from "@/lib/referral/referral";

// Server-side AI metering. Every AI call goes reserve -> provider -> settle (or fail).
// Reserving runs in one transaction under a Postgres advisory lock, so two
// concurrent requests can't both slip under a limit. A reservation counts its
// estimated cost until it settles with the real cost.

/** Upper-bound cost assumed for a request before it runs. */
const FEATURE_ESTIMATE_USD: Record<AiFeature, number> = {
  tutor_message: 0.2,
  photo_assessment: 0.15,
  draft_review: 0.2,
  quick_add: 0.005,
  screenshot_import: 0.03,
  practice_questions: 0.08,
};

/** A reservation older than this no longer blocks concurrency (its cost still counts). */
const IN_FLIGHT_MS = 3 * 60 * 1000;
const DEFAULT_GLOBAL_BUDGET_USD = 25;
const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export type RejectReason = "disabled" | "global_budget" | "monthly_quota" | "monthly_cost" | "daily_limit" | "concurrency";

export type Reservation = { ok: true; usageId: string; plan: Plan } | { ok: false; reason: RejectReason; message: string };

const MESSAGES: Record<RejectReason, string> = {
  disabled: "AI features are paused right now. Everything else in Rushd still works.",
  global_budget: "Rushd's AI features have reached this month's capacity. They'll be back soon; everything else still works.",
  monthly_quota: "You've used this month's allowance for this feature.",
  monthly_cost: "You've reached this month's AI allowance on your plan.",
  daily_limit: "You've reached today's AI limit. It resets at midnight UTC.",
  concurrency: "Another AI request is still running. Wait for it to finish.",
};

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Either the main client or a transaction client. */
type Reader = Prisma.TransactionClient | typeof db;

export async function getPlanId(userId: string, client: Reader = db): Promise<PlanId> {
  const sub = await client.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } });
  if (sub && ACTIVE_STATUSES.includes(sub.status)) return sub.plan;
  return "FREE";
}

export interface AiSettings {
  enabled: boolean;
  monthlyBudgetUsd: number;
}

/** The stored budget wins, then the AI_MONTHLY_BUDGET_USD env var, then the default. */
function chooseMonthlyBudget(stored: unknown): number {
  if (typeof stored === "number" && stored >= 0) return stored;
  const envBudget = Number(process.env.AI_MONTHLY_BUDGET_USD);
  if (Number.isFinite(envBudget) && envBudget >= 0) return envBudget;
  return DEFAULT_GLOBAL_BUDGET_USD;
}

export async function getAiSettings(client: Reader = db): Promise<AiSettings> {
  const rows = await client.appSetting.findMany({ where: { key: { in: ["ai.enabled", "ai.monthlyBudgetUsd"] } } });
  let storedEnabled: unknown = undefined;
  let storedBudget: unknown = undefined;
  for (const row of rows) {
    if (row.key === "ai.enabled") storedEnabled = row.value;
    if (row.key === "ai.monthlyBudgetUsd") storedBudget = row.value;
  }
  // The environment kill switch wins over anything stored in the database.
  const killSwitchOn = process.env.AI_KILL_SWITCH === "on";
  return {
    enabled: !killSwitchOn && storedEnabled !== false,
    monthlyBudgetUsd: chooseMonthlyBudget(storedBudget),
  };
}

/** Spend in micro-dollars since `since`: settled cost where known, the
 * estimate for anything still reserved. Optionally for one user. */
async function spendSince(client: Reader, since: Date, userId?: string): Promise<number> {
  const userFilter = userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty;
  const rows = await client.$queryRaw<{ micros: bigint | null }[]>`
    SELECT SUM(CASE WHEN status = 'reserved' THEN "estimatedCostMicros" ELSE COALESCE("costMicros", 0) END)::bigint AS micros
    FROM "AiUsage" WHERE "createdAt" >= ${since} ${userFilter}`;
  return Number(rows[0]?.micros ?? 0);
}

function reject(reason: RejectReason): Reservation {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** The tutor quota message also points to the invite bonus. */
function tutorQuotaRejection(): Reservation {
  return {
    ok: false,
    reason: "monthly_quota",
    message: `${MESSAGES.monthly_quota} Invite a friend from Settings and you both get ${BONUS_MESSAGES} more tutor messages every month.`,
  };
}

/** The plan's monthly count for a feature, plus invite bonus messages for the tutor. Null = no monthly count. */
function allowanceWithBonus(plan: Plan, feature: AiFeature, bonus: number): number | null {
  const baseAllowance = monthlyAllowance(plan, feature);
  if (baseAllowance === null) return null;
  if (feature === "tutor_message") return baseAllowance + bonus;
  return baseAllowance;
}

/** The plan's monthly cost cap, raised so invite bonus messages are usable. */
function costCapMicros(plan: Plan, bonus: number): number {
  return toMicros(plan.monthlyCostCapUsd + bonus * BONUS_COST_PER_MESSAGE_USD);
}

/** Runs every limit check and, if all pass, records a reservation. Must run inside the locked transaction. */
async function checkLimitsAndReserve(tx: Prisma.TransactionClient, userId: string, feature: AiFeature, now: Date): Promise<Reservation> {
  const estimate = toMicros(FEATURE_ESTIMATE_USD[feature]);

  const settings = await getAiSettings(tx);
  if (!settings.enabled) return reject("disabled");

  const since = monthStart(now);
  const globalSpent = await spendSince(tx, since);
  if (globalSpent + estimate > toMicros(settings.monthlyBudgetUsd)) return reject("global_budget");

  const plan = PLANS[await getPlanId(userId, tx)];
  const countedStatuses = { in: ["reserved", "completed"] };
  // Invite bonus: extra tutor messages, with the cost room to use them.
  const bonus = await referralBonus(userId, tx);

  const allowance = allowanceWithBonus(plan, feature, bonus);
  if (allowance !== null) {
    const usedThisMonth = await tx.aiUsage.count({
      where: { userId, status: countedStatuses, feature, createdAt: { gte: since } },
    });
    if (usedThisMonth >= allowance) {
      if (feature === "tutor_message") return tutorQuotaRejection();
      return reject("monthly_quota");
    }
  }

  const userSpent = await spendSince(tx, since, userId);
  if (userSpent + estimate > costCapMicros(plan, bonus)) return reject("monthly_cost");

  const usedToday = await tx.aiUsage.count({
    where: { userId, status: countedStatuses, createdAt: { gte: dayStart(now) } },
  });
  if (usedToday >= plan.dailyRequests) return reject("daily_limit");

  const inFlightSince = new Date(now.getTime() - IN_FLIGHT_MS);
  const inFlight = await tx.aiUsage.count({
    where: { userId, status: "reserved", createdAt: { gte: inFlightSince } },
  });
  if (inFlight >= plan.maxConcurrent) return reject("concurrency");

  const row = await tx.aiUsage.create({
    data: { userId, feature, model: "pending", status: "reserved", estimatedCostMicros: estimate, createdAt: now },
    select: { id: true },
  });
  return { ok: true, usageId: row.id, plan };
}

export async function reserveAi(userId: string, feature: AiFeature, now: Date = new Date()): Promise<Reservation> {
  const outcome = await db.$transaction(
    async (tx) => {
      // One lock for all reservations: they're short, and it makes the
      // global budget check exact as well as the per-user ones.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rushd:ai-reserve'))`;
      return checkLimitsAndReserve(tx, userId, feature, now);
    },
    { timeout: 15_000 },
  );
  if (!outcome.ok) {
    // Best effort: a failed log must not hide the rejection from the student.
    await db.aiRejection.create({ data: { userId, feature, reason: outcome.reason } }).catch(() => {});
  }
  return outcome;
}

export async function settleAi(usageId: string, model: string, usage: TokenUsage): Promise<void> {
  await db.aiUsage.update({
    where: { id: usageId },
    data: {
      status: "completed",
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      costMicros: costMicros(model, usage),
      completedAt: new Date(),
    },
  });
}

/** Marks a request failed. Pass the usage when the provider reported any
 * (the tokens were billed); a failure before any response costs nothing. */
export async function failAi(usageId: string, errorType: string, model = "unknown", usage?: TokenUsage): Promise<void> {
  await db.aiUsage.update({
    where: { id: usageId },
    data: {
      status: "failed",
      model,
      errorType: errorType.slice(0, 60),
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      costMicros: usage ? costMicros(model, usage) : 0,
      completedAt: new Date(),
    },
  });
}

export interface UsageSummary {
  plan: Plan;
  features: { feature: keyof Plan["monthly"]; used: number; limit: number }[];
  costUsedFraction: number;
  periodStart: Date;
}

/** What a student sees about their own usage. Never another user's. */
export async function getUsageSummary(userId: string, now: Date = new Date()): Promise<UsageSummary> {
  const since = monthStart(now);
  const plan = PLANS[await getPlanId(userId)];
  const [counts, spent, bonus] = await Promise.all([
    db.aiUsage.groupBy({
      by: ["feature"],
      where: { userId, status: { in: ["reserved", "completed"] }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    spendSince(db, since, userId),
    referralBonus(userId),
  ]);
  const usedByFeature = new Map<string, number>();
  for (const row of counts) usedByFeature.set(row.feature, row._count._all);

  const features: UsageSummary["features"] = [];
  const monthlyFeatures = Object.keys(plan.monthly) as (keyof Plan["monthly"])[];
  for (const feature of monthlyFeatures) {
    let limit = plan.monthly[feature];
    if (feature === "tutor_message") limit += bonus;
    features.push({ feature, used: usedByFeature.get(feature) ?? 0, limit });
  }

  return {
    plan,
    features,
    costUsedFraction: Math.min(1, spent / costCapMicros(plan, bonus)),
    periodStart: since,
  };
}

export async function globalSpendThisMonth(now: Date = new Date()): Promise<number> {
  return spendSince(db, monthStart(now));
}
