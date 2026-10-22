import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { logEvent } from "@/lib/analytics/log-event";
import { getUsageSummary } from "@/lib/ai/usage";
import { attachReferral, getOrCreateReferralCode, referralBonus, BONUS_MESSAGES } from "./referral";

describe("referrals (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });
  async function user() {
    const u = await createTestUser({ displayName: "Ref" });
    users.push(u.id);
    return u.id;
  }

  it("rewards both students only after the friend studies", async () => {
    const inviter = await user();
    const friend = await user();
    const code = await getOrCreateReferralCode(inviter);
    expect(await getOrCreateReferralCode(inviter)).toBe(code);

    await attachReferral(friend, code);
    expect(await referralBonus(inviter)).toBe(0);

    await logEvent(friend, "dashboard_viewed");
    expect(await referralBonus(inviter)).toBe(0);

    await logEvent(friend, "study_session_completed");
    expect(await referralBonus(inviter)).toBe(BONUS_MESSAGES);
    expect(await referralBonus(friend)).toBe(BONUS_MESSAGES);

    const summary = await getUsageSummary(friend);
    expect(summary.features.find((f) => f.feature === "tutor_message")?.limit).toBe(15 + BONUS_MESSAGES);
  });

  it("ignores self-referral, bad codes, and a second inviter", async () => {
    const a = await user();
    const b = await user();
    const c = await user();
    await attachReferral(a, await getOrCreateReferralCode(a));
    await attachReferral(b, "not a code");
    await attachReferral(b, await getOrCreateReferralCode(a));
    await attachReferral(b, await getOrCreateReferralCode(c));
    const rows = await db.referral.findMany({ where: { referredId: { in: [a, b] } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ referrerId: a, referredId: b });
  });
});
