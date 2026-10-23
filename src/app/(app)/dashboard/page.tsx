import { aiEnabled, env } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { generatePlanForUser, type UserPlan } from "@/lib/planning/generate-for-user";
import { dateKey, explainScore } from "@/lib/planning";
import type { DayPlan, ScheduledSession, ScoredItem } from "@/lib/planning/types";
import { formatDateInZone, formatDateKey, formatMinuteOfDay, zonedParts } from "@/lib/time/zone";
import { dueStatus, formatDueDate, formatDuration } from "@/lib/format";
import type { SessionRecord } from "@/lib/insights/build-insights";
import { buildEstimationProfile, adjustEstimate } from "@/lib/estimation/build-estimation-profile";
import { buildPatterns } from "@/lib/patterns/build-patterns";
import { logEvent } from "@/lib/analytics/log-event";
import { cn } from "@/lib/utils";
import { pulseOf } from "@/lib/planning/pulse";
import { PulseBadge } from "@/components/brand/pulse-badge";
import { StatusChip } from "@/components/status-chip";
import { studyTimeByCourse, type CourseStudyTime } from "@/lib/courses/study-time";
import { getMastery } from "@/lib/practice/load";
import { nextReview, type TopicMastery } from "@/lib/practice/mastery";
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
import { currentTime } from "@/lib/time/now";
import { latestChangeNote, rollPlanForward } from "@/lib/planning/snapshots";
import {
  assessReadiness,
  coursesToSuggestArchiving,
  dateColumnKey,
  pickBiggestGap,
  type GapCandidate,
} from "@/lib/planning/outcomes";
import { calendarDaysBetween } from "@/lib/time/zone";
import { WhatChanged } from "@/components/planning/what-changed";
import { Panel } from "./panel";
import { ArchiveSuggestion } from "./archive-suggestion";
import { ReadinessPanel, type NextAssessment } from "./readiness-panel";
import { LearningPanel, type CourseMasteryRow } from "./learning-panel";

export const metadata: Metadata = {
  title: "Today",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COMING_UP_LIMIT = 7;

// ---------- Types ----------

interface ClassOption {
  id: string;
  name: string;
  color: string;
}

interface AssignmentListItem {
  id: string;
  title: string;
  dueAt: Date;
  source: string;
  class: { name: string; color: string };
}

interface ExamListItem {
  id: string;
  classId: string;
  title: string;
  examAt: Date;
  class: { name: string; color: string };
}

interface LastCheck {
  topic: string;
  estimateLow: number;
  estimateHigh: number;
  createdAt: Date;
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

interface WeekDayBar {
  key: string;
  label: string;
  letter: string;
  minutes: number;
  availableMinutes: number;
}

// ---------- Loading data ----------

/** Everything the Today page reads, fetched in parallel. All queries are scoped to this user. */
async function loadDashboardData(userId: string, now: Date) {
  const notDone = { userId, status: { not: "COMPLETED" as const }, class: { archived: false } };
  const rowSelect = {
    id: true,
    title: true,
    dueAt: true,
    source: true,
    class: { select: { name: true, color: true } },
  } as const;
  const weekFromNow = new Date(now.getTime() + WEEK_MS);

  const [classes, plan, overdue, upcoming, exams, overdueCount, dueThisWeek, sessionHistory, canvasConnection, mastery, lastCheck, weekSessions] =
    await Promise.all([
      db.class.findMany({
        where: { userId, archived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true, weeklyHours: true, termEnd: true, archiveSuggestionDismissedAt: true },
      }),
      generatePlanForUser(userId, now),
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
        where: { userId, examAt: { gte: now }, class: { archived: false } },
        orderBy: { examAt: "asc" },
        take: COMING_UP_LIMIT,
        select: { id: true, classId: true, title: true, examAt: true, class: { select: { name: true, color: true } } },
      }),
      db.assignment.count({ where: { ...notDone, dueAt: { lt: now } } }),
      db.assignment.count({ where: { ...notDone, dueAt: { gte: now, lt: weekFromNow } } }),
      db.studySession.findMany({
        where: { userId, status: { in: ["COMPLETED", "ABANDONED"] } },
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
        where: { userId },
        select: { status: true },
      }),
      getMastery(userId, now),
      db.assessment.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, topic: true, estimateLow: true, estimateHigh: true, createdAt: true },
      }),
      db.studySession.findMany({
        where: { userId, status: "COMPLETED", startedAt: { gte: new Date(now.getTime() - WEEK_MS) } },
        select: {
          actualMinutes: true,
          plannedMinutes: true,
          assignment: { select: { classId: true } },
          exam: { select: { classId: true } },
        },
      }),
      logEvent(userId, "dashboard_viewed"),
    ]);

  return {
    classes,
    plan,
    overdue,
    upcoming,
    exams,
    overdueCount,
    dueThisWeek,
    sessionHistory,
    canvasConnection,
    mastery,
    lastCheck,
    weekSessions,
  };
}

