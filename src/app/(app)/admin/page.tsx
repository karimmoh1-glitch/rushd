import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import {
  buildInsights,
  type EstimateAccuracyInsight,
  type SessionRecord,
} from "@/lib/insights/build-insights";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InviteCodeForm } from "./invite-code-form";
import { ResetLinkForm } from "./reset-link-form";
import { lastCronRuns } from "@/lib/jobs/cron-log";

const MIN_SESSIONS_PER_STUDENT = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const FEATURE_EVENTS = [
  { name: "insights_viewed", label: "Insights" },
  { name: "profile_viewed", label: "Academic Profile" },
  { name: "how_rushd_thinks_viewed", label: "How Rushd thinks" },
  { name: "what_if_simulator_used", label: "What-if simulator" },
] as const;

const HELPFUL_CONTEXTS = [
  { context: "one_thing_helpful", label: "One Thing" },
  { context: "health_score_helpful", label: "Health Score" },
  { context: "insights_helpful", label: "Insights" },
  { context: "what_if_helpful", label: "What-if simulator" },
] as const;

export const metadata: Metadata = {
  title: "Admin",
};

// ---------- Types ----------

type CronRun = { at: string; report: unknown } | null;

interface StudentAccuracy {
  email: string;
  sessionCount: number;
  avgOverrunPercent: number;
}

interface HelpfulTally {
  yes: number;
  no: number;
}

interface SessionRow {
  userId: string;
  className: string;
  classColor: string;
  status: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  perceivedDifficulty: SessionRecord["perceivedDifficulty"];
  startedAt: Date;
  user: { email: string };
}

interface SignupRow {
  id: string;
  email: string;
  createdAt: Date;
  onboardingCompletedAt: Date | null;
}

interface EventCountRow {
  name: string;
  _count: { name: number };
}

interface RecentEventRow {
  name: string;
  createdAt: Date;
  user: { email: string };
}

interface FeedbackRow {
  context: string;
  rating: number | null;
  message: string | null;
  createdAt: Date;
  user: { email: string };
}

interface InviteCodeRow {
  id: string;
  code: string;
  label: string | null;
  maxUses: number | null;
  _count: { users: number };
}

// ---------- Data-shaping helpers ----------

function percentOf(value: number, total: number): number {
  return Math.round((value / total) * 100);
}

// Distinct active days in the last 30 days is a light, privacy-safe retention
// signal: coming back on a second day means more than many events in one sitting.
function countReturningStudents(events: { userId: string; createdAt: Date }[]) {
  const daysByUser = new Map<string, Set<string>>();
  for (const event of events) {
    const day = event.createdAt.toISOString().slice(0, 10);
    const days = daysByUser.get(event.userId) ?? new Set<string>();
    days.add(day);
    daysByUser.set(event.userId, days);
  }

  let returningCount = 0;
  for (const days of daysByUser.values()) {
    if (days.size >= 2) returningCount++;
  }

  return { activeCount: daysByUser.size, returningCount };
}

// Feature name -> number of distinct users who ever used it.
function countFeatureUsers(rows: { name: string; userId: string }[]): Map<string, number> {
  const usersByFeature = new Map<string, Set<string>>();
  for (const row of rows) {
    const users = usersByFeature.get(row.name) ?? new Set<string>();
    users.add(row.userId);
    usersByFeature.set(row.name, users);
  }

  const counts = new Map<string, number>();
  for (const [name, users] of usersByFeature) {
    counts.set(name, users.size);
  }
  return counts;
}

// Feedback context -> yes/no votes. A 5 means "helpful", a 1 means "not helpful".
function tallyHelpfulVotes(rows: { context: string; rating: number | null }[]): Map<string, HelpfulTally> {
  const tallies = new Map<string, HelpfulTally>();
  for (const row of rows) {
    const tally = tallies.get(row.context) ?? { yes: 0, no: 0 };
    if (row.rating === 5) {
      tally.yes++;
    } else if (row.rating === 1) {
      tally.no++;
    }
    tallies.set(row.context, tally);
  }
  return tallies;
}

