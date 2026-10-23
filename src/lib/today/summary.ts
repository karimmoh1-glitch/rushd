import "server-only";
import { dateKey, explainScore } from "@/lib/planning";
import type { ScheduledSession } from "@/lib/planning/types";
import { formatDateInZone, formatMinuteOfDay } from "@/lib/time/zone";
import { dueStatus, formatDueDate, type DueStatus } from "@/lib/format";
import type { SessionRecord } from "@/lib/insights/build-insights";
import { pulseOf } from "@/lib/planning/pulse";
import { studyTimeByCourse, type CourseStudyTime } from "@/lib/courses/study-time";
import {
  buildComingUpRows,
  buildNextUpReasons,
  buildWeekBars,
  describeBlockTime,
  loadDashboardData,
  minutesStudiedThisWeek,
  pickNextUp,
  totalShortfallMinutes,
} from "@/lib/today/dashboard-data";

// The Today screen as plain JSON for the native app (GET /api/v1/today). It
// is built from the same loaders and helpers as the web dashboard, so both
// show the same next step, blocks, deadlines, and week.

type ItemKind = "assignment" | "exam";

// Topic reviews (planner blocks of kind "review") aren't in the app yet: it
// can only start sessions for assignments and exams, so they're left out here.
const APP_KINDS: ReadonlySet<"assignment" | "exam" | "review"> = new Set(["assignment", "exam"]);
function isAppKind(kind: string): kind is ItemKind {
  return kind === "assignment" || kind === "exam";
}

export interface TodaySummary {
  timeZone: string;
  date: string; // "YYYY-MM-DD" in the student's zone
  dateLabel: string; // "Thursday, October 22"
  overdueCount: number;
  dueThisWeek: number;
  minutesStudiedThisWeek: number;
  nextUp: {
    itemId: string;
    kind: ItemKind;
    assignmentId: string | null;
    examId: string | null;
    title: string;
    courseName: string;
    courseColor: string;
    minutes: number;
    pulse: number;
    plannedLabel: string | null; // "planned today at 4:00 PM"
    reasons: string[];
  } | null;
  todayBlocks: {
    itemId: string;
    kind: ItemKind;
    title: string;
    courseName: string;
    courseColor: string;
    minutes: number;
    startMinute: number | null;
    timeLabel: string | null;
    pinned: boolean;
    reasons: string[];
  }[];
  plannedMinutesToday: number;
  todayEmpty: {
    hasWork: boolean;
    noAvailability: boolean;
    availableMinutesToday: number;
    laterBlock: { title: string; when: string } | null;
  };
  comingUp: {
    id: string;
    kind: ItemKind;
    title: string;
    courseName: string;
    courseColor: string;
    at: string;
    dueStatus: DueStatus;
    dueLabel: string;
    fromCanvas: boolean;
    pulse: number | null;
  }[];
  week: {
    show: boolean; // false when there's no work or no study times yet (the web hides it too)
    plannedMinutes: number;
    shortfallMinutes: number;
    days: { date: string; label: string; letter: string; minutes: number; availableMinutes: number }[];
  };
  courseStudyTime: CourseStudyTime[];
}

export async function getTodaySummary(userId: string, now = new Date()): Promise<TodaySummary> {
  const data = await loadDashboardData(userId, now, { client: "api" });
  const { plan } = data;
  const tz = plan.timeZone;
  const today = dateKey(now, tz);
  const history: SessionRecord[] = data.sessionHistory.map((row) => ({
    ...row,
    status: row.status as "COMPLETED" | "ABANDONED",
  }));

  const scoredById = new Map(plan.scored.map((scored) => [scored.item.id, scored]));
  const reasonsFor = (itemId: string) => {
    const scored = scoredById.get(itemId);
    return scored ? explainScore(scored, now, plan.scored, tz) : [];
  };

  let nextUp: TodaySummary["nextUp"] = null;
  const next = pickNextUp(plan, today, APP_KINDS);
  if (next && isAppKind(next.item.kind)) {
    const block: ScheduledSession | undefined = plan.sessions.find((session) => session.item.id === next.item.id);
    nextUp = {
      itemId: next.item.id,
      kind: next.item.kind,
      assignmentId: next.item.kind === "assignment" ? next.item.id : null,
      examId: next.item.kind === "exam" ? next.item.id : null,
      title: next.item.title,
      courseName: next.item.className,
      courseColor: next.item.classColor,
      minutes: next.item.remainingMinutes,
      pulse: pulseOf(next.score),
      plannedLabel: block ? `planned ${describeBlockTime(block, today)}` : null,
      reasons: buildNextUpReasons(next, now, plan.scored, history, tz),
    };
  }

  const todaySessions = plan.sessions.filter(
    (session): session is ScheduledSession & { item: { kind: ItemKind } } =>
      session.scheduledDate === today && isAppKind(session.item.kind),
  );
  let plannedMinutesToday = 0;
  for (const session of todaySessions) plannedMinutesToday += session.scheduledMinutes;
  const laterSession = plan.sessions.find((session) => session.scheduledDate > today);
  const noAvailability = (plan.warnings ?? []).some((warning) => warning.type === "NO_AVAILABILITY");
  const hasWork = plan.scored.length > 0;

  const week = buildWeekBars(plan.days);
  let weekMinutes = 0;
  for (const day of week) weekMinutes += day.minutes;

  return {
    timeZone: tz,
    date: today,
    dateLabel: formatDateInZone(now, tz, { weekday: "long", month: "long", day: "numeric" }),
    overdueCount: data.overdueCount,
    dueThisWeek: data.dueThisWeek,
    minutesStudiedThisWeek: minutesStudiedThisWeek(history, now),
    nextUp,
    todayBlocks: todaySessions.map((session) => ({
      itemId: session.item.id,
      kind: session.item.kind,
      title: session.item.title,
      courseName: session.item.className,
      courseColor: session.item.classColor,
      minutes: session.scheduledMinutes,
      startMinute: session.startMinute ?? null,
      timeLabel: session.startMinute !== undefined ? formatMinuteOfDay(session.startMinute) : null,
      pinned: session.pinned ?? false,
      reasons: reasonsFor(session.item.id),
    })),
    plannedMinutesToday,
    todayEmpty: {
      hasWork,
      noAvailability,
      availableMinutesToday: plan.days?.[0]?.availableMinutes ?? 0,
      laterBlock: laterSession ? { title: laterSession.item.title, when: describeBlockTime(laterSession, today) } : null,
    },
    comingUp: buildComingUpRows(data.overdue, data.upcoming, data.exams).map((row) => {
      const scored = scoredById.get(row.id);
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        courseName: row.className,
        courseColor: row.classColor,
        at: row.at.toISOString(),
        dueStatus: row.overdue ? "overdue" : dueStatus(row.at, tz, now),
        dueLabel: formatDueDate(row.at, tz, now),
        fromCanvas: row.fromCanvas,
        pulse: scored ? pulseOf(scored.score) : null,
      };
    }),
    week: {
      show: hasWork && !noAvailability,
      plannedMinutes: weekMinutes,
      shortfallMinutes: totalShortfallMinutes(plan),
      days: week.map((day) => ({
        date: day.key,
        label: day.label,
        letter: day.letter,
        minutes: day.minutes,
        availableMinutes: day.availableMinutes,
      })),
    },
    courseStudyTime: studyTimeByCourse(data.classes, data.weekSessions),
  };
}
