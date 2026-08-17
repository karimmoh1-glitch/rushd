import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { dateKey, explainScore } from "@/lib/planning";
import { formatDueDate, formatDuration, formatDaysUntil } from "@/lib/format";
import { buildHealthScore } from "@/lib/health/build-health-score";
import type { SessionRecord } from "@/lib/insights/build-insights";
import { buildEstimationProfile, adjustEstimate } from "@/lib/estimation/build-estimation-profile";
import { buildPatterns } from "@/lib/patterns/build-patterns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TodayPlanItem } from "./today-plan-item";
import { OneThing } from "./one-thing";
import { WorkloadBars } from "./workload-bars";
import { HealthScoreCard } from "./health-score-card";
import { buildOneThingReasons } from "./one-thing-reasons";
import { AddAssignmentButton } from "../assignments/add-assignment-button";
import { AddExamButton } from "../exams/add-exam-button";
import { QuickAdd } from "./quick-add";

export const metadata: Metadata = {
  title: "Dashboard",
};

type DayPeriod = "morning" | "afternoon" | "evening";

function dayPeriod(now: Date): DayPeriod {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function greeting(period: DayPeriod): string {
  if (period === "morning") return "Good morning";
  if (period === "afternoon") return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const today = dateKey(now);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    classes,
    plan,
    overdueAssignments,
    upcomingAssignments,
    upcomingExams,
    completedThisWeek,
    completedToday,
    overdueCount,
    openCount,
    healthSessions,
    recentAssignments,
  ] = await Promise.all([
      db.class.findMany({
        where: { userId: user.id, archived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true },
      }),
      generatePlanForUser(user.id, now),
      db.assignment.findMany({
        where: {
          userId: user.id,
          status: { not: "COMPLETED" },
          dueAt: { lt: now },
          class: { archived: false },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
        select: { id: true, title: true, dueAt: true, class: { select: { name: true, color: true } } },
      }),
      db.assignment.findMany({
        where: {
          userId: user.id,
          status: { not: "COMPLETED" },
          dueAt: { gte: now },
          class: { archived: false },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
        select: { id: true, title: true, dueAt: true, class: { select: { name: true, color: true } } },
      }),
      db.exam.findMany({
        where: { userId: user.id, examAt: { gte: now }, class: { archived: false } },
        orderBy: { examAt: "asc" },
        take: 5,
        select: { id: true, title: true, examAt: true, class: { select: { name: true, color: true } } },
      }),
      db.assignment.count({
        where: {
          userId: user.id,
          status: "COMPLETED",
          completedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.assignment.count({
        where: { userId: user.id, status: "COMPLETED", completedAt: { gte: startOfToday } },
      }),
      db.assignment.count({
        where: {
          userId: user.id,
          status: { not: "COMPLETED" },
          dueAt: { lt: now },
          class: { archived: false },
        },
      }),
      db.assignment.count({
        where: { userId: user.id, status: { not: "COMPLETED" }, class: { archived: false } },
      }),
      db.studySession.findMany({
        where: { userId: user.id, status: { in: ["COMPLETED", "ABANDONED"] } },
        select: {
          className: true,
          classColor: true,
          status: true,
          plannedMinutes: true,
          actualMinutes: true,
          perceivedDifficulty: true,
          startedAt: true,
        },
      }),
      db.assignment.findMany({
        where: {
          userId: user.id,
          dueAt: { gte: fourteenDaysAgo, lte: now },
          class: { archived: false },
        },
        select: { status: true },
      }),
    ]);

  const todaySessions = plan.sessions.filter((s) => s.scheduledDate === today);

  // Fallback: if nothing landed on today's schedule (no availability set,
  // or today's capacity went to other days), still surface the highest
  // priority work so the dashboard never shows an empty "today" when work
  // actually exists.
  const fallbackItems = todaySessions.length === 0 ? plan.scored.slice(0, 3) : [];
  const showingFallback = todaySessions.length === 0 && fallbackItems.length > 0;

  const plannedMinutesToday = todaySessions.reduce((sum, s) => sum + s.scheduledMinutes, 0);

  const scoredById = new Map(plan.scored.map((s) => [s.item.id, s]));
  const reasonsFor = (itemId: string) => {
    const scored = scoredById.get(itemId);
    return scored ? explainScore(scored, now, plan.scored) : [];
  };

  const workloadDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(date);
    const minutes = plan.sessions
      .filter((s) => s.scheduledDate === key)
      .reduce((sum, s) => sum + s.scheduledMinutes, 0);
    return { date, minutes };
  });

  const statusLine =
    overdueCount > 0
      ? `You have ${overdueCount} thing${overdueCount === 1 ? "" : "s"} overdue.`
      : "You're on track.";

  const upcomingCount = openCount - overdueCount;

  const sessionsForHealth: SessionRecord[] = healthSessions.map((r) => ({
    className: r.className,
    classColor: r.classColor,
    status: r.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: r.plannedMinutes,
    actualMinutes: r.actualMinutes,
    perceivedDifficulty: r.perceivedDifficulty,
    startedAt: r.startedAt,
  }));
  const health = buildHealthScore({
    sessions: sessionsForHealth,
    recentAssignments: recentAssignments.map((a) => ({ status: a.status })),
    overdueCount,
    openCount,
  });
  // A trivial "100, nothing open" from a brand-new account with zero
  // history isn't a real signal — only surface the score once there's at
  // least one genuine behavioral component behind it.
  const showHealthScore = health.components.some((c) => c.key !== "overdue");

  const period = dayPeriod(now);
  const dailyContext = (() => {
    if (period === "evening") {
      if (todaySessions.length === 0) return null;
      return completedToday > 0
        ? `${completedToday} of ${todaySessions.length} done today.`
        : `${todaySessions.length} planned for today, still open — there's time.`;
    }
    if (period === "afternoon" && todaySessions.length > 0 && completedToday === 0) {
      return "A good stretch of time for a focused session.";
    }
    return null;
  })();

  const oneThing = plan.scored[0];
  const estimationProfile = buildEstimationProfile(sessionsForHealth);
  const patterns = buildPatterns(sessionsForHealth);
  const oneThingEstimate = oneThing
    ? adjustEstimate(oneThing.item.rawEstimatedMinutes, oneThing.item.className, estimationProfile)
    : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-heading text-3xl font-semibold">
          {greeting(period)}, {user.profile?.displayName}.
        </h1>
        <p
          className={`mt-1 text-base ${overdueCount > 0 ? "text-destructive" : "text-success"}`}
        >
          {statusLine}
        </p>
        {dailyContext && (
          <p className="mt-0.5 text-sm text-muted-foreground">{dailyContext}</p>
        )}
      </div>

      {oneThing && oneThingEstimate && (
        <OneThing
          itemId={oneThing.item.id}
          itemKind={oneThing.item.kind}
          assignmentId={oneThing.item.kind === "assignment" ? oneThing.item.id : null}
          title={oneThing.item.title}
          className={oneThing.item.className}
          classColor={oneThing.item.classColor}
          minutes={oneThing.item.remainingMinutes}
          reasons={buildOneThingReasons(oneThing, now, plan.scored, oneThingEstimate, patterns)}
        />
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-heading text-xl font-semibold">Today</h2>
          {plannedMinutesToday > 0 && (
            <span className="text-sm text-muted-foreground">
              {formatDuration(plannedMinutesToday)} planned
            </span>
          )}
        </div>

        {todaySessions.length > 0 ? (
          <div className="space-y-2">
            {todaySessions.map((s, i) => (
              <TodayPlanItem
                key={`${s.item.id}-${i}`}
                itemId={s.item.id}
                itemKind={s.item.kind}
                assignmentId={s.item.kind === "assignment" ? s.item.id : null}
                title={s.item.title}
                className={s.item.className}
                classColor={s.item.classColor}
                scheduledMinutes={s.scheduledMinutes}
                reasonCode={s.reasonCode}
                reasons={reasonsFor(s.item.id)}
              />
            ))}
          </div>
        ) : showingFallback ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing scheduled for today yet — set your study availability in{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Settings
              </Link>{" "}
              so Rushd can suggest specific times. Here&apos;s what matters most:
            </p>
            <div className="space-y-2">
              {fallbackItems.map((s, i) => (
                <TodayPlanItem
                  key={`${s.item.id}-${i}`}
                  itemId={s.item.id}
                  itemKind={s.item.kind}
                  assignmentId={s.item.kind === "assignment" ? s.item.id : null}
                  title={s.item.title}
                  className={s.item.className}
                  classColor={s.item.classColor}
                  scheduledMinutes={s.item.remainingMinutes}
                  reasonCode={s.reasonCode}
                  reasons={explainScore(s, now, plan.scored)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-14 text-center">
            <p className="text-muted-foreground">
              You&apos;re all caught up. Nothing due right now.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <QuickAdd classes={classes} />
        <div className="flex flex-wrap gap-2">
          <Link href="/import">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4" />
              Upload screenshot
            </Button>
          </Link>
          <AddAssignmentButton classes={classes} />
          <AddExamButton classes={classes} />
        </div>
      </section>

      {showHealthScore && health.score !== null && (
        <HealthScoreCard score={health.score} components={health.components} />
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold text-destructive">
              {overdueCount}
            </p>
            <p className="text-sm text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold">{upcomingCount}</p>
            <p className="text-sm text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold text-success">{completedThisWeek}</p>
            <p className="text-sm text-muted-foreground">Done this week</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">Overdue</h2>
          {overdueAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing overdue.</p>
          ) : (
            <div className="space-y-2">
              {overdueAssignments.map((a) => (
                <Link
                  key={a.id}
                  href="/assignments"
                  className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm hover:bg-destructive/10"
                >
                  <span className="truncate">{a.title}</span>
                  <Badge variant="destructive" className="shrink-0">
                    {formatDueDate(a.dueAt)}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">Upcoming exams</h2>
          {upcomingExams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exams scheduled.</p>
          ) : (
            <div className="space-y-2">
              {upcomingExams.map((e) => (
                <Link
                  key={e.id}
                  href="/exams"
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="truncate">{e.title}</span>
                  <Badge variant="outline" className="shrink-0 border-warning text-warning">
                    {formatDaysUntil(e.examAt)}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Upcoming deadlines</h2>
        {upcomingAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the horizon.</p>
        ) : (
          <div className="space-y-2">
            {upcomingAssignments.map((a) => (
              <Link
                key={a.id}
                href="/assignments"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.class.color }}
                  />
                  {a.title}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDueDate(a.dueAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">This week&apos;s workload</h2>
        <Card>
          <CardContent className="py-4">
            <WorkloadBars days={workloadDays} />
            {Object.keys(plan.unscheduledMinutesByItem).length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {formatDuration(
                  Object.values(plan.unscheduledMinutesByItem).reduce((a, b) => a + b, 0),
                )}{" "}
                of work doesn&apos;t fit in your available study time this week.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