function toSessionRecords(rows: SessionRow[]): SessionRecord[] {
  return rows.map((row) => ({
    className: row.className,
    classColor: row.classColor,
    status: row.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: row.plannedMinutes,
    actualMinutes: row.actualMinutes,
    perceivedDifficulty: row.perceivedDifficulty,
    startedAt: row.startedAt,
  }));
}

// Students with enough finished sessions, sorted by how far over their
// planned time they usually run.
function buildStudentAccuracy(rows: SessionRow[]): StudentAccuracy[] {
  const ratiosByStudent = new Map<string, { email: string; ratios: number[] }>();
  for (const row of rows) {
    if (row.actualMinutes == null) continue;
    const entry = ratiosByStudent.get(row.userId) ?? { email: row.user.email, ratios: [] };
    entry.ratios.push(row.actualMinutes / row.plannedMinutes);
    ratiosByStudent.set(row.userId, entry);
  }

  const result: StudentAccuracy[] = [];
  for (const { email, ratios } of ratiosByStudent.values()) {
    if (ratios.length < MIN_SESSIONS_PER_STUDENT) continue;

    let ratioSum = 0;
    for (const ratio of ratios) {
      ratioSum += ratio;
    }
    const avgRatio = ratioSum / ratios.length;

    result.push({
      email,
      sessionCount: ratios.length,
      avgOverrunPercent: Math.round((avgRatio - 1) * 100),
    });
  }

  return result.sort((a, b) => b.avgOverrunPercent - a.avgOverrunPercent);
}

function describeCronRun(run: CronRun): string {
  if (!run) return "hasn't run yet";
  return `last ran ${new Date(run.at).toUTCString()} · ${JSON.stringify(run.report)}`;
}

function classAccuracyColor(percentOff: number): string {
  if (percentOff > 10) return "text-warning";
  if (percentOff < -10) return "text-muted-foreground";
  return "text-success";
}

// ---------- Small building blocks ----------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function FunnelStat({ label, value, ofTotal }: { label: string; value: number; ofTotal: number }) {
  const pct = ofTotal > 0 ? percentOf(value, ofTotal) : null;
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">
          {value}
          {pct !== null && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({pct}%)</span>}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// ---------- Sections ----------

