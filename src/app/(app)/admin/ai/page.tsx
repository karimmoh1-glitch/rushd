import type { Metadata } from "next";
import Link from "next/link";
import { getAdminAiUsage } from "@/lib/ai/admin-usage";
import { FEATURE_LABEL, PLANS, type AiFeature } from "@/lib/billing/plans";
import { usd } from "@/lib/ai/pricing";
import { AiControls } from "./ai-controls";

export const metadata: Metadata = { title: "AI usage" };

const money = (micros: number) => `$${usd(micros).toFixed(2)}`;

export default async function AdminAiPage() {
  const data = await getAdminAiUsage();
  const budgetMicros = data.settings.monthlyBudgetUsd * 1_000_000;
  const pct = budgetMicros > 0 ? Math.round((data.spentMicros / budgetMicros) * 100) : 100;
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.micros));

  return (
    <div className="space-y-10">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">Admin</Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI usage and cost</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This calendar month (UTC). Costs are computed from provider-reported tokens at list prices; open reservations count
          at their estimate. Reconcile against the Anthropic console invoice for confirmed spend.
        </p>
      </header>

      {pct >= 80 && (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          Spend is at {pct}% of the monthly ceiling. At 100% every AI feature pauses for all students until the ceiling is raised
          or the month ends.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Spent this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(data.spentMicros)}</p>
          <p className="text-xs text-muted-foreground">{pct}% of ${data.settings.monthlyBudgetUsd} ceiling</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Requests</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{Object.values(data.byStatus).reduce((a, b) => a + b, 0)}</p>
          <p className="text-xs text-muted-foreground">
            {data.byStatus.completed ?? 0} completed · {data.byStatus.failed ?? 0} failed · {data.byStatus.reserved ?? 0} open
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Turned away by limits</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data.rejections.reduce((n, r) => n + r.count, 0)}</p>
          <p className="text-xs text-muted-foreground">{data.rejections.map((r) => `${r.reason} ${r.count}`).join(" · ") || "none"}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="border-b border-border pb-2 text-base font-semibold">Controls</h2>
        <AiControls enabled={data.settings.enabled} budget={data.settings.monthlyBudgetUsd} envKill={process.env.AI_KILL_SWITCH === "on"} />
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">By feature</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 font-medium">Feature</th><th className="py-1 text-right font-medium">Requests</th><th className="py-1 text-right font-medium">Tokens in / out</th><th className="py-1 text-right font-medium">Cost</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.byFeature.map((f) => (
              <tr key={f.feature}>
                <td className="py-2">{FEATURE_LABEL[f.feature as AiFeature] ?? f.feature}</td>
                <td className="py-2 text-right tabular-nums">{f.requests}</td>
                <td className="py-2 text-right tabular-nums">{f.input.toLocaleString()} / {f.output.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums">{money(f.micros)}</td>
              </tr>
            ))}
            {data.byFeature.length === 0 && <tr><td colSpan={4} className="py-3 text-muted-foreground">No AI requests this month.</td></tr>}
          </tbody>
        </table>
      </section>

      {data.daily.length > 0 && (
        <section>
          <h2 className="border-b border-border pb-2 text-base font-semibold">Last 30 days</h2>
          <ol className="mt-3 flex h-24 items-end gap-1" aria-label="Daily AI spend">
            {data.daily.map((d) => (
              <li key={d.day} className="flex-1" title={`${d.day}: ${money(d.micros)}`}>
                <div className="w-full rounded-sm bg-primary/70" style={{ height: `${Math.max(2, (d.micros / maxDaily) * 96)}px` }} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Highest-cost accounts</h2>
        <ul className="divide-y divide-border text-sm">
          {data.topUsers.map((u) => (
            <li key={u.email} className="flex justify-between py-2">
              <span className="truncate">{u.email}</span>
              <span className="tabular-nums text-muted-foreground">{u.requests} requests · {money(u.micros)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Plan limits (src/lib/billing/plans.ts)</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {Object.values(PLANS).map((p) => (
            <li key={p.id}>
              <span className="font-medium">{p.name}</span>{" "}
              <span className="text-muted-foreground">
                ${p.priceMonthlyUsd}/mo · {p.monthly.tutor_message} tutor · {p.monthly.photo_assessment} checks · {p.monthly.draft_review} reviews · {p.dailyRequests}/day · cost cap ${p.monthlyCostCapUsd} · {p.maxConcurrent} concurrent
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
