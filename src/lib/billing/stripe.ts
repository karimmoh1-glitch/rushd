import "server-only";
import Stripe from "stripe";
import type { PlanId } from "./plans";

// Billing is off unless the Stripe key, webhook secret and both price ids are set.
// Use test-mode keys (sk_test_...) until live billing is reviewed; nothing here switches modes.

let client: Stripe | null = null;

export function billingConfigured(): boolean {
  const env = process.env;
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_PLUS && env.STRIPE_PRICE_PRO);
}

export function billingMode(): "off" | "test" | "live" {
  if (!billingConfigured()) return "off";
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (secretKey.startsWith("sk_live_")) return "live";
  return "test";
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
