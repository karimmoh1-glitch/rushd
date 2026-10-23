import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCohorts, getGrowth, getRecurring } from "@/lib/analytics/funnel";
import { InquiryStatus } from "./inquiry-status";

export const metadata: Metadata = { title: "Growth" };

// "42%", or "–" when there is nothing to divide by.
function pct(count: number, base: number): string {
  if (base > 0) {
    return `${Math.round((count / base) * 100)}%`;
  }
  return "–";
}

// e.g. "40% (4 of 10)", for "active N days after signup" rates.
function rate(r: { active: number; eligible: number }): string {
  if (!r.eligible) return "not enough data";
  return `${pct(r.active, r.eligible)} (${r.active} of ${r.eligible})`;
}

export default async function AdminGrowthPage() {
  // Checked here, not only in the layout: a client-side navigation between
  // admin pages renders the page segment without re-running the layout.
  await requireAdmin();
  const [growth, cohorts, inquiries, recurring] = await Promise.all([
    getGrowth(30),
    getCohorts(8),
    db.schoolInquiry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    getRecurring(),
  ]);

  const recurringStats = [
    { label: "Recurring", value: recurring.recurring.toLocaleString(), detail: "active in 2+ of the last 4 weeks · goal 10,000" },
    { label: "Active this week", value: recurring.activeThisWeek.toLocaleString(), detail: "added work or studied" },
    { label: "Active last week", value: recurring.activeLastWeek.toLocaleString(), detail: "" },
    {
      label: "Came back",
      value: recurring.retainedPct === null ? "–" : `${recurring.retainedPct}%`,
      detail: "of last week's, active again",
    },
  ];

  // "base" is the stage this one depends on; null means no share is shown.
  const visitorSteps: { label: string; count: number; base: number | null }[] = [
    { label: "Homepage visitors", count: growth.visitors, base: null },
    { label: "Started typing in the planner", count: growth.plannerStarts, base: growth.visitors },
    { label: "Got a ranking", count: growth.rankings, base: growth.visitors },
    { label: "Saved their ranked week", count: growth.saves, base: growth.rankings },
    { label: "Shared a ranking", count: growth.shares, base: growth.rankings },
    { label: "Free tool page visitors", count: growth.toolVisits, base: null },
    { label: "Made an exam plan", count: growth.examPlans, base: null },
    { label: "Sign-up page visitors", count: growth.signupPage, base: growth.visitors },
    { label: "Invite link visitors", count: growth.referralVisits, base: null },
  ];

  // Every account step is shown as a share of accounts created (except the first).
  const accountSteps = [
    { label: "Accounts created", count: growth.signups },
    { label: "Finished onboarding", count: growth.onboarded },
    { label: "Added work (first plan)", count: growth.firstSetup },
    { label: "Brought in the week they ranked", count: growth.importedWeek },
    { label: "First real study action", count: growth.firstStudy },
    { label: "Paid", count: growth.paid },
  ];

  return (
    <div className="space-y-10">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">Admin</Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Growth</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last {growth.sinceDays} days, first-party only. Public steps count each browser at most once a day per step (no cookies,
          no identifiers, automation excluded). Account steps cover accounts created in the window, excluding test and staff
          accounts. Only real student actions count as activity: adding work and studying, never page views or Rushd&apos;s own
          background jobs.
        </p>
      </header>

      <section aria-labelledby="recurring">
        <h2 id="recurring" className="border-b border-border pb-2 text-base font-semibold">Recurring students</h2>
        <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {recurringStats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 font-display text-3xl font-medium tabular-nums">{stat.value}</dd>
              {stat.detail && <dd className="mt-1 text-xs text-muted-foreground">{stat.detail}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Before sign-up</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            {visitorSteps.map((step) => (
              <tr key={step.label}>
                <td className="py-2">{step.label}</td>
                <td className="py-2 text-right tabular-nums">{step.count}</td>
                <td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{step.base === null ? "" : pct(step.count, step.base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Accounts and activation</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            {accountSteps.map((step) => (
              <tr key={step.label}>
                <td className="py-2">{step.label}</td>
                <td className="py-2 text-right tabular-nums">{step.count}</td>
                <td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{step.label === "Accounts created" ? "" : pct(step.count, growth.signups)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2">Active the day after signing up</td>
              <td className="py-2 text-right tabular-nums" colSpan={2}>{rate(growth.day1)}</td>
            </tr>
            <tr>
              <td className="py-2">Active in their second week (days 7–13)</td>
              <td className="py-2 text-right tabular-nums" colSpan={2}>{rate(growth.day7)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Invites</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            <tr><td className="py-2">Invite link visitors</td><td className="py-2 text-right tabular-nums">{growth.referralVisits}</td><td className="w-20" /></tr>
            <tr><td className="py-2">Joined through an invite</td><td className="py-2 text-right tabular-nums">{growth.referralsJoined}</td><td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{pct(growth.referralsJoined, growth.referralVisits)}</td></tr>
            <tr><td className="py-2">Invite counted (friend studied for real)</td><td className="py-2 text-right tabular-nums">{growth.referralsActivated}</td><td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{pct(growth.referralsActivated, growth.referralsJoined)}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Weekly cohorts: active in week… (real student actions only)</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 font-medium">Signup week</th><th className="py-1 text-right font-medium">Users</th><th className="py-1 text-right font-medium">1</th><th className="py-1 text-right font-medium">2</th><th className="py-1 text-right font-medium">4</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cohorts.map((cohort) => (
              <tr key={cohort.week}>
                <td className="py-2">{cohort.week}</td>
                <td className="py-2 text-right tabular-nums">{cohort.users}</td>
                <td className="py-2 text-right tabular-nums">{pct(cohort.week1, cohort.users)}</td>
                <td className="py-2 text-right tabular-nums">{pct(cohort.week2, cohort.users)}</td>
                <td className="py-2 text-right tabular-nums">{pct(cohort.week4, cohort.users)}</td>
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
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{inquiry.name} · {inquiry.role} · {inquiry.organization}</span>
                  <InquiryStatus id={inquiry.id} status={inquiry.status as "new" | "contacted" | "closed"} />
                </div>
                <p className="text-muted-foreground">
                  <a href={`mailto:${inquiry.email}`} className="underline underline-offset-4">{inquiry.email}</a> · {inquiry.interest}
                  {inquiry.studentCount ? ` · ${inquiry.studentCount} students` : ""} · {inquiry.createdAt.toISOString().slice(0, 10)}
                </p>
                <p className="whitespace-pre-wrap">{inquiry.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
