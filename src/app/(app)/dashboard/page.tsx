import { aiEnabled } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { dateKey, explainScore } from "@/lib/planning";
import type { ScheduledSession } from "@/lib/planning/types";
import { formatDateInZone, formatDateKey, formatMinuteOfDay, zonedParts } from "@/lib/time/zone";
import { formatDueDate, formatDuration } from "@/lib/format";
import type { SessionRecord } from "@/lib/insights/build-insights";
import { buildEstimationProfile, adjustEstimate } from "@/lib/estimation/build-estimation-profile";
import { buildPatterns } from "@/lib/patterns/build-patterns";
import { logEvent } from "@/lib/analytics/log-event";
import { cn } from "@/lib/utils";
import { pulseOf } from "@/lib/planning/pulse";
import { PulseBadge } from "@/components/brand/pulse-badge";
import { getMastery } from "@/lib/practice/load";
import { nextReview } from "@/lib/practice/mastery";
import { TodayPlanItem } from "./today-plan-item";
import { NextUp } from "./next-up";
import { WorkloadBars } from "./workload-bars";
import { buildOneThingReasons } from "./one-thing-reasons";
import { AddAssignmentButton } from "../assignments/add-assignment-button";
import { AddExamButton } from "../exams/add-exam-button";
import { QuickAdd } from "./quick-add";
import { TryWeekImport } from "./try-week-import";
import { StartWeek } from "./start-week";
import { teamsAvailable } from "@/lib/teams/service";
import { StreakPath } from "./streak";
import { getStreak } from "@/lib/streak/load";
import { encodeStreakCard } from "@/lib/share/streak-card";
import { getOrCreateReferralCode } from "@/lib/referral/referral";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Today",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COMING_UP_LIMIT = 7;

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface ComingUpRow {
  key: string;
  id: string;
  href: string;
  title: string;
  className: string;
  classColor: string;
  at: Date;
  kind: "assignment" | "exam";
  fromCanvas: boolean;
  overdue: boolean;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const notDone = { userId: user.id, status: { not: "COMPLETED" as const }, class: { archived: false } };
  const rowSelect = {
    id: true,
    title: true,
    dueAt: true,
    source: true,
    class: { select: { name: true, color: true } },
  } as const;

  const [classes, plan, overdue, upcoming, exams, overdueCount, dueThisWeek, sessionHistory, canvasConnection, mastery, lastCheck] =
    await Promise.all([
      db.class.findMany({
        where: { userId: user.id, archived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true },
      }),
      generatePlanForUser(user.id, now),
      db.assignment.findMany({
        where: { ...notDone, dueAt: { lt: now } },
        orderBy: { dueAt: "asc" },
        take: COMING_UP_LIMIT,
        select: rowSelect,
      }),
      db.assignment.findMany({
        where: { ...notDone, dueAt: { gte: now } },
        orderBy: { dueAt: "asc" },
        take: COMING_UP_LIMIT,
        select: rowSelect,
      }),
      db.exam.findMany({
        where: { userId: user.id, examAt: { gte: now }, class: { archived: false } },
        orderBy: { examAt: "asc" },
        take: COMING_UP_LIMIT,
        select: { id: true, title: true, examAt: true, class: { select: { name: true, color: true } } },
      }),
      db.assignment.count({ where: { ...notDone, dueAt: { lt: now } } }),
      db.assignment.count({ where: { ...notDone, dueAt: { gte: now, lt: new Date(now.getTime() + WEEK_MS) } } }),
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
      db.canvasConnection.findUnique({
        where: { userId: user.id },
        select: { status: true },
      }),
      getMastery(user.id, now),
      db.assessment.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, topic: true, estimateLow: true, estimateHigh: true, createdAt: true },
      }),
      logEvent(user.id, "dashboard_viewed"),
    ]);
  const review = nextReview(mastery);

  const tz = plan.timeZone;
  const today = dateKey(now, tz);
  const streak = await getStreak(user.id, tz, now);
  let streakShareUrl: string | null = null;
  if (streak.current >= 2) {
    const weekMinutes = sessionHistory
      .filter((s) => s.status === "COMPLETED" && s.startedAt.getTime() > now.getTime() - WEEK_MS)
      .reduce((sum, s) => sum + (s.actualMinutes ?? s.plannedMinutes), 0);
    const token = encodeStreakCard({ code: await getOrCreateReferralCode(user.id), streak: streak.current, minutes: weekMinutes });
    streakShareUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/s/${token}`;
  }
  const todaySessions = plan.sessions.filter((s) => s.scheduledDate === today);
  const plannedMinutesToday = todaySessions.reduce((sum, s) => sum + s.scheduledMinutes, 0);
  const todayAvailable = plan.days?.[0]?.availableMinutes ?? 0;
  const noAvailability = (plan.warnings ?? []).some((w) => w.type === "NO_AVAILABILITY");
  const laterSession = plan.sessions.find((s) => s.scheduledDate > today);

  const scoredById = new Map(plan.scored.map((s) => [s.item.id, s]));
  const pulseFor = (id: string) => {
    const s = scoredById.get(id);
    return s ? pulseOf(s.score) : null;
  };
  const reasonsFor = (itemId: string) => {
    const scored = scoredById.get(itemId);
    return scored ? explainScore(scored, now, plan.scored, tz) : [];
  };
  const blockLabel = (s: ScheduledSession) =>
    `${s.scheduledDate === today ? "today" : formatDateKey(s.scheduledDate, { weekday: "long" })} at ${formatMinuteOfDay(s.startMinute ?? 0)}`;

  const history: SessionRecord[] = sessionHistory.map((r) => ({
    ...r,
    status: r.status as "COMPLETED" | "ABANDONED",
  }));
  const next = plan.scored[0];
  const nextBlock = next ? plan.sessions.find((s) => s.item.id === next.item.id) : undefined;
  const nextReasons = next
    ? buildOneThingReasons(
        next,
        now,
        plan.scored,
        adjustEstimate(next.item.rawEstimatedMinutes, next.item.className, buildEstimationProfile(history)),
        buildPatterns(history),
        tz,
      ).slice(0, 3)
    : [];

  const comingUp: ComingUpRow[] = [
    ...overdue.map((a) => ({ ...assignmentRow(a), overdue: true })),
    ...[
      ...upcoming.map((a) => ({ ...assignmentRow(a), overdue: false })),
      ...exams.map(
        (e): ComingUpRow => ({
          key: `e-${e.id}`,
          id: e.id,
          href: "/exams",
          title: e.title,
          className: e.class.name,
          classColor: e.class.color,
          at: e.examAt,
          kind: "exam",
          fromCanvas: false,
          overdue: false,
        }),
      ),
    ].sort((a, b) => a.at.getTime() - b.at.getTime()),
  ].slice(0, COMING_UP_LIMIT);

  const week = (plan.days ?? []).slice(0, 7).map((d) => ({
    key: d.date,
    label: formatDateKey(d.date, { weekday: "long", month: "short", day: "numeric" }),
    letter: formatDateKey(d.date, { weekday: "narrow" }),
    minutes: d.plannedMinutes,
    availableMinutes: d.availableMinutes,
  }));
  const weekMinutes = week.reduce((n, d) => n + d.minutes, 0);
  const shortfallMinutes = Object.values(plan.unscheduledMinutesByItem).reduce((a, b) => a + b, 0);
  const name = user.profile?.displayName?.trim();
  const hasWork = plan.scored.length > 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {formatDateInZone(now, tz, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-[1.75rem] font-medium leading-tight tracking-tight sm:text-[2rem]">
            {greeting(zonedParts(now, tz).hour)}
            {name ? `, ${name}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {overdueCount > 0 && <span className="font-medium text-destructive">{overdueCount} overdue</span>}
            {overdueCount > 0 && " · "}
            {dueThisWeek === 0 ? "Nothing else due this week" : `${dueThisWeek} due in the next 7 days`}
          </p>
        </div>
        <StreakPath streak={streak} shareUrl={streakShareUrl} />
      </header>

      <TryWeekImport />
      {overdueCount === 0 && upcoming.length === 0 && exams.length === 0 && <StartWeek teams={teamsAvailable()} />}

      {canvasConnection?.status === "NEEDS_REAUTH" && (
        <Link
          href="/integrations/canvas"
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm hover:bg-warning/10"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">Canvas needs reconnecting.</span>{" "}
            <span className="text-muted-foreground">It stopped accepting your token, so new assignments aren&apos;t syncing.</span>
          </span>
        </Link>
      )}

      {next && (
        <NextUp
          itemId={next.item.id}
          itemKind={next.item.kind}
          assignmentId={next.item.kind === "assignment" ? next.item.id : null}
          title={next.item.title}
          className={next.item.className}
          classColor={next.item.classColor}
          minutes={next.item.remainingMinutes}
          pulse={pulseOf(next.score)}
          when={nextBlock ? `planned ${blockLabel(nextBlock)}` : undefined}
          reasons={nextReasons}
        />
      )}

      <section aria-labelledby="today-heading">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 id="today-heading" className="text-base font-semibold">
            Today
          </h2>
          {plannedMinutesToday > 0 && (
            <span className="text-sm text-muted-foreground">{formatDuration(plannedMinutesToday)} planned</span>
          )}
        </div>
        {todaySessions.length > 0 ? (
          <ul className="divide-y divide-border">
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
                reasons={reasonsFor(s.item.id)}
                timeLabel={s.startMinute !== undefined ? formatMinuteOfDay(s.startMinute) : undefined}
              />
            ))}
          </ul>
        ) : (
          <div className="py-5 text-sm">
            {!hasWork ? (
              <p className="text-muted-foreground">
                Nothing to plan yet. Add an assignment below
                {canvasConnection ? "" : " or connect Canvas to bring in your deadlines"}.
              </p>
            ) : noAvailability ? (
              <p className="text-muted-foreground">
                Rushd doesn&apos;t know when you can study yet, so it can&apos;t place work at specific times.{" "}
                <Link href="/settings#availability" className="font-medium text-foreground underline underline-offset-4">
                  Set your study times
                </Link>
              </p>
            ) : (
              <p className="text-muted-foreground">
                {todayAvailable === 0
                  ? "No study time left today."
                  : "Nothing needs today's study time."}
                {laterSession && (
                  <>
                    {" "}Next block: <span className="text-foreground">{laterSession.item.title}</span>,{" "}
                    {blockLabel(laterSession)}.
                  </>
                )}{" "}
                <Link href="/plan" className="font-medium text-foreground underline underline-offset-4">
                  Open schedule
                </Link>
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="coming-up-heading">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
          <h2 id="coming-up-heading" className="text-base font-semibold">
            Coming up
          </h2>
          <Link href="/assignments" className="text-sm text-muted-foreground hover:text-foreground">
            All assignments
          </Link>
        </div>
        {comingUp.length === 0 ? (
          <p className="py-5 text-sm text-muted-foreground">No deadlines or exams ahead.</p>
        ) : (
          <ul className="divide-y divide-border">
            {comingUp.map((row) => (
              <li key={row.key}>
                <Link href={row.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.classColor }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.className}
                      {row.kind === "exam" ? " · Exam" : ""}
                      {row.fromCanvas ? " · Canvas" : ""}
                    </span>
                  </span>
                  {pulseFor(row.id) !== null && <PulseBadge pulse={pulseFor(row.id)!} className="hidden shrink-0 sm:inline-flex" />}
                  <span
                    className={cn(
                      "w-44 shrink-0 text-right text-xs tabular-nums",
                      row.overdue ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {row.overdue ? "Overdue · " : ""}
                    {formatDueDate(row.at, tz, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aiEnabled && (
        <section aria-labelledby="learning-heading">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
            <h2 id="learning-heading" className="text-base font-semibold">
              Learning
            </h2>
            <Link href="/mastery" className="text-sm text-muted-foreground hover:text-foreground">
              Mastery
            </Link>
          </div>
          {review ? (
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="text-muted-foreground">Review next: </span>
                  <span className="font-medium">{review.topicLabel}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  About {review.estimate}% from {review.evidenceCount} check{review.evidenceCount === 1 ? "" : "s"} ({review.confidence} confidence)
                  {lastCheck ? ` · last check ${formatDateInZone(lastCheck.createdAt, tz, { month: "short", day: "numeric" })}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`/tutor?ask=${encodeURIComponent(`Help me review ${review.topicLabel}. Start with a quick diagnostic question.`)}`} className={buttonVariants({ variant: "outline" })}>
                  Review with tutor
                </Link>
                <Link href="/practice" className={buttonVariants({ variant: "ghost" })}>
                  Check again
                </Link>
              </div>
            </div>
          ) : lastCheck ? (
            <p className="py-4 text-sm text-muted-foreground">
              Your last check ({lastCheck.topic}, {Math.round(lastCheck.estimateLow)}–{Math.round(lastCheck.estimateHigh)}%) didn&apos;t flag anything to review.{" "}
              <Link href="/practice" className="font-medium text-foreground underline underline-offset-4">Check something new</Link>
            </p>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              Snap a photo of practice problems and Rushd shows what you&apos;ve got down and what to study next.{" "}
              <Link href="/practice" className="font-medium text-foreground underline underline-offset-4">Check my work</Link>
            </p>
          )}
        </section>
      )}

      {hasWork && !noAvailability && (
        <section aria-labelledby="week-heading">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
            <h2 id="week-heading" className="text-base font-semibold">
              This week
            </h2>
            <span className="text-sm text-muted-foreground">{formatDuration(weekMinutes)} planned</span>
          </div>
          <div className="pt-4">
            <WorkloadBars days={week} />
            {shortfallMinutes > 0 && (
              <p className="mt-4 flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  {formatDuration(shortfallMinutes)} of work won&apos;t fit before its deadline in your study time.{" "}
                  <Link href="/plan" className="font-medium underline underline-offset-4">
                    See what to do first
                  </Link>
                </span>
              </p>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="add-heading" className="space-y-3">
        <h2 id="add-heading" className="border-b border-border pb-2 text-base font-semibold">
          Add work
        </h2>
        <QuickAdd classes={classes} />
        <div className="flex flex-wrap gap-2">
          <AddAssignmentButton classes={classes} variant="outline" />
          <AddExamButton classes={classes} variant="outline" />
          {aiEnabled && (
            <Link href="/import" className={buttonVariants({ variant: "outline" })}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              From a screenshot
            </Link>
          )}
          {!canvasConnection && (
            <Link href="/integrations/canvas" className={buttonVariants({ variant: "outline" })}>
              Connect Canvas
            </Link>
          )}
        </div>
        {classes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add a class first on{" "}
            <Link href="/courses" className="underline underline-offset-4">
              Classes
            </Link>
            , or connect Canvas to import them.
          </p>
        )}
      </section>
    </div>
  );
}

function assignmentRow(a: {
  id: string;
  title: string;
  dueAt: Date;
  source: string;
  class: { name: string; color: string };
}): Omit<ComingUpRow, "overdue"> {
  return {
    key: `a-${a.id}`,
    id: a.id,
    href: "/assignments",
    title: a.title,
    className: a.class.name,
    classColor: a.class.color,
    at: a.dueAt,
    kind: "assignment",
    fromCanvas: a.source === "CANVAS",
  };
}
