import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { planForPrice } from "./stripe";

// Applies verified Stripe events to our Subscription table, which is the only
// place entitlements are read from. The event id is saved in the same
// transaction as the change, so a redelivered event is skipped.

type Outcome = "applied" | "duplicate" | "ignored";

/** The latest period end across the subscription's items. */
function periodEnd(sub: Stripe.Subscription): Date | null {
  let latest: number | null = null;
  for (const item of sub.items.data) {
    const end = item.current_period_end;
    if (typeof end !== "number") continue;
    if (latest === null || end > latest) latest = end;
  }
  if (latest === null) return null;
  return new Date(latest * 1000);
}

async function userExists(userId: string, tx: Prisma.TransactionClient): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user !== null;
}

function customerId(c: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

async function userIdForSubscription(sub: Stripe.Subscription, tx: Prisma.TransactionClient): Promise<string | null> {
  const fromMetadata = sub.metadata?.userId;
  if (fromMetadata && (await userExists(fromMetadata, tx))) return fromMetadata;
  // Otherwise find the user through the Stripe customer we linked at checkout.
  const customer = customerId(sub.customer);
  if (!customer) return null;
  const row = await tx.subscription.findUnique({ where: { stripeCustomerId: customer }, select: { userId: true } });
  return row?.userId ?? null;
}

async function applySubscription(sub: Stripe.Subscription, tx: Prisma.TransactionClient): Promise<boolean> {
  const userId = await userIdForSubscription(sub, tx);
  if (!userId) return false;
  const plan = planForPrice(sub.items.data[0]?.price?.id) ?? "FREE";
  const data = {
    plan,
    status: sub.status,
    stripeCustomerId: customerId(sub.customer),
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
  await tx.subscription.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return true;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<Outcome> {
  try {
    return await db.$transaction(async (tx) => {
      // Claim the event first; a second delivery hits the unique key.
      await tx.stripeEvent.create({ data: { id: event.id, type: event.type } });
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.paused":
        case "customer.subscription.resumed": {
          const applied = await applySubscription(event.data.object as Stripe.Subscription, tx);
          if (applied) return "applied";
          return "ignored";
        }
        case "checkout.session.completed": {
          // Links the Stripe customer to the user; the subscription events
          // that follow carry the plan.
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id;
          const customer = customerId(session.customer);
          if (!userId || !customer) return "ignored";
          if (!(await userExists(userId, tx))) return "ignored";
          await tx.subscription.upsert({
            where: { userId },
            update: { stripeCustomerId: customer },
            create: { userId, stripeCustomerId: customer, plan: "FREE", status: "incomplete" },
          });
          return "applied";
        }
        default:
          return "ignored";
      }
    });
  } catch (error) {
    // P2002 = unique constraint: this event id was already processed.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}
