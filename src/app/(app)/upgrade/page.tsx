import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { PLANS } from "@/lib/billing/plans";
import { billingConfigured, billingMode } from "@/lib/billing/stripe";
import { getPlanId } from "@/lib/ai/usage";
import { CheckoutButton } from "./checkout-button";

export const metadata: Metadata = { title: "Upgrade" };

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser();
  const { plan: raw } = await searchParams;
  const plan = raw === "PRO" ? PLANS.PRO : PLANS.PLUS;
  const current = await getPlanId(user.id);
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Upgrade to {plan.name}</h1>
      {!billingConfigured() ? (
        <p className="text-sm text-muted-foreground">Paid plans aren&apos;t open yet. You&apos;re on the Free plan, which keeps working as usual.</p>
      ) : current !== "FREE" ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re already on {PLANS[current].name}. Change or cancel it from <Link href="/settings#plan" className="underline underline-offset-4">Settings</Link>.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-3xl font-semibold tracking-tight">${plan.priceMonthlyUsd}<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
            <ul className="mt-3 space-y-1 text-sm">{plan.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
          <p className="text-sm text-muted-foreground">
            You&apos;ll finish payment on Stripe. Renews monthly; cancel anytime in Settings. If you&apos;re under 18, ask a parent
            or guardian first. See <Link href="/pricing" className="underline underline-offset-4">billing terms</Link>.
          </p>
          {billingMode() === "test" && <p className="text-sm text-warning">Test mode: use a Stripe test card. No real charge is made.</p>}
          <CheckoutButton plan={plan.id} />
        </>
      )}
    </div>
  );
}