function ScheduledJobsSection({ daily, evening }: { daily: CronRun; evening: CronRun }) {
  const jobs = [
    { label: "Daily sync and Sunday email (09:00 UTC)", run: daily },
    { label: "Streak reminders (every 6 hours)", run: evening },
  ];

  return (
    <section aria-label="Scheduled jobs" className="rounded-xl border border-border p-4 text-sm">
      <p className="font-medium">Scheduled jobs</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {jobs.map((job) => (
          <li key={job.label}>
            <span className="text-foreground">{job.label}:</span>{" "}
            {describeCronRun(job.run)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdoptionFunnelSection({
  totalUsers,
  onboardedCount,
  planUserCount,
  sessionUserCount,
}: {
  totalUsers: number;
  onboardedCount: number;
  planUserCount: number;
  sessionUserCount: number;
}) {
  const onboardingRate = totalUsers > 0 ? percentOf(onboardedCount, totalUsers) : null;
  const showOnboardingWarning = onboardingRate !== null && onboardingRate < 50 && totalUsers >= 5;

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Adoption funnel</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Each stage as a share of total signups — where students actually drop off.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FunnelStat label="Signed up" value={totalUsers} ofTotal={totalUsers} />
        <FunnelStat label="Completed onboarding" value={onboardedCount} ofTotal={totalUsers} />
        <FunnelStat label="Generated a plan" value={planUserCount} ofTotal={totalUsers} />
        <FunnelStat label="Started a study session" value={sessionUserCount} ofTotal={totalUsers} />
      </div>
      {showOnboardingWarning && (
        <p className="mt-2 text-xs text-warning">
          Under half of signups finish onboarding — the biggest lever right now is probably
          there, not further down the funnel.
        </p>
      )}
    </section>
  );
}

function ReturningStudentsSection({
  returningCount,
  activeCount,
}: {
  returningCount: number;
  activeCount: number;
}) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Returning students</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Of students active in the last 30 days, how many came back on a second separate day.
      </p>
      <Card>
        <CardContent className="py-4">
          <p className="text-2xl font-semibold">
            {returningCount}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              of {activeCount} active (30d)
            </span>
          </p>
          <p className="text-sm text-muted-foreground">Returned on 2+ days</p>
        </CardContent>
      </Card>
    </section>
  );
}

function FeatureUsageSection({
  featureUserCounts,
  totalUsers,
}: {
  featureUserCounts: Map<string, number>;
  totalUsers: number;
}) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Feature usage</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Distinct users who have ever used each feature, of all signups.
      </p>
      <div className="space-y-2">
        {FEATURE_EVENTS.map((feature) => {
          const count = featureUserCounts.get(feature.name) ?? 0;
          const pct = totalUsers > 0 ? percentOf(count, totalUsers) : 0;
          return (
            <div
              key={feature.name}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>{feature.label}</span>
              <span className="font-medium">
                {count} <span className="text-muted-foreground">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HelpfulCard({ label, tally }: { label: string; tally: HelpfulTally | undefined }) {
  const yes = tally?.yes ?? 0;
  const no = tally?.no ?? 0;
  const total = yes + no;

  let percentText = "—";
  let votesText = "(no votes yet)";
  if (total > 0) {
    percentText = `${percentOf(yes, total)}%`;
    votesText = total === 1 ? `(${total} vote)` : `(${total} votes)`;
  }

  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{percentText}</p>
        <p className="text-sm text-muted-foreground">
          {label} {votesText}
        </p>
      </CardContent>
    </Card>
  );
}

function HelpfulFeedbackSection({ helpfulTallies }: { helpfulTallies: Map<string, HelpfulTally> }) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">&ldquo;Was this helpful?&rdquo; feedback</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Per-feature helpful/not-helpful votes, collected inline on each feature.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {HELPFUL_CONTEXTS.map((helpful) => (
          <HelpfulCard key={helpful.context} label={helpful.label} tally={helpfulTallies.get(helpful.context)} />
        ))}
      </div>
    </section>
  );
}

function AccountRecoverySection() {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Account recovery</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Rushd doesn&apos;t send email yet. Create a one-time reset link for a locked-out student and send it to them yourself.
      </p>
      <ResetLinkForm />
    </section>
  );
}

function InviteCodesSection({ inviteCodes }: { inviteCodes: InviteCodeRow[] }) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Pilot invites</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Generate codes for a staged rollout. Signup stays open to everyone unless
        REQUIRE_INVITE_CODE is set — see .env.example.
      </p>
      <InviteCodeForm />
      <div className="mt-3 space-y-2">
        {inviteCodes.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{invite.code}</span>
              {invite.label && <span className="text-muted-foreground">{invite.label}</span>}
            </div>
            <span className="text-muted-foreground">
              {invite._count.users} used{invite.maxUses !== null ? ` / ${invite.maxUses}` : ""}
            </span>
          </div>
        ))}
        {inviteCodes.length === 0 && <EmptyText>No invite codes yet.</EmptyText>}
      </div>
    </section>
  );
}

