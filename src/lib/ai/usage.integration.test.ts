import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { PLANS } from "@/lib/billing/plans";
import { failAi, getUsageSummary, reserveAi, settleAi } from "./usage";

// Real database, real locking. The global budget is raised for the duration
// so other rows in the shared database can't make these tests flaky.
describe("AI usage metering (integration)", { timeout: 120_000 }, () => {
  const userIds: string[] = [];
  // The database is shared: remember operator settings and put them back.
  let saved: { key: string; value: unknown }[] = [];
  beforeEach(async () => {
    saved = await db.appSetting.findMany({ where: { key: { in: ["ai.monthlyBudgetUsd", "ai.enabled"] } } });
    await db.appSetting.upsert({ where: { key: "ai.monthlyBudgetUsd" }, update: { value: 1_000_000 }, create: { key: "ai.monthlyBudgetUsd", value: 1_000_000 } });
  });
  afterEach(async () => {
    await db.aiUsage.deleteMany({ where: { userId: { in: userIds } } });
    await db.aiRejection.deleteMany({ where: { userId: { in: userIds } } });
    await Promise.all(userIds.splice(0).map(deleteTestUser));
    await db.appSetting.deleteMany({ where: { key: { in: ["ai.monthlyBudgetUsd", "ai.enabled"] } } });
    for (const s of saved) await db.appSetting.create({ data: { key: s.key, value: s.value as never } });
  });

  async function user() {
    const u = await createTestUser({ displayName: "Usage" });
    userIds.push(u.id);
    return u.id;
  }

  it("enforces a monthly feature allowance exactly under concurrency", async () => {
    const id = await user();
    const limit = PLANS.FREE.monthly.draft_review;
    // Concurrency 1 on Free would reject in-flight ones; settle as we go.
    const results = await Promise.all(
      Array.from({ length: limit + 3 }, async () => {
        const r = await reserveAi(id, "draft_review");
        if (r.ok) await settleAi(r.usageId, "claude-opus-5-5", { inputTokens: 1000, outputTokens: 100 });
        return r;
      }),
    );
    const accepted = results.filter((r) => r.ok).length;
    expect(accepted).toBeLessThanOrEqual(limit);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && ["monthly_quota", "concurrency"].includes(r.reason))).toBe(true);
    expect(await db.aiUsage.count({ where: { userId: id, feature: "draft_review", status: "completed" } })).toBe(accepted);
  });

  it("allows only the plan's concurrent requests at once", async () => {
    const id = await user();
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveAi(id, "quick_add")));
    expect(results.filter((r) => r.ok)).toHaveLength(PLANS.FREE.maxConcurrent);
  });

  it("settles real cost from token usage; failures before a response cost nothing and don't count", async () => {
    const id = await user();
    const a = await reserveAi(id, "tutor_message");
    if (!a.ok) throw new Error(a.reason);
    await settleAi(a.usageId, "claude-opus-5-5", { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 5_000 });
    const row = await db.aiUsage.findUniqueOrThrow({ where: { id: a.usageId } });
    // 10k × $4 + 1k × $20 + 5k × $0.20 per million = $0.061
    expect(row.costMicros).toBe(61_000);

    const b = await reserveAi(id, "tutor_message");
    if (!b.ok) throw new Error(b.reason);
    await failAi(b.usageId, "timeout");
    const summary = await getUsageSummary(id);
    expect(summary.features.find((f) => f.feature === "tutor_message")?.used).toBe(1);
  });

  it("stops at the monthly cost cap even with count allowance left", async () => {
    const id = await user();
    const a = await reserveAi(id, "tutor_message");
    if (!a.ok) throw new Error(a.reason);
    // One very expensive request uses the whole Free cost cap.
    await settleAi(a.usageId, "claude-opus-5-5", { inputTokens: 300_000, outputTokens: 20_000 });
    const next = await reserveAi(id, "tutor_message");
    expect(next).toMatchObject({ ok: false, reason: "monthly_cost" });
  });

  it("honors the kill switch and the global budget, and records rejections", async () => {
    const id = await user();
    await db.appSetting.upsert({ where: { key: "ai.enabled" }, update: { value: false }, create: { key: "ai.enabled", value: false } });
    expect(await reserveAi(id, "quick_add")).toMatchObject({ ok: false, reason: "disabled" });
    await db.appSetting.delete({ where: { key: "ai.enabled" } });

    await db.appSetting.update({ where: { key: "ai.monthlyBudgetUsd" }, data: { value: 0 } });
    expect(await reserveAi(id, "quick_add")).toMatchObject({ ok: false, reason: "global_budget" });
    expect(await db.aiRejection.count({ where: { userId: id } })).toBe(2);
  });

  it("uses the paid plan's allowances only while the subscription is active", async () => {
    const id = await user();
    await db.subscription.create({ data: { userId: id, plan: "PLUS", status: "canceled" } });
    expect((await getUsageSummary(id)).plan.id).toBe("FREE");
    await db.subscription.update({ where: { userId: id }, data: { status: "active" } });
    expect((await getUsageSummary(id)).plan.id).toBe("PLUS");
  });
});
