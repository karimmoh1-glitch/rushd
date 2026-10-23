import "server-only";
import { db } from "@/lib/db";
import { generatePlanForUser } from "@/lib/planning/generate-for-user";
import { pulseOf } from "@/lib/planning/pulse";
import { dueStatus, formatDueDate, type DueStatus } from "@/lib/format";
import { localDateKey, resolveTimeZone } from "@/lib/time/zone";
import { levelLabel } from "@/lib/courses/catalog";
import { toDateInput } from "@/lib/courses/service";
import { termProgress, type TermProgress } from "@/lib/courses/term";
import { studyTimeByCourse } from "@/lib/courses/study-time";

// Read models for the native app's API. Every query is scoped to userId, so
// another student's ids simply match nothing (the routes answer 404).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ApiAssignment {
  id: string;
  title: string;
  course: { id: string; name: string; color: string };
  dueAt: string;
  dueStatus: DueStatus;
  dueLabel: string;
  estimatedMinutes: number;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  notes: string | null;
  source: "MANUAL" | "CANVAS" | "TEAMS" | "CALENDAR";
  completedAt: string | null;
  removedUpstream: boolean;
  /** 0–100, how strongly it needs the student now (the planner's order). Null for finished work. */
  pulse: number | null;
}

const assignmentSelect = {
  id: true,
  title: true,
  dueAt: true,
  estimatedMinutes: true,
  priority: true,
  status: true,
  notes: true,
  source: true,
  completedAt: true,
  canvasRemovedAt: true,
  class: { select: { id: true, name: true, color: true } },
} as const;

type AssignmentRecord = {
  id: string;
  title: string;
  dueAt: Date;
  estimatedMinutes: number;
  priority: ApiAssignment["priority"];
  status: ApiAssignment["status"];
  notes: string | null;
  source: ApiAssignment["source"];
  completedAt: Date | null;
  canvasRemovedAt: Date | null;
  class: { id: string; name: string; color: string };
};

async function userTimeZone(userId: string): Promise<string> {
  const profile = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return resolveTimeZone(profile?.timezone);
}

function toApiAssignment(row: AssignmentRecord, pulse: number | null, timeZone: string, now: Date): ApiAssignment {
  const done = row.status === "COMPLETED";
  return {
    id: row.id,
    title: row.title,
    course: row.class,
    dueAt: row.dueAt.toISOString(),
    dueStatus: dueStatus(row.dueAt, timeZone, now),
    dueLabel: formatDueDate(row.dueAt, timeZone, now),
    estimatedMinutes: row.estimatedMinutes,
    priority: row.priority,
    status: row.status,
    notes: row.notes,
    source: row.source,
    completedAt: row.completedAt?.toISOString() ?? null,
    removedUpstream: row.canvasRemovedAt !== null,
    pulse: done ? null : pulse,
  };
}

export type AssignmentFilter = "open" | "completed" | "all";

/**
 * The student's assignments. Open work is ranked like the web's Assignments
 * page: by Pulse (the planner's order), deadline breaking ties; work Canvas
 * no longer lists comes after it. Completed work is newest first.
 */
export async function listAssignments(userId: string, filter: AssignmentFilter, now = new Date()): Promise<ApiAssignment[]> {
  const where =
    filter === "open"
      ? { userId, status: { not: "COMPLETED" as const } }
      : filter === "completed"
        ? { userId, status: "COMPLETED" as const }
        : { userId };
  const [rows, plan, timeZone] = await Promise.all([
    db.assignment.findMany({ where, orderBy: { dueAt: "asc" }, select: assignmentSelect }),
    generatePlanForUser(userId, now),
    userTimeZone(userId),
  ]);
  const pulseById = new Map(plan.scored.map((scored) => [scored.item.id, pulseOf(scored.score)]));

  const open = rows.filter((row) => row.status !== "COMPLETED" && !row.canvasRemovedAt);
  open.sort((a, b) => {
    const difference = (pulseById.get(b.id) ?? 0) - (pulseById.get(a.id) ?? 0);
    if (difference !== 0) return difference;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });
  const removed = rows.filter((row) => row.status !== "COMPLETED" && row.canvasRemovedAt);
  const completed = rows
    .filter((row) => row.status === "COMPLETED")
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  return [...open, ...removed, ...completed].map((row) =>
    toApiAssignment(row, pulseById.get(row.id) ?? null, timeZone, now),
  );
}

export async function getAssignment(userId: string, id: string, now = new Date()): Promise<ApiAssignment | null> {
  const row = await db.assignment.findFirst({ where: { id, userId }, select: assignmentSelect });
  if (!row) return null;
  const timeZone = await userTimeZone(userId);
  let pulse: number | null = null;
  if (row.status !== "COMPLETED") {
    const plan = await generatePlanForUser(userId, now);
    const scored = plan.scored.find((item) => item.item.id === id);
    pulse = scored ? pulseOf(scored.score) : null;
  }
  return toApiAssignment(row, pulse, timeZone, now);
}

