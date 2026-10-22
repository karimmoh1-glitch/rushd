import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { planForPrice } from "./stripe";

// Applies verified Stripe events to the Subscription mirror. Idempotent: the
// event id is recorded in the same transaction as the change, so a redelivered
// event is skipped. Entitlements are only ever read from this table.

type Outcome = "applied" | "duplicate" | "ignored";

function periodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

function customerId(c: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

async function userIdForSubscription(sub: Stripe.Subscription, tx: Prisma.TransactionClient): Promise<string | null> {
  const fromMetadata = sub.metadata?.userId;
  if (fromMetadata && (await tx.user.findUnique({ where: { id: fromMetadata }, select: { id: true } }))) return fromMetadata;
  const cust = customerId(sub.customer);
  if (!cust) return null;
  const row = await tx.subscription.findUnique({ where: { stripeCustomerId: cust }, select: { userId: true } });
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
          return applied ? "applied" : "ignored";
        }
        case "checkout.session.completed": {
          // Links the Stripe customer to the user; the subscription events
          // that follow carry the plan.
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id;
          const cust = customerId(session.customer);
          if (!userId || !cust || !(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }))) return "ignored";
          await tx.subscription.upsert({
            where: { userId },
            update: { stripeCustomerId: cust },
            create: { userId, stripeCustomerId: cust, plan: "FREE", status: "incomplete" },
          });
          return "applied";
        }
        default:
          return "ignored";
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}
