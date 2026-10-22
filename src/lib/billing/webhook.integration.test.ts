import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { getPlanId } from "@/lib/ai/usage";

// Real route handler + database with signed test payloads (no network: the
// signature is generated locally with a test secret, as Stripe documents).
const SECRET = "whsec_test_integration_secret";
const env = { STRIPE_SECRET_KEY: "sk_test_integration", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_PLUS: "price_plus_test", STRIPE_PRICE_PRO: "price_pro_test" };
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  for (const k of Object.keys(env)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const { POST } = await import("@/app/api/stripe/webhook/route");
const signer = new Stripe("sk_test_integration");

function subscriptionEvent(id: string, type: string, userId: string, price: string, status: string) {
  return {
    id,
    object: "event",
    type,
    data: {
      object: {
        id: `sub_${userId}`,
        object: "subscription",
        customer: `cus_${userId}`,
        status,
        cancel_at_period_end: false,
        metadata: { userId },
        items: { object: "list", data: [{ id: "si_1", price: { id: price }, current_period_end: 1_800_000_000 }] },
      },
    },
  };
}

async function deliver(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = signer.webhooks.generateTestHeaderString({ payload: body, secret });
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } }));
}

describe("Stripe webhook (integration)", { timeout: 60_000 }, () => {
  const userIds: string[] = [];
  const eventIds: string[] = [];
  afterEach(async () => {
    await db.stripeEvent.deleteMany({ where: { id: { in: eventIds.splice(0) } } });
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });
  const ev = (suffix: string) => {
    const id = `evt_test_${Date.now()}_${suffix}`;
    eventIds.push(id);
    return id;
  };

  it("rejects unsigned or wrongly signed requests", async () => {
    const res = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    const forged = await deliver(subscriptionEvent(ev("forged"), "customer.subscription.created", "x", "price_pro_test", "active"), "whsec_wrong");
    expect(forged.status).toBe(400);
  });

  it("grants the plan from the price, once, and removes it on cancellation", async () => {
    const user = await createTestUser({ displayName: "Billing" });
    userIds.push(user.id);
    const created = subscriptionEvent(ev("created"), "customer.subscription.created", user.id, "price_plus_test", "active");
    expect(await (await deliver(created)).json()).toMatchObject({ outcome: "applied" });
    expect(await getPlanId(user.id)).toBe("PLUS");
    const row = await db.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.currentPeriodEnd?.getTime()).toBe(1_800_000_000_000);

    // Redelivery of the same event is a no-op.
    expect(await (await deliver(created)).json()).toMatchObject({ outcome: "duplicate" });

    await deliver(subscriptionEvent(ev("deleted"), "customer.subscription.deleted", user.id, "price_plus_test", "canceled"));
    expect(await getPlanId(user.id)).toBe("FREE");
  });

  it("never grants a paid plan for an unknown price", async () => {
    const user = await createTestUser({ displayName: "Billing2" });
    userIds.push(user.id);
    await deliver(subscriptionEvent(ev("unknown"), "customer.subscription.created", user.id, "price_someone_elses", "active"));
    expect(await getPlanId(user.id)).toBe("FREE");
  });
});
