import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { PLANS } from "@/lib/billing/plans";
import { billingConfigured, billingMode } from "@/lib/billing/stripe";
import { getPlanId } from "@/lib/ai/usage";
import { CheckoutButton } from "./checkout-button";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/page-section";

export const metadata: Metadata = { title: "Upgrade" };

type PlanId = keyof typeof PLANS;

function UpgradeContent({ plan, currentPlanId }: { plan: (typeof PLANS)[PlanId]; currentPlanId: PlanId }) {
  if (!billingConfigured()) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
        <p className="text-sm">Paid plans aren&apos;t open yet. You&apos;re on the Free plan, which keeps working as usual.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          See what each plan will include on{" "}
          <Link href="/pricing" className="text-foreground underline underline-offset-4">Pricing</Link>, and what you&apos;ve used this
          month in <Link href="/settings#plan" className="text-foreground underline underline-offset-4">Settings</Link>.
        </p>
      </div>
    );
  }

  if (currentPlanId !== "FREE") {
    return (
      <p className="text-sm text-muted-foreground">
        You&apos;re already on {PLANS[currentPlanId].name}. Change or cancel it from <Link href="/settings#plan" className="underline underline-offset-4">Settings</Link>.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-card p-5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]">
        <p className="font-display text-4xl font-medium tracking-tight tabular-nums">${plan.priceMonthlyUsd}<span className="font-sans text-sm font-normal text-muted-foreground"> / month</span></p>
        <ul className="mt-4 space-y-2 text-sm">
          {plan.highlights.map((highlight) => (
            <li key={highlight} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {highlight}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">
        You&apos;ll finish payment on Stripe. Renews monthly; cancel anytime in Settings. If you&apos;re under 18, ask a parent
        or guardian first. See <Link href="/pricing" className="underline underline-offset-4">billing terms</Link>.
      </p>
      {billingMode() === "test" && <p className="text-sm text-warning">Test mode: use a Stripe test card. No real charge is made.</p>}
      <CheckoutButton plan={plan.id} />
    </>
  );
}

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser();
  const { plan: requestedPlan } = await searchParams;
  const plan = requestedPlan === "PRO" ? PLANS.PRO : PLANS.PLUS;
  const currentPlanId = await getPlanId(user.id);
  return (
    <div className="max-w-lg space-y-6">
      <PageHeader back={{ href: "/settings#plan", label: "Settings" }} title={`Upgrade to ${plan.name}`} />
      <UpgradeContent plan={plan} currentPlanId={currentPlanId} />
    </div>
  );
}