/** The raw row the PATCH route merges partial edits into. */
export async function getAssignmentForEdit(userId: string, id: string) {
  return db.assignment.findFirst({
    where: { id, userId },
    select: { classId: true, title: true, dueAt: true, estimatedMinutes: true, priority: true, status: true, notes: true },
  });
}

export interface ApiCourse {
  id: string;
  name: string;
  color: string;
  level: string | null;
  levelLabel: string | null;
  code: string | null;
  institution: string | null;
  subject: string | null;
  teacher: string | null;
  period: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  archived: boolean;
  termStart: string | null;
  termEnd: string | null;
  term: TermProgress | null;
  weeklyGoalMinutes: number | null;
  openAssignmentCount: number;
  upcomingExamCount: number;
  studiedMinutesLast7Days: number;
}

const courseSelect = {
  id: true,
  name: true,
  color: true,
  level: true,
  code: true,
  institution: true,
  subject: true,
  teacher: true,
  period: true,
  priority: true,
  archived: true,
  termStart: true,
  termEnd: true,
  weeklyHours: true,
} as const;

async function courseRows(userId: string, now: Date, courseId?: string) {
  const where = courseId ? { userId, id: courseId } : { userId };
  const [courses, openCounts, examCounts, weekSessions, timeZone] = await Promise.all([
    db.class.findMany({ where, orderBy: [{ archived: "asc" }, { createdAt: "asc" }], select: courseSelect }),
    db.assignment.groupBy({
      by: ["classId"],
      where: { userId, status: { not: "COMPLETED" }, canvasRemovedAt: null, ...(courseId ? { classId: courseId } : {}) },
      _count: { _all: true },
    }),
    db.exam.groupBy({
      by: ["classId"],
      where: { userId, examAt: { gte: now }, ...(courseId ? { classId: courseId } : {}) },
      _count: { _all: true },
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
    userTimeZone(userId),
  ]);
  const today = localDateKey(now, timeZone);
  const openByClass = new Map(openCounts.map((row) => [row.classId, row._count._all]));
  const examsByClass = new Map(examCounts.map((row) => [row.classId, row._count._all]));
  const studied = new Map(studyTimeByCourse(courses, weekSessions).map((row) => [row.id, row.minutes]));

  const result: ApiCourse[] = courses.map((course) => {
    const termStart = toDateInput(course.termStart) ?? null;
    const termEnd = toDateInput(course.termEnd) ?? null;
    return {
      id: course.id,
      name: course.name,
      color: course.color,
      level: course.level,
      levelLabel: levelLabel(course.level),
      code: course.code,
      institution: course.institution,
      subject: course.subject,
      teacher: course.teacher,
      period: course.period,
      priority: course.priority,
      archived: course.archived,
      termStart,
      termEnd,
      term: termProgress(termStart ?? undefined, termEnd ?? undefined, today),
      weeklyGoalMinutes: course.weeklyHours ? course.weeklyHours * 60 : null,
      openAssignmentCount: openByClass.get(course.id) ?? 0,
      upcomingExamCount: examsByClass.get(course.id) ?? 0,
      studiedMinutesLast7Days: studied.get(course.id) ?? 0,
    };
  });
  return { courses: result, timeZone };
}

export async function listCourses(userId: string, now = new Date()): Promise<ApiCourse[]> {
  return (await courseRows(userId, now)).courses;
}

export interface ApiCourseDetail {
  course: ApiCourse;
  openAssignments: ApiAssignment[];
  upcomingExams: { id: string; title: string; examAt: string; dueStatus: DueStatus; dueLabel: string; prepMinutes: number }[];
}

export async function getCourse(userId: string, id: string, now = new Date()): Promise<ApiCourseDetail | null> {
  const { courses, timeZone } = await courseRows(userId, now, id);
  const course = courses[0];
  if (!course) return null;

  const [assignments, exams, plan] = await Promise.all([
    db.assignment.findMany({
      where: { userId, classId: id, status: { not: "COMPLETED" }, canvasRemovedAt: null },
      orderBy: { dueAt: "asc" },
      take: 20,
      select: assignmentSelect,
    }),
    db.exam.findMany({
      where: { userId, classId: id, examAt: { gte: now } },
      orderBy: { examAt: "asc" },
      take: 10,
      select: { id: true, title: true, examAt: true, prepMinutes: true },
    }),
    generatePlanForUser(userId, now),
  ]);
  const pulseById = new Map(plan.scored.map((scored) => [scored.item.id, pulseOf(scored.score)]));

  return {
    course,
    openAssignments: assignments.map((row) => toApiAssignment(row, pulseById.get(row.id) ?? null, timeZone, now)),
    upcomingExams: exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      examAt: exam.examAt.toISOString(),
      dueStatus: dueStatus(exam.examAt, timeZone, now),
      dueLabel: formatDueDate(exam.examAt, timeZone, now),
      prepMinutes: exam.prepMinutes,
    })),
  };
}
