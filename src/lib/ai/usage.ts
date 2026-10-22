import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { PLANS, monthlyAllowance, type AiFeature, type Plan, type PlanId } from "@/lib/billing/plans";
import { costMicros, toMicros, type TokenUsage } from "./pricing";
import { BONUS_COST_PER_MESSAGE_USD, BONUS_MESSAGES, referralBonus } from "@/lib/referral/referral";

// Server-side AI metering. Every AI call goes reserve → provider → settle (or
// fail). Reservation happens inside one transaction holding a Postgres
// advisory lock, so concurrent requests can't both slip under a limit. A
// reservation counts its estimated cost until it settles with the cost
// computed from the provider's reported token usage.

/** Upper-bound cost assumed for a request before it runs. */
export const FEATURE_ESTIMATE_USD: Record<AiFeature, number> = {
  tutor_message: 0.2,
  photo_assessment: 0.15,
  draft_review: 0.2,
  quick_add: 0.005,
  screenshot_import: 0.03,
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

type Tx = Prisma.TransactionClient;
type Reader = Tx | typeof db;

export async function getPlanId(userId: string, client: Reader = db): Promise<PlanId> {
  const sub = await client.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } });
  return sub && ACTIVE_STATUSES.includes(sub.status) ? sub.plan : "FREE";
}

export interface AiSettings {
  enabled: boolean;
  monthlyBudgetUsd: number;
}

export async function getAiSettings(client: Reader = db): Promise<AiSettings> {
  const rows = await client.appSetting.findMany({ where: { key: { in: ["ai.enabled", "ai.monthlyBudgetUsd"] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const envBudget = Number(process.env.AI_MONTHLY_BUDGET_USD);
  const stored = byKey.get("ai.monthlyBudgetUsd");
  return {
    // The environment kill switch wins over anything stored in the database.
    enabled: process.env.AI_KILL_SWITCH !== "on" && byKey.get("ai.enabled") !== false,
    monthlyBudgetUsd:
      typeof stored === "number" && stored >= 0 ? stored : Number.isFinite(envBudget) && envBudget >= 0 ? envBudget : DEFAULT_GLOBAL_BUDGET_USD,
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

export async function reserveAi(userId: string, feature: AiFeature, now: Date = new Date()): Promise<Reservation> {
  const estimate = toMicros(FEATURE_ESTIMATE_USD[feature]);
  const outcome = await db.$transaction(
    async (tx): Promise<Reservation> => {
      // One lock for all reservations: they're short, and it makes the
      // global budget check exact as well as the per-user ones.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rushd:ai-reserve'))`;
      const settings = await getAiSettings(tx);
      const reject = (reason: RejectReason): Reservation => ({ ok: false, reason, message: MESSAGES[reason] });
      if (!settings.enabled) return reject("disabled");

      const since = monthStart(now);
      if ((await spendSince(tx, since)) + estimate > toMicros(settings.monthlyBudgetUsd)) return reject("global_budget");

      const plan = PLANS[await getPlanId(userId, tx)];
      const counted = { userId, status: { in: ["reserved", "completed"] } };
      // Invite bonus: extra tutor messages, with the cost room to use them.
      const bonus = await referralBonus(userId, tx);
      const baseAllowance = monthlyAllowance(plan, feature);
      const allowance = baseAllowance === null ? null : baseAllowance + (feature === "tutor_message" ? bonus : 0);
      if (allowance !== null) {
        const used = await tx.aiUsage.count({ where: { ...counted, feature, createdAt: { gte: since } } });
        if (used >= allowance) {
          if (feature !== "tutor_message") return reject("monthly_quota");
          return { ok: false, reason: "monthly_quota", message: `${MESSAGES.monthly_quota} Invite a friend from Settings and you both get ${BONUS_MESSAGES} more tutor messages every month.` };
        }
      }
      const costCap = toMicros(plan.monthlyCostCapUsd + bonus * BONUS_COST_PER_MESSAGE_USD);
      if ((await spendSince(tx, since, userId)) + estimate > costCap) return reject("monthly_cost");
      const today = await tx.aiUsage.count({ where: { ...counted, createdAt: { gte: dayStart(now) } } });
      if (today >= plan.dailyRequests) return reject("daily_limit");
      const inFlight = await tx.aiUsage.count({
        where: { userId, status: "reserved", createdAt: { gte: new Date(now.getTime() - IN_FLIGHT_MS) } },
      });
      if (inFlight >= plan.maxConcurrent) return reject("concurrency");

      const row = await tx.aiUsage.create({
        data: { userId, feature, model: "pending", status: "reserved", estimatedCostMicros: estimate, createdAt: now },
        select: { id: true },
      });
      return { ok: true, usageId: row.id, plan };
    },
    { timeout: 15_000 },
  );
  if (!outcome.ok) {
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
  const used = new Map(counts.map((c) => [c.feature, c._count._all]));
  return {
    plan,
    features: (Object.keys(plan.monthly) as (keyof Plan["monthly"])[]).map((feature) => ({
      feature,
      used: used.get(feature) ?? 0,
      limit: plan.monthly[feature] + (feature === "tutor_message" ? bonus : 0),
    })),
    costUsedFraction: Math.min(1, spent / toMicros(plan.monthlyCostCapUsd + bonus * BONUS_COST_PER_MESSAGE_USD)),
    periodStart: since,
  };
}

export async function globalSpendThisMonth(now: Date = new Date()): Promise<number> {
  return spendSince(db, monthStart(now));
}
