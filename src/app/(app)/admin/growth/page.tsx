import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCohorts, getFunnel } from "@/lib/analytics/funnel";
import { InquiryStatus } from "./inquiry-status";

export const metadata: Metadata = { title: "Growth" };

export default async function AdminGrowthPage() {
  const [funnel, cohorts, inquiries] = await Promise.all([
    getFunnel(30),
    getCohorts(8),
    db.schoolInquiry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const steps = [
    ["Homepage visits", funnel.homeViews],
    ["Ranked a week (try it)", funnel.tryRanked],
    ["Saved a ranked week", funnel.trySaved],
    ["Sign-up page visits", funnel.signupViews],
    ["Accounts created", funnel.signups],
    ["Finished onboarding", funnel.onboarded],
    ["Added the week they ranked", funnel.tryImported],
    ["First meaningful action", funnel.firstMeaningful],
    ["First practice check", funnel.firstAssessment],
    ["First tutor message", funnel.firstTutor],
    ["Came back another day", funnel.returned],
    ["Paid", funnel.paid],
  ] as const;
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "–");

  return (
    <div className="space-y-10">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">Admin</Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Growth</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          First-party only: cookieless public page counts and account events. Last {funnel.sinceDays} days; account steps are
          for accounts created in that window.
        </p>
      </header>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Funnel</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            {steps.map(([label, n]) => (
              <tr key={label}>
                <td className="py-2">{label}</td>
                <td className="py-2 text-right tabular-nums">{n}</td>
                <td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{label.startsWith("Home") || label.startsWith("Sign-up") || label.startsWith("Ranked") || label.startsWith("Saved") ? "" : pct(n, funnel.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Weekly cohorts: active in week…</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 font-medium">Signup week</th><th className="py-1 text-right font-medium">Users</th><th className="py-1 text-right font-medium">1</th><th className="py-1 text-right font-medium">2</th><th className="py-1 text-right font-medium">4</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cohorts.map((c) => (
              <tr key={c.week}>
                <td className="py-2">{c.week}</td>
                <td className="py-2 text-right tabular-nums">{c.users}</td>
                <td className="py-2 text-right tabular-nums">{pct(c.week1, c.users)}</td>
                <td className="py-2 text-right tabular-nums">{pct(c.week2, c.users)}</td>
                <td className="py-2 text-right tabular-nums">{pct(c.week4, c.users)}</td>
              </tr>
            ))}
            {cohorts.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">No signups in this window.</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">School inquiries</h2>
        {inquiries.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {inquiries.map((q) => (
              <li key={q.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{q.name} · {q.role} · {q.organization}</span>
                  <InquiryStatus id={q.id} status={q.status as "new" | "contacted" | "closed"} />
                </div>
                <p className="text-muted-foreground">
                  <a href={`mailto:${q.email}`} className="underline underline-offset-4">{q.email}</a> · {q.interest}
                  {q.studentCount ? ` · ${q.studentCount} students` : ""} · {q.createdAt.toISOString().slice(0, 10)}
                </p>
                <p className="whitespace-pre-wrap">{q.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
