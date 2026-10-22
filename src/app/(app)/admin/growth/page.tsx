import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCohorts, getGrowth, getRecurring } from "@/lib/analytics/funnel";
import { InquiryStatus } from "./inquiry-status";

export const metadata: Metadata = { title: "Growth" };

export default async function AdminGrowthPage() {
  const [g, cohorts, inquiries, recurring] = await Promise.all([
    getGrowth(30),
    getCohorts(8),
    db.schoolInquiry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    getRecurring(),
  ]);
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "–");
  const rate = (r: { active: number; eligible: number }) => (r.eligible ? `${pct(r.active, r.eligible)} (${r.active} of ${r.eligible})` : "not enough data");
  // [label, count, share-of base] — share is relative to the stage it depends on.
  const visitorSteps: [string, number, number | null][] = [
    ["Homepage visitors", g.visitors, null],
    ["Started typing in the planner", g.plannerStarts, g.visitors],
    ["Got a ranking", g.rankings, g.visitors],
    ["Saved their ranked week", g.saves, g.rankings],
    ["Shared a ranking", g.shares, g.rankings],
    ["Free tool page visitors", g.toolVisits, null],
    ["Made an exam plan", g.examPlans, null],
    ["Sign-up page visitors", g.signupPage, g.visitors],
    ["Invite link visitors", g.referralVisits, null],
  ];
  const accountSteps: [string, number][] = [
    ["Accounts created", g.signups],
    ["Finished onboarding", g.onboarded],
    ["Added work (first plan)", g.firstSetup],
    ["Brought in the week they ranked", g.importedWeek],
    ["First real study action", g.firstStudy],
    ["Paid", g.paid],
  ];

  return (
    <div className="space-y-10">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">Admin</Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Growth</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last {g.sinceDays} days, first-party only. Public steps count each browser at most once a day per step (no cookies,
          no identifiers, automation excluded). Account steps cover accounts created in the window, excluding test and staff
          accounts. Only real student actions count as activity: adding work and studying, never page views or Rushd&apos;s own
          background jobs.
        </p>
      </header>

      <section aria-labelledby="recurring">
        <h2 id="recurring" className="border-b border-border pb-2 text-base font-semibold">Recurring students</h2>
        <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            ["Recurring", recurring.recurring.toLocaleString(), "active in 2+ of the last 4 weeks · goal 10,000"],
            ["Active this week", recurring.activeThisWeek.toLocaleString(), "added work or studied"],
            ["Active last week", recurring.activeLastWeek.toLocaleString(), ""],
            ["Came back", recurring.retainedPct === null ? "–" : `${recurring.retainedPct}%`, "of last week's, active again"],
          ].map(([k, v, d]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-1 font-display text-3xl font-medium tabular-nums">{v}</dd>
              {d && <dd className="mt-1 text-xs text-muted-foreground">{d}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Before sign-up</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            {visitorSteps.map(([label, n, base]) => (
              <tr key={label}>
                <td className="py-2">{label}</td>
                <td className="py-2 text-right tabular-nums">{n}</td>
                <td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{base === null ? "" : pct(n, base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Accounts and activation</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            {accountSteps.map(([label, n]) => (
              <tr key={label}>
                <td className="py-2">{label}</td>
                <td className="py-2 text-right tabular-nums">{n}</td>
                <td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{label === "Accounts created" ? "" : pct(n, g.signups)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2">Active the day after signing up</td>
              <td className="py-2 text-right tabular-nums" colSpan={2}>{rate(g.day1)}</td>
            </tr>
            <tr>
              <td className="py-2">Active in their second week (days 7–13)</td>
              <td className="py-2 text-right tabular-nums" colSpan={2}>{rate(g.day7)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="border-b border-border pb-2 text-base font-semibold">Invites</h2>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-border">
            <tr><td className="py-2">Invite link visitors</td><td className="py-2 text-right tabular-nums">{g.referralVisits}</td><td className="w-20" /></tr>
            <tr><td className="py-2">Joined through an invite</td><td className="py-2 text-right tabular-nums">{g.referralsJoined}</td><td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{pct(g.referralsJoined, g.referralVisits)}</td></tr>
            <tr><td className="py-2">Invite counted (friend studied for real)</td><td className="py-2 text-right tabular-nums">{g.referralsActivated}</td><td className="w-20 py-2 text-right tabular-nums text-muted-foreground">{pct(g.referralsActivated, g.referralsJoined)}</td></tr>
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