// ---------- Preparing data ----------

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Real study time in the last 7 days, from finished sessions. */
function minutesStudiedThisWeek(sessions: SessionRecord[], now: Date): number {
  const weekAgo = now.getTime() - WEEK_MS;
  let total = 0;
  for (const session of sessions) {
    if (session.status === "COMPLETED" && session.startedAt.getTime() > weekAgo) {
      total += session.actualMinutes ?? session.plannedMinutes;
    }
  }
  return total;
}

/** A shareable streak card link, only once the streak is worth sharing (2+ days). */
async function buildStreakShareUrl(userId: string, currentStreak: number, studiedMinutes: number): Promise<string | null> {
  if (currentStreak < 2) {
    return null;
  }
  const code = await getOrCreateReferralCode(userId);
  const token = encodeStreakCard({ code, streak: currentStreak, minutes: studiedMinutes });
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${appUrl}/s/${token}`;
}

/** For example "today at 4:00 PM" or "Thursday at 9:30 AM". */
function describeBlockTime(session: ScheduledSession, today: string): string {
  let day: string;
  if (session.scheduledDate === today) {
    day = "today";
  } else {
    day = formatDateKey(session.scheduledDate, { weekday: "long" });
  }
  return `${day} at ${formatMinuteOfDay(session.startMinute ?? 0)}`;
}

/** The top three "why this first" bullets for the One Thing card. */
function buildNextUpReasons(
  next: ScoredItem,
  now: Date,
  allScored: ScoredItem[],
  history: SessionRecord[],
  timeZone: string,
): string[] {
  const estimate = adjustEstimate(next.item.rawEstimatedMinutes, next.item.className, buildEstimationProfile(history));
  const patterns = buildPatterns(history);
  const reasons = buildOneThingReasons(next, now, allScored, estimate, patterns, timeZone);
  return reasons.slice(0, 3);
}

function assignmentRow(assignment: AssignmentListItem, overdue: boolean): ComingUpRow {
  return {
    key: `a-${assignment.id}`,
    id: assignment.id,
    href: "/assignments",
    title: assignment.title,
    className: assignment.class.name,
    classColor: assignment.class.color,
    at: assignment.dueAt,
    kind: "assignment",
    fromCanvas: assignment.source === "CANVAS",
    overdue,
  };
}

function examRow(exam: ExamListItem): ComingUpRow {
  return {
    key: `e-${exam.id}`,
    id: exam.id,
    href: "/exams",
    title: exam.title,
    className: exam.class.name,
    classColor: exam.class.color,
    at: exam.examAt,
    kind: "exam",
    fromCanvas: false,
    overdue: false,
  };
}

/** Overdue work first, then upcoming assignments and exams sorted by date. */
function buildComingUpRows(
  overdue: AssignmentListItem[],
  upcoming: AssignmentListItem[],
  exams: ExamListItem[],
): ComingUpRow[] {
  const overdueRows = overdue.map((assignment) => assignmentRow(assignment, true));

  const futureRows = [
    ...upcoming.map((assignment) => assignmentRow(assignment, false)),
    ...exams.map(examRow),
  ];
  futureRows.sort((a, b) => a.at.getTime() - b.at.getTime());

  return [...overdueRows, ...futureRows].slice(0, COMING_UP_LIMIT);
}

function buildWeekBars(days: DayPlan[] | undefined): WeekDayBar[] {
  const nextSevenDays = (days ?? []).slice(0, 7);
  return nextSevenDays.map((day) => ({
    key: day.date,
    label: formatDateKey(day.date, { weekday: "long", month: "short", day: "numeric" }),
    letter: formatDateKey(day.date, { weekday: "narrow" }),
    minutes: day.plannedMinutes,
    availableMinutes: day.availableMinutes,
  }));
}

/** Open work due in the next 7 days (overdue included) and how much of it is placed. */
function workRemainingThisWeek(plan: UserPlan, now: Date, tz: string, today: string) {
  let dueMinutes = 0;
  let items = 0;
  for (const scored of plan.scored) {
    if (scored.item.kind === "review") continue;
    if (calendarDaysBetween(scored.item.dueAt, now, tz) > 6) continue;
    dueMinutes += scored.item.remainingMinutes;
    items++;
  }
  let reviewMinutes = 0;
  for (const session of plan.sessions) {
    if (session.item.kind === "review" && session.scheduledDate >= today) reviewMinutes += session.scheduledMinutes;
  }
  return { dueMinutes, items, reviewMinutes };
}

/** The earliest upcoming exam, with a readiness estimate from its course's topics. */
function buildNextAssessment(plan: UserPlan, exams: ExamListItem[], now: Date, tz: string): NextAssessment | null {
  const exam = exams[0];
  if (!exam) return null;
  const course = plan.learning.courses.find((c) => c.id === exam.classId);
  const scored = plan.scored.find((s) => s.item.kind === "exam" && s.item.id === exam.id);
  let plannedPrepMinutes = 0;
  for (const session of plan.sessions) {
    if (session.item.kind === "exam" && session.item.id === exam.id) plannedPrepMinutes += session.scheduledMinutes;
  }
  const neededPrepMinutes = scored?.item.remainingMinutes ?? 0;
  const daysLeft = Math.max(0, calendarDaysBetween(exam.examAt, now, tz));
  return {
    examId: exam.id,
    classId: exam.classId,
    title: exam.title,
    className: exam.class.name,
    classColor: exam.class.color,
    examAt: exam.examAt,
    daysLeft,
    plannedPrepMinutes,
    neededPrepMinutes,
    readiness: assessReadiness({
      className: exam.class.name,
      daysLeft,
      topics: (course?.learning.topics ?? []).map((t) => ({ id: t.id, title: t.title, estimate: t.estimate })),
      plannedPrepMinutes,
      neededPrepMinutes,
      shortMinutes: plan.unscheduledMinutesByItem[exam.id] ?? 0,
    }),
  };
}

/** Minutes of work that can't fit before their deadlines. */
function totalShortfallMinutes(plan: UserPlan): number {
  let total = 0;
  for (const minutes of Object.values(plan.unscheduledMinutesByItem)) {
    total += minutes;
  }
  return total;
}

// ---------- Page ----------

export default async function DashboardPage() {
  const user = await requireUser();
  const now = await currentTime();
  const {
    classes,
    plan,
    overdue,
    upcoming,
    exams,
    overdueCount,
    dueThisWeek,
    sessionHistory,
    canvasConnection,
    mastery,
    lastCheck,
    weekSessions,
  } = await loadDashboardData(user.id, now);
  const review = nextReview(mastery);

  const tz = plan.timeZone;
  const today = dateKey(now, tz);

  // Keep the plan history current (a new day may have left a block missed), then
  // read the latest "what changed".
  await rollPlanForward(user.id, plan, now);
  const changeNote = await latestChangeNote(user.id, now, tz, true);
  const history: SessionRecord[] = sessionHistory.map((row) => ({
    ...row,
    status: row.status as "COMPLETED" | "ABANDONED",
  }));

  // Streak
  const streak = await getStreak(user.id, tz, now);
  const studiedMinutes = minutesStudiedThisWeek(history, now);
  const streakShareUrl = await buildStreakShareUrl(user.id, streak.current, studiedMinutes);

  // Today
  const todaySessions = plan.sessions.filter((session) => session.scheduledDate === today);
  let plannedMinutesToday = 0;
  for (const session of todaySessions) {
    plannedMinutesToday += session.scheduledMinutes;
  }
  const todayAvailable = plan.days?.[0]?.availableMinutes ?? 0;
  const noAvailability = (plan.warnings ?? []).some((warning) => warning.type === "NO_AVAILABILITY");
  const laterSession = plan.sessions.find((session) => session.scheduledDate > today);

  // Each item's score, so rows can show a pulse badge and "why" reasons.
  const scoredById = new Map(plan.scored.map((scored) => [scored.item.id, scored]));
  function pulseFor(itemId: string): number | null {
    const scored = scoredById.get(itemId);
    return scored ? pulseOf(scored.score) : null;
  }
  function reasonsFor(itemId: string): string[] {
    const scored = scoredById.get(itemId);
    return scored ? explainScore(scored, now, plan.scored, tz) : [];
  }

  // The One Thing to do next
  const next = plan.scored[0];
  let nextBlock: ScheduledSession | undefined;
  let nextReasons: string[] = [];
  if (next) {
    nextBlock = plan.sessions.find((session) => session.item.id === next.item.id);
    nextReasons = buildNextUpReasons(next, now, plan.scored, history, tz);
  }

  // Coming up and this week
  const comingUp = buildComingUpRows(overdue, upcoming, exams);
  const week = buildWeekBars(plan.days);
  let weekMinutes = 0;
  for (const day of week) {
    weekMinutes += day.minutes;
  }
  const shortfallMinutes = totalShortfallMinutes(plan);
  const remaining = workRemainingThisWeek(plan, now, tz, today);
  const courseTime = studyTimeByCourse(classes, weekSessions);

  // Outcomes: readiness for the next exam, the biggest gap, mastery by course.
  const nextAssessment = buildNextAssessment(plan, exams, now, tz);
  const activeIds = new Set(classes.map((c) => c.id));
  const activeLearning = plan.learning.courses.filter((c) => activeIds.has(c.id));
  const examDaysByClass = new Map<string, number>();
  for (const exam of exams) {
    if (!examDaysByClass.has(exam.classId)) examDaysByClass.set(exam.classId, Math.max(0, calendarDaysBetween(exam.examAt, now, tz)));
  }
  const gapCandidates: GapCandidate[] = activeLearning.flatMap((course) =>
    course.learning.topics.map((topic) => ({
      topicId: topic.id,
      title: topic.title,
      classId: course.id,
      className: course.name,
      classColor: course.color,
      estimate: topic.estimate,
      remediation: topic.remediation,
    })),
  );
  const gap = pickBiggestGap(gapCandidates, examDaysByClass);
  const masteryRows: CourseMasteryRow[] = activeLearning
    .filter((course) => plan.masteryByClass.has(course.id))
    .map((course) => ({ id: course.id, name: course.name, color: course.color, mastery: plan.masteryByClass.get(course.id)! }));
  const hasEvidence = gapCandidates.some((c) => c.estimate.answers > 0);
  const archiveSuggestions = coursesToSuggestArchiving(
    classes.map((c) => ({ id: c.id, name: c.name, archived: false, termEnd: dateColumnKey(c.termEnd), archiveSuggestionDismissedAt: c.archiveSuggestionDismissedAt })),
    today,
  );

  const name = user.profile?.displayName?.trim();
  const hasWork = plan.scored.length > 0;
  const hasNothingDue = overdueCount === 0 && upcoming.length === 0 && exams.length === 0;

  return (
    <div className="space-y-8">
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
        <StreakPath streak={streak} shareUrl={streakShareUrl} studiedMinutes={studiedMinutes} />
      </header>

      <TryWeekImport />
      {hasNothingDue && <StartWeek teams={teamsAvailable()} />}

      {canvasConnection?.status === "NEEDS_REAUTH" && <CanvasReconnectBanner />}

      {archiveSuggestions.map((course) => (
        <ArchiveSuggestion
          key={course.id}
          classId={course.id}
          name={course.name}
          endedLabel={formatDateKey(course.termEnd!, { month: "short", day: "numeric" })}
        />
      ))}

      {changeNote && <WhatChanged planId={changeNote.planId} sentences={changeNote.sentences} />}

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
          when={nextBlock ? `planned ${describeBlockTime(nextBlock, today)}` : undefined}
          reasons={nextReasons}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:items-start">
        <div className="space-y-6">
          <Panel
            id="today-heading"
            title="Today"
            aside={
              plannedMinutesToday > 0 && (
                <span className="text-sm tabular-nums text-muted-foreground">{formatDuration(plannedMinutesToday)} planned</span>
              )
            }
          >
            {todaySessions.length > 0 ? (
              <ul className="divide-y divide-border">
                {todaySessions.map((session, index) => (
                  <TodayPlanItem
                    key={`${session.item.id}-${index}`}
                    itemId={session.item.id}
                    itemKind={session.item.kind}
                    assignmentId={session.item.kind === "assignment" ? session.item.id : null}
                    title={session.item.title}
                    className={session.item.className}
                    classColor={session.item.classColor}
                    scheduledMinutes={session.scheduledMinutes}
                    reasons={reasonsFor(session.item.id)}
                    timeLabel={session.startMinute !== undefined ? formatMinuteOfDay(session.startMinute) : undefined}
                  />
                ))}
              </ul>
            ) : (
              <div className="pb-1 pt-2 text-sm">
                <TodayEmptyState
                  hasWork={hasWork}
                  noAvailability={noAvailability}
                  canvasConnected={canvasConnection !== null}
                  todayAvailable={todayAvailable}
                  laterSession={laterSession}
                  today={today}
                />
              </div>
            )}
          </Panel>

          {nextAssessment && <ReadinessPanel next={nextAssessment} tz={tz} now={now} />}

          <Panel
            id="coming-up-heading"
            title="Coming up"
            aside={
              <Link href="/assignments" className="text-sm text-muted-foreground hover:text-foreground">
                All assignments
              </Link>
            }
          >
            {comingUp.length === 0 ? (
              <p className="pb-1 pt-2 text-sm text-muted-foreground">No deadlines or exams ahead.</p>
            ) : (
              <ul className="-mx-2">
                {comingUp.map((row) => (
                  <ComingUpItem key={row.key} row={row} pulse={pulseFor(row.id)} tz={tz} now={now} />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="stagger-enter space-y-6">
          {hasWork && !noAvailability && (
            <ThisWeekSection
              week={week}
              weekMinutes={weekMinutes}
              shortfallMinutes={shortfallMinutes}
              dueMinutes={remaining.dueMinutes}
              dueItems={remaining.items}
              reviewMinutes={remaining.reviewMinutes}
            />
          )}
          {classes.length > 0 && (masteryRows.length > 0 || !aiEnabled) && (
            <LearningPanel gap={gap} courses={masteryRows} hasEvidence={hasEvidence} />
          )}
          {classes.length > 0 && <CourseTimeSection rows={courseTime} />}
          {aiEnabled && masteryRows.length === 0 && <LearningSection review={review} lastCheck={lastCheck} tz={tz} />}
        </div>
      </div>

      <AddWorkSection classes={classes} canvasConnected={canvasConnection !== null} />
    </div>
  );
}

// ---------- Page sections ----------

function CanvasReconnectBanner() {
  return (
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
  );
}

/** What the Today section says when nothing is planned for today. */
function TodayEmptyState({
  hasWork,
  noAvailability,
  canvasConnected,
  todayAvailable,
  laterSession,
  today,
}: {
  hasWork: boolean;
  noAvailability: boolean;
  canvasConnected: boolean;
  todayAvailable: number;
  laterSession: ScheduledSession | undefined;
  today: string;
}) {
  if (!hasWork) {
    return (
      <p className="text-muted-foreground">
        Nothing to plan yet. Add an assignment below
        {canvasConnected ? "" : " or connect Canvas to bring in your deadlines"}.
      </p>
    );
  }

  if (noAvailability) {
    return (
      <p className="text-muted-foreground">
        Rushd doesn&apos;t know when you can study yet, so it can&apos;t place work at specific times.{" "}
        <Link href="/settings#availability" className="font-medium text-foreground underline underline-offset-4">
          Set your study times
        </Link>
      </p>
    );
  }

  return (
    <p className="text-muted-foreground">
      {todayAvailable === 0
        ? "No study time left today."
        : "Nothing needs today's study time."}
      {laterSession && (
        <>
          {" "}Next block: <span className="text-foreground">{laterSession.item.title}</span>,{" "}
          {describeBlockTime(laterSession, today)}.
        </>
      )}{" "}
      <Link href="/plan" className="font-medium text-foreground underline underline-offset-4">
        Open schedule
      </Link>
    </p>
  );
}

function ComingUpItem({ row, pulse, tz, now }: { row: ComingUpRow; pulse: number | null; tz: string; now: Date }) {
  const status = row.overdue ? "overdue" : dueStatus(row.at, tz, now);
  return (
    <li>
      <Link href={row.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-muted/60">
        <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: row.classColor }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{row.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.className}
            {row.kind === "exam" ? " · Exam" : ""}
            {row.fromCanvas ? " · Canvas" : ""}
          </span>
        </span>
        {pulse !== null && <PulseBadge pulse={pulse} className="hidden shrink-0 sm:inline-flex" />}
        <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap sm:w-36">
          <StatusChip status={status} />
          <span className={cn("text-xs tabular-nums", status === "overdue" ? "text-overdue" : "text-muted-foreground")}>
            {formatDueDate(row.at, tz, now)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function LearningSection({
  review,
  lastCheck,
  tz,
}: {
  review: TopicMastery | null;
  lastCheck: LastCheck | null;
  tz: string;
}) {
  return (
    <Panel
      id="learning-heading"
      title="Learning"
      aside={
        <Link href="/mastery" className="text-sm text-muted-foreground hover:text-foreground">
          Mastery
        </Link>
      }
    >
      <LearningSummary review={review} lastCheck={lastCheck} tz={tz} />
    </Panel>
  );
}

/** The topic to review next, or a nudge to run a practice check. */
function LearningSummary({
  review,
  lastCheck,
  tz,
}: {
  review: TopicMastery | null;
  lastCheck: LastCheck | null;
  tz: string;
}) {
  if (review) {
    const tutorPrompt = `Help me review ${review.topicLabel}. Start with a quick diagnostic question.`;
    return (
      <div className="flex flex-col gap-3 pb-1 pt-2">
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
        <div className="flex flex-wrap gap-2">
          <Link href={`/tutor?ask=${encodeURIComponent(tutorPrompt)}`} className={buttonVariants({ variant: "outline" })}>
            Review with tutor
          </Link>
          <Link href="/practice" className={buttonVariants({ variant: "ghost" })}>
            Check again
          </Link>
        </div>
      </div>
    );
  }

  if (lastCheck) {
    return (
      <p className="pb-1 pt-2 text-sm text-muted-foreground">
        Your last check ({lastCheck.topic}, {Math.round(lastCheck.estimateLow)}–{Math.round(lastCheck.estimateHigh)}%) didn&apos;t flag anything to review.{" "}
        <Link href="/practice" className="font-medium text-foreground underline underline-offset-4">Check something new</Link>
      </p>
    );
  }

  return (
    <p className="pb-1 pt-2 text-sm text-muted-foreground">
      Snap a photo of practice problems and Rushd shows what you&apos;ve got down and what to study next.{" "}
      <Link href="/practice" className="font-medium text-foreground underline underline-offset-4">Check my work</Link>
    </p>
  );
}

function ThisWeekSection({
  week,
  weekMinutes,
  shortfallMinutes,
  dueMinutes,
  dueItems,
  reviewMinutes,
}: {
  week: WeekDayBar[];
  weekMinutes: number;
  shortfallMinutes: number;
  dueMinutes: number;
  dueItems: number;
  reviewMinutes: number;
}) {
  let availableMinutes = 0;
  for (const day of week) availableMinutes += day.availableMinutes;
  let busiest: WeekDayBar | undefined;
  for (const day of week) {
    if (day.minutes > 0 && (!busiest || day.minutes > busiest.minutes)) busiest = day;
  }
  return (
    <Panel
      id="week-heading"
      title="This week"
      aside={
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatDuration(weekMinutes)} of {formatDuration(availableMinutes)}
        </span>
      }
    >
      <div className="pt-2">
        <p className="mb-3 text-sm">
          {dueItems === 0 ? (
            <span className="text-muted-foreground">Nothing is due in the next 7 days.</span>
          ) : (
            <>
              <span className="font-medium tabular-nums">{formatDuration(dueMinutes)}</span>
              <span className="text-muted-foreground">
                {" "}of work due in the next 7 days ({dueItems} {dueItems === 1 ? "item" : "items"})
              </span>
            </>
          )}
          {reviewMinutes > 0 && <span className="text-muted-foreground">, plus {formatDuration(reviewMinutes)} of review.</span>}
        </p>
        <WorkloadBars days={week} />
        {busiest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Busiest: <span className="text-foreground">{busiest.label.split(",")[0]}</span>, {formatDuration(busiest.minutes)}
          </p>
        )}
        {shortfallMinutes > 0 && (
          <p className="mt-3 flex items-start gap-2 text-sm">
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
    </Panel>
  );
}

/** Real study time per course over the last 7 days, against each course's own weekly goal. */
function CourseTimeSection({ rows }: { rows: CourseStudyTime[] }) {
  return (
    <Panel id="course-time-heading" title="Your courses" aside={<span className="text-sm text-muted-foreground">Last 7 days</span>}>
      {rows.length === 0 ? (
        <p className="pb-1 pt-2 text-sm text-muted-foreground">
          Finish a study session or set a weekly goal on a course, and its study time shows up here.{" "}
          <Link href="/courses" className="font-medium text-foreground underline underline-offset-4">
            Courses
          </Link>
        </p>
      ) : (
        <ul className="space-y-3 pb-1 pt-2">
          {rows.map((row) => {
            const percent = row.goalMinutes ? Math.min(100, Math.round((row.minutes / row.goalMinutes) * 100)) : null;
            return (
              <li key={row.id} style={{ ["--course" as string]: row.color }}>
                <Link href={`/courses/${row.id}`} className="group block rounded-md">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="course-rule h-2 w-2 shrink-0 rounded-full" />
                      <span className="truncate group-hover:underline group-hover:underline-offset-4">{row.name}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDuration(row.minutes)}
                      {row.goalMinutes ? ` of ${formatDuration(row.goalMinutes)}` : " studied"}
                    </span>
                  </span>
                  {percent !== null && (
                    <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="course-rule block h-full rounded-full" style={{ width: `${percent}%` }} />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function AddWorkSection({ classes, canvasConnected }: { classes: ClassOption[]; canvasConnected: boolean }) {
  return (
    <Panel id="add-heading" title="Add work">
      <div className="space-y-3 pb-1 pt-1">
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
          {!canvasConnected && (
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
      </div>
    </Panel>
  );
}
