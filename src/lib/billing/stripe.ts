import "server-only";
import Stripe from "stripe";
import type { PlanId } from "./plans";

// Billing is off unless the server has a Stripe secret key, a webhook secret,
// and price ids for the paid plans. Use test-mode keys (sk_test_...) until
// live billing has been reviewed; nothing here switches modes by itself.

let client: Stripe | null = null;

export function billingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_PLUS && process.env.STRIPE_PRICE_PRO,
  );
}

export function billingMode(): "off" | "test" | "live" {
  if (!billingConfigured()) return "off";
  return process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_") ? "live" : "test";
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

export function priceIdFor(plan: Exclude<PlanId, "FREE">): string {
  const id = plan === "PLUS" ? process.env.STRIPE_PRICE_PLUS : process.env.STRIPE_PRICE_PRO;
  if (!id) throw new Error("Stripe price not configured");
  return id;
}

export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PLUS) return "PLUS";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  return null;
}
