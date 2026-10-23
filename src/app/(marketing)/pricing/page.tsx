import type { Metadata } from "next";
import Link from "next/link";
import { AiStatusNote } from "@/components/marketing/ai-status-note";
import { BONUS_MESSAGES, MAX_FRIENDS } from "@/lib/referral/constants";
import { aiEnabled } from "@/lib/env";
import { PricingTable } from "@/components/marketing/pricing-table";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";
import { PLANS } from "@/lib/billing/plans";
import { billingConfigured, billingMode } from "@/lib/billing/stripe";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Rushd is free to start: planning, Canvas sync, and mastery tracking with a monthly AI allowance. Plus and Pro raise tutoring, practice-check, and review allowances.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  const open = billingConfigured();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <PageViewBeacon path="/pricing" />
      <div className="max-w-2xl">
        <h1 className="text-4xl leading-[1.05] tracking-[-0.025em] sm:text-6xl">Pricing</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Planning and Canvas sync are free. AI tutoring, practice checks, and rubric reviews come with a monthly allowance on
          every plan, so Rushd can stay affordable and honest about costs.
        </p>
        {!open && <p className="mt-3 text-sm text-muted-foreground">Paid plans aren&apos;t open yet. Everyone can use the Free plan today.</p>}
        <AiStatusNote className="mt-3" />
        {billingMode() === "test" && <p className="mt-3 text-sm text-warning">Billing is in test mode: no real charges are made.</p>}
      </div>
      <div className="mt-12">
        <PricingTable billingOpen={open} />
      </div>

      <section className="mt-16 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Compare allowances</h2>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-2 font-medium">Per month</th><th className="py-2 text-right font-medium">Free</th><th className="py-2 text-right font-medium">Plus</th><th className="py-2 text-right font-medium">Pro</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {([["Tutor messages", "tutor_message"], ["Photo practice checks", "photo_assessment"], ["Rubric reviews", "draft_review"]] as const).map(([label, key]) => (
                <tr key={key}>
                  <td className="py-2">{label}</td>
                  {[PLANS.FREE, PLANS.PLUS, PLANS.PRO].map((p) => <td key={p.id} className="py-2 text-right tabular-nums">{p.monthly[key]}</td>)}
                </tr>
              ))}
              <tr><td className="py-2">Study planning and Canvas sync</td><td className="py-2 text-right" colSpan={3}>Included in every plan</td></tr>
            </tbody>
          </table>
          {aiEnabled && (
            <p className="mt-4 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span className="font-medium">Invite friends for more tutor time.</span>{" "}
              <span className="text-muted-foreground">
                When a friend joins with your link and studies once, you both get {BONUS_MESSAGES} more tutor messages every month, on
                any plan (up to {MAX_FRIENDS} friends).
              </span>
            </p>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <h2 className="text-xl font-semibold tracking-tight">Billing terms, plainly</h2>
          <p>Paid plans renew monthly until you cancel. Cancel anytime from Settings; you keep your plan until the end of the period you paid for.</p>
          <p>
            Each plan also has a monthly AI allowance. Very long conversations or large uploads use more of it; if you reach it
            before a count above, AI features pause until the next month. Planning and everything else keep working.
          </p>
          <p>Allowances reset on the 1st of each month (UTC). Unused allowance doesn&apos;t roll over.</p>
          <p>If you&apos;re under 18, ask a parent or guardian before buying a plan. Refund requests: see the <Link href="/terms#billing" className="underline underline-offset-4">Terms</Link>.</p>
          <p>Payments are processed by Stripe; Rushd never sees your card number.</p>
        </div>
      </section>
    </div>
  );
}
