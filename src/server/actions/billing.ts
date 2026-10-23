"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { logEvent } from "@/lib/analytics/log-event";
import { billingConfigured, priceIdFor, stripe } from "@/lib/billing/stripe";
import { getPlanId } from "@/lib/ai/usage";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { log } from "@/lib/log";
import { currentRequestId } from "@/lib/request-id";

const PaidPlan = z.enum(["PLUS", "PRO"]);
/** Each attempt creates objects at Stripe, so a script must not be able to loop it. */
const BILLING_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

/** The user's Stripe customer id, creating the Stripe customer the first time. */
async function getOrCreateStripeCustomer(user: { id: string; email: string }): Promise<string> {
  const existing = await db.subscription.findUnique({ where: { userId: user.id }, select: { stripeCustomerId: true } });
  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }
  const customer = await stripe().customers.create({ email: user.email, metadata: { userId: user.id } });
  await db.subscription.upsert({
    where: { userId: user.id },
    update: { stripeCustomerId: customer.id },
    create: { userId: user.id, stripeCustomerId: customer.id, plan: "FREE", status: "none" },
  });
  return customer.id;
}

/** Starts Stripe Checkout for a paid plan. The plan only changes when the
 * verified webhook says the subscription is active. */
export async function startCheckout(plan: string): Promise<{ error: string } | void> {
  const user = await requireUserOrThrow();
  if (!billingConfigured()) {
    return { error: "Paid plans aren't open yet." };
  }
  const parsed = PaidPlan.safeParse(plan);
  if (!parsed.success) {
    return { error: "Unknown plan." };
  }
  const currentPlan = await getPlanId(user.id);
  if (currentPlan !== "FREE") {
    return { error: "You already have a paid plan. Manage it from Settings." };
  }

  const rate = await checkRateLimit(`checkout:${user.id}`, BILLING_LIMIT);
  if (!rate.allowed) {
    return { error: "Too many checkout attempts. Try again in a few minutes." };
  }

  let sessionUrl: string | null;
  try {
    const customerId = await getOrCreateStripeCustomer(user);
    const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(parsed.data), quantity: 1 }],
    subscription_data: { metadata: { userId: user.id } },
    allow_promotion_codes: true,
    success_url: `${env.NEXT_PUBLIC_APP_URL}/settings?billing=success#plan`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
    });
    sessionUrl = session.url;
  } catch (error) {
    log.error("billing.checkout_failed", { requestId: await currentRequestId(), err: error });
    return { error: "Couldn't reach the payment provider. Try again in a minute." };
  }
  await logEvent(user.id, "checkout_started", { plan: parsed.data });
  if (!sessionUrl) {
    return { error: "Couldn't start checkout. Try again." };
  }
  redirect(sessionUrl);
}

/** Opens Stripe's customer portal to change or cancel a plan. */
export async function openBillingPortal(): Promise<{ error: string } | void> {
  const user = await requireUserOrThrow();
  if (!billingConfigured()) {
    return { error: "Billing isn't available." };
  }
  const subscription = await db.subscription.findUnique({ where: { userId: user.id }, select: { stripeCustomerId: true } });
  if (!subscription?.stripeCustomerId) {
    return { error: "No billing account yet." };
  }
  const rate = await checkRateLimit(`billing-portal:${user.id}`, BILLING_LIMIT);
  if (!rate.allowed) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  let portalUrl: string;
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings#plan`,
    });
    portalUrl = portal.url;
  } catch (error) {
    log.error("billing.portal_failed", { requestId: await currentRequestId(), err: error });
    return { error: "Couldn't reach the payment provider. Try again in a minute." };
  }
  redirect(portalUrl);
}
