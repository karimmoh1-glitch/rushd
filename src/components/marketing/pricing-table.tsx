import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/** The plan comparison, generated from the same config the server enforces. */
export function PricingTable({ compact = false, billingOpen = false }: { compact?: boolean; billingOpen?: boolean }) {
  const plans = [PLANS.FREE, PLANS.PLUS, PLANS.PRO];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((p) => {
        const featured = p.id === "PLUS";
        return (
          <div key={p.id} className={cn("flex flex-col rounded-xl border bg-card p-6", featured ? "border-primary/50 shadow-sm" : "border-border")}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              {featured && <span className="text-xs font-medium text-primary">Most students</span>}
            </div>
            <p className="mt-3">
              <span className="text-3xl font-semibold tracking-tight">${p.priceMonthlyUsd}</span>
              <span className="text-sm text-muted-foreground">{p.priceMonthlyUsd ? " / month" : " forever"}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
            <ul className={cn("mt-5 flex-1 space-y-2 text-sm", compact && "space-y-1.5")}>
              {p.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {h}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {p.id === "FREE" ? (
                <Link href="/signup" className="flex h-10 items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-muted">
                  Start free
                </Link>
              ) : billingOpen ? (
                <Link
                  href={`/upgrade?plan=${p.id}`}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg text-sm font-medium",
                    featured ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-muted",
                  )}
                >
                  Choose {p.name}
                </Link>
              ) : (
                <p className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  Opening soon
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
