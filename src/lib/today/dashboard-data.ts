import "server-only";
import { db } from "@/lib/db";
import { generatePlanForUser, type UserPlan } from "@/lib/planning/generate-for-user";
import type { DayPlan, ScheduledSession, ScoredItem } from "@/lib/planning/types";
import { formatDateKey, formatMinuteOfDay } from "@/lib/time/zone";
import type { SessionRecord } from "@/lib/insights/build-insights";
import { buildEstimationProfile, adjustEstimate } from "@/lib/estimation/build-estimation-profile";
import { buildPatterns } from "@/lib/patterns/build-patterns";
import { logEvent } from "@/lib/analytics/log-event";
import { getMastery } from "@/lib/practice/load";
import { buildOneThingReasons } from "@/app/(app)/dashboard/one-thing-reasons";

// What the Today screen reads and how it shapes it: shared by the web
// dashboard (src/app/(app)/dashboard/page.tsx) and the native app's
// GET /api/v1/today (src/lib/today/summary.ts). Every query is scoped to userId.

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const COMING_UP_LIMIT = 7;

// ---------- Types ----------

export interface AssignmentListItem {
  id: string;
  title: string;
  dueAt: Date;
  source: string;
  class: { name: string; color: string };
}

export interface ExamListItem {
  id: string;
  classId: string;
  title: string;
  examAt: Date;
  class: { name: string; color: string };
}

export interface ComingUpRow {
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

export interface WeekDayBar {
  key: string;
  label: string;
  letter: string;
  minutes: number;
  availableMinutes: number;
}

// ---------- Loading data ----------

/** Everything the Today page reads, fetched in parallel. All queries are scoped to this user. */
export async function loadDashboardData(userId: string, now: Date, viewProperties?: Record<string, unknown>) {
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
      logEvent(userId, "dashboard_viewed", viewProperties),
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

/** Real study time in the last 7 days, from finished sessions. */
export function minutesStudiedThisWeek(sessions: SessionRecord[], now: Date): number {
  const weekAgo = now.getTime() - WEEK_MS;
  let total = 0;
  for (const session of sessions) {
    if (session.status === "COMPLETED" && session.startedAt.getTime() > weekAgo) {
      total += session.actualMinutes ?? session.plannedMinutes;
    }
  }
  return total;
}

/** For example "today at 4:00 PM" or "Thursday at 9:30 AM". */
export function describeBlockTime(session: ScheduledSession, today: string): string {
  let day: string;
  if (session.scheduledDate === today) {
    day = "today";
  } else {
    day = formatDateKey(session.scheduledDate, { weekday: "long" });
  }
  return `${day} at ${formatMinuteOfDay(session.startMinute ?? 0)}`;
}

/** The top three "why this first" bullets for the One Thing card. */
export function buildNextUpReasons(
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

export function assignmentRow(assignment: AssignmentListItem, overdue: boolean): ComingUpRow {
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

export function examRow(exam: ExamListItem): ComingUpRow {
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
export function buildComingUpRows(
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

export function buildWeekBars(days: DayPlan[] | undefined): WeekDayBar[] {
  const nextSevenDays = (days ?? []).slice(0, 7);
  return nextSevenDays.map((day) => ({
    key: day.date,
    label: formatDateKey(day.date, { weekday: "long", month: "short", day: "numeric" }),
    letter: formatDateKey(day.date, { weekday: "narrow" }),
    minutes: day.plannedMinutes,
    availableMinutes: day.availableMinutes,
  }));
}

/** Minutes of work that can't fit before their deadlines. */
export function totalShortfallMinutes(plan: UserPlan): number {
  let total = 0;
  for (const minutes of Object.values(plan.unscheduledMinutesByItem)) {
    total += minutes;
  }
  return total;
}

/** The highest-ranked item, skipping anything the student said "not today"
 * or "not this week" to. Undefined when there's nothing left to suggest.
 * `kinds` limits it to what the caller can act on (the native app can't run
 * a topic review yet). */
export function pickNextUp(
  plan: UserPlan,
  today: string,
  kinds: ReadonlySet<ScoredItem["item"]["kind"]> | null = null,
): ScoredItem | undefined {
  const putOff = new Set<string>();
  for (const exclusion of plan.exclusions) {
    if ((exclusion.type === "skip" && exclusion.date === today) || (exclusion.type === "not_this_week" && exclusion.date > today)) {
      putOff.add(`${exclusion.kind}:${exclusion.itemId}`);
    }
  }
  return plan.scored.find(
    (scored) => !putOff.has(`${scored.item.kind}:${scored.item.id}`) && (kinds === null || kinds.has(scored.item.kind)),
  );
}
