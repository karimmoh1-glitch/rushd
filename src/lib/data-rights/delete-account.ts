import "server-only";
import { db } from "@/lib/db";
import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { log } from "@/lib/log";

// Deleting an account removes every row tied to the user (schema cascades,
// checked by delete-account.integration.test.ts) and also:
// - deletes the Stripe customer, which cancels any subscription at once, so a
//   deleted student is never charged again (the cascade alone would only drop
//   our copy of the subscription);
// - deletes AiRejection rows, which hold a userId without a foreign key.
// AiUsage rows are kept with userId set to NULL (anonymous spend accounting).

const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

export type StripeCustomerDeleter = (customerId: string) => Promise<void>;

const deleteStripeCustomer: StripeCustomerDeleter = async (customerId) => {
  await stripe().customers.del(customerId);
};

export async function deleteUserAccount(
  userId: string,
  deps: { deleteCustomer?: StripeCustomerDeleter; billingOn?: boolean } = {},
): Promise<DeleteAccountResult> {
  const billingOn = deps.billingOn ?? billingConfigured();
  const deleteCustomer = deps.deleteCustomer ?? deleteStripeCustomer;

  const subscription = await db.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true, status: true },
  });
  if (subscription?.stripeCustomerId) {
    if (billingOn) {
      try {
        await deleteCustomer(subscription.stripeCustomerId);
      } catch (error) {
        // Stripe says the customer is already gone: nothing left to cancel.
        const code = (error as { code?: string })?.code;
        if (code !== "resource_missing") {
          log.error("account.delete_stripe_failed", { err: error });
          return { ok: false, error: "We couldn't cancel your subscription just now, so nothing was deleted. Try again in a minute." };
        }
      }
    } else if (LIVE_STATUSES.has(subscription.status)) {
      // Billing keys are missing, so the subscription can't be cancelled from here.
      return { ok: false, error: "Your paid plan has to be cancelled before the account can be deleted. Contact us and we'll do both." };
    }
  }

  await db.$transaction([
    db.aiRejection.deleteMany({ where: { userId } }),
    db.user.delete({ where: { id: userId } }),
  ]);
  log.info("account.deleted", {});
  return { ok: true };
}