function RecentSignupsSection({ signups }: { signups: SignupRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Recent signups</h2>
      <div className="space-y-2">
        {signups.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="truncate">{user.email}</span>
            <div className="flex shrink-0 items-center gap-2">
              {!user.onboardingCompletedAt && (
                <Badge variant="outline">Not onboarded</Badge>
              )}
              <span className="text-muted-foreground">
                {user.createdAt.toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
        {signups.length === 0 && <EmptyText>No signups yet.</EmptyText>}
      </div>
    </section>
  );
}

function EventCountsSection({ eventCounts }: { eventCounts: EventCountRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">
        Events, last 7 days
      </h2>
      <div className="space-y-2">
        {eventCounts.map((event) => (
          <div
            key={event.name}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="font-mono text-xs">{event.name}</span>
            <span className="font-medium">{event._count.name}</span>
          </div>
        ))}
        {eventCounts.length === 0 && <EmptyText>No events yet.</EmptyText>}
      </div>
    </section>
  );
}

function RecentActivitySection({ events }: { events: RecentEventRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{event.name}</td>
                <td className="max-w-[200px] truncate px-3 py-2">{event.user.email}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {event.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeedbackSection({ feedback }: { feedback: FeedbackRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Feedback</h2>
      <div className="space-y-2">
        {feedback.map((item, index) => (
          <div key={index} className="rounded-lg border border-border px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{item.context}</Badge>
                {item.rating && <span>{item.rating}/5</span>}
              </div>
              <span className="text-xs text-muted-foreground">
                {item.user.email} · {item.createdAt.toLocaleDateString()}
              </span>
            </div>
            {item.message && <p className="mt-2 text-muted-foreground">{item.message}</p>}
          </div>
        ))}
        {feedback.length === 0 && <EmptyText>No feedback yet.</EmptyText>}
      </div>
    </section>
  );
}

function ClassAccuracyList({ rows }: { rows: EstimateAccuracyInsight[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        Classes (by name, across all students)
      </h3>
      <div className="space-y-2">
        {rows.slice(0, 8).map((row) => (
          <div
            key={row.className}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 truncate">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.classColor }}
              />
              {row.className}
              <span className="text-xs text-muted-foreground">
                ({row.sessionCount})
              </span>
            </span>
            <span className={`shrink-0 font-medium ${classAccuracyColor(row.percentOff)}`}>
              {row.percentOff > 0 ? "+" : ""}
              {row.percentOff}%
            </span>
          </div>
        ))}
        {rows.length === 0 && <EmptyText>Not enough session data yet.</EmptyText>}
      </div>
    </div>
  );
}

function StudentAccuracyList({ students }: { students: StudentAccuracy[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        Students running most over estimate
      </h3>
      <div className="space-y-2">
        {students.map((student) => (
          <div
            key={student.email}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="truncate">
              {student.email} <span className="text-xs text-muted-foreground">({student.sessionCount})</span>
            </span>
            <span
              className={`shrink-0 font-medium ${student.avgOverrunPercent > 10 ? "text-warning" : "text-muted-foreground"}`}
            >
              {student.avgOverrunPercent > 0 ? "+" : ""}
              {student.avgOverrunPercent}%
            </span>
          </div>
        ))}
        {students.length === 0 && <EmptyText>Not enough session data yet.</EmptyText>}
      </div>
    </div>
  );
}

function PredictionAccuracySection({
  classRows,
  students,
}: {
  classRows: EstimateAccuracyInsight[];
  students: StudentAccuracy[];
}) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Prediction accuracy</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Pooled across every student — same estimate-accuracy math as their Insights page, run
        platform-wide. Answers which classes are underestimated, in aggregate.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <ClassAccuracyList rows={classRows} />
        <StudentAccuracyList students={students} />
      </div>
    </section>
  );
}

// ---------- Page ----------

export default async function AdminPage() {
  // Checked here, not only in the layout: a client-side navigation between
  // admin pages renders the page segment without re-running the layout.
  await requireAdmin();
  const crons = await lastCronRuns();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * ONE_DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * ONE_DAY_MS);

  const [
    totalUsers,
    activeUserIds,
    recentSignups,
    eventCounts,
    recentEvents,
    recentFeedback,
    totalClasses,
    totalAssignments,
    totalExams,
    totalPlansGenerated,
    studySessionRows,
    onboardedCount,
    firstPlanUsers,
    firstSessionUsers,
    events30d,
    featureViewRows,
    helpfulFeedbackRows,
    inviteCodes,
  ] = await Promise.all([
    db.user.count(),
    db.event.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, email: true, createdAt: true, onboardingCompletedAt: true },
    }),
    db.event.groupBy({
      by: ["name"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { name: true },
      orderBy: { _count: { name: "desc" } },
    }),
    db.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { name: true, createdAt: true, user: { select: { email: true } } },
    }),
    db.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        context: true,
        rating: true,
        message: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
    db.class.count(),
    db.assignment.count(),
    db.exam.count(),
    db.plan.count(),
    db.studySession.findMany({
      where: { status: { in: ["COMPLETED", "ABANDONED"] } },
      select: {
        userId: true,
        className: true,
        classColor: true,
        status: true,
        plannedMinutes: true,
        actualMinutes: true,
        perceivedDifficulty: true,
        startedAt: true,
        user: { select: { email: true } },
      },
    }),
    db.user.count({ where: { onboardingCompletedAt: { not: null } } }),
    db.event.findMany({
      where: { name: "plan_generated" },
      distinct: ["userId"],
      select: { userId: true },
    }),
    db.event.findMany({
      where: { name: "study_session_started" },
      distinct: ["userId"],
      select: { userId: true },
    }),
    db.event.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { userId: true, createdAt: true },
    }),
    db.event.findMany({
      where: { name: { in: FEATURE_EVENTS.map((f) => f.name) } },
      select: { name: true, userId: true },
    }),
    db.feedback.findMany({
      where: { context: { in: HELPFUL_CONTEXTS.map((h) => h.context) } },
      select: { context: true, rating: true },
    }),
    db.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        label: true,
        maxUses: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    }),
  ]);

  const returning = countReturningStudents(events30d);
  const featureUserCounts = countFeatureUsers(featureViewRows);
  const helpfulTallies = tallyHelpfulVotes(helpfulFeedbackRows);

  // Same per-class math as the student Insights page, pooled across every student.
  const platformInsights = buildInsights(toSessionRecords(studySessionRows));
  const topOverrunStudents = buildStudentAccuracy(studySessionRows).slice(0, 5);

  const stats = [
    { label: "Total users", value: totalUsers },
    { label: "Active (7d)", value: activeUserIds.length },
    { label: "Classes", value: totalClasses },
    { label: "Assignments", value: totalAssignments },
    { label: "Exams", value: totalExams },
    { label: "Plans generated", value: totalPlansGenerated },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Admin</h1>
      <p className="flex gap-4 text-sm">
        <a href="/admin/ai" className="underline underline-offset-4">AI usage and cost</a>
        <a href="/admin/growth" className="underline underline-offset-4">Growth and school inquiries</a>
      </p>

      <ScheduledJobsSection daily={crons.daily} evening={crons.evening} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <AdoptionFunnelSection
        totalUsers={totalUsers}
        onboardedCount={onboardedCount}
        planUserCount={firstPlanUsers.length}
        sessionUserCount={firstSessionUsers.length}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ReturningStudentsSection
          returningCount={returning.returningCount}
          activeCount={returning.activeCount}
        />
        <FeatureUsageSection featureUserCounts={featureUserCounts} totalUsers={totalUsers} />
      </div>

      <HelpfulFeedbackSection helpfulTallies={helpfulTallies} />

      <AccountRecoverySection />

      <InviteCodesSection inviteCodes={inviteCodes} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentSignupsSection signups={recentSignups} />
        <EventCountsSection eventCounts={eventCounts} />
      </div>

      <RecentActivitySection events={recentEvents} />

      <FeedbackSection feedback={recentFeedback} />

      <PredictionAccuracySection
        classRows={platformInsights.estimateAccuracy}
        students={topOverrunStudents}
      />
    </div>
  );
}
