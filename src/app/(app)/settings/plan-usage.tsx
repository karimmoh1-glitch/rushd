import Link from "next/link";
import { FEATURE_LABEL } from "@/lib/billing/plans";
import { buttonVariants } from "@/components/ui/button";
import type { UsageSummary } from "@/lib/ai/usage";
import { ManageBillingButton } from "./manage-billing-button";

export function PlanUsage({
  usage,
  billing,
  subscription,
}: {
  usage: UsageSummary;
  billing: "off" | "test" | "live";
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; hasCustomer: boolean } | null;
}) {
  const pct = Math.round(usage.costUsedFraction * 100);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {usage.plan.name} plan
            {billing === "test" && <span className="ml-2 rounded border border-warning/40 px-1.5 py-0.5 text-[11px] font-normal text-warning">Billing test mode</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd
              ? `Cancels at the end of the period (${subscription.currentPeriodEnd}).`
              : subscription?.status === "past_due"
                ? "Your last payment failed. Update your payment method to keep your plan."
                : "Allowances reset on the 1st of each month (UTC)."}
          </p>
        </div>
        <div className="flex gap-2">
          {subscription?.hasCustomer && billing !== "off" && <ManageBillingButton />}
          {usage.plan.id !== "PRO" && (
            <Link href="/pricing" className={buttonVariants({ variant: usage.plan.id === "FREE" ? "default" : "outline" })}>
              {usage.plan.id === "FREE" ? "See plans" : "Compare plans"}
            </Link>
          )}
        </div>
      </div>
      <ul className="space-y-3">
        {usage.features.map((f) => (
          <li key={f.feature}>
            <div className="flex justify-between text-sm">
              <span>{FEATURE_LABEL[f.feature]}</span>
              <span className="tabular-nums text-muted-foreground">{f.used} / {f.limit}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (f.used / Math.max(1, f.limit)) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        AI allowance used this month: {pct}%. Very long conversations count more; if you reach your plan&apos;s AI allowance
        before a count limit, AI features pause until next month. Planning, Canvas sync, and everything else keep working.
      </p>
    </div>
  );
}
