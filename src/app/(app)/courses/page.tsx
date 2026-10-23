import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ClassCard, type ClassCardData } from "./class-card";
import { AddClassButton } from "./add-class-button";
import Link from "next/link";
import { PathEmpty } from "@/components/brand/path-empty";
import { toDateInput } from "@/lib/courses/service";
import { localDateKey, resolveTimeZone } from "@/lib/time/zone";
import { termProgress } from "@/lib/courses/term";
import { popularCatalogCourses } from "@/lib/courses/usage";
import { dueStatus, formatDueDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Courses",
};

interface ClassRecord {
  id: string;
  name: string;
  teacher: string | null;
  period: string | null;
  color: string;
  priority: ClassCardData["priority"];
  archived: boolean;
  level: ClassCardData["level"] | null;
  code: string | null;
  institution: string | null;
  subject: string | null;
  termStart: Date | null;
  termEnd: Date | null;
  weeklyHours: number | null;
  catalogId: string | null;
  createdAt: Date;
  _count: { assignments: number; exams: number };
}

type NextDue = NonNullable<ClassCardData["nextDue"]>;

function toCardData(course: ClassRecord, today: string, nextDue?: NextDue): ClassCardData {
  const termStart = toDateInput(course.termStart);
  const termEnd = toDateInput(course.termEnd);
  return {
    id: course.id,
    name: course.name,
    teacher: course.teacher ?? undefined,
    period: course.period ?? undefined,
    color: course.color,
    priority: course.priority,
    archived: course.archived,
    level: course.level ?? undefined,
    code: course.code ?? undefined,
    institution: course.institution ?? undefined,
    subject: course.subject ?? undefined,
    termStart,
    termEnd,
    term: termProgress(termStart, termEnd, today),
    weeklyHours: course.weeklyHours ?? undefined,
    catalogId: course.catalogId ?? undefined,
    assignmentCount: course._count.assignments,
    examCount: course._count.exams,
    nextDue,
  };
}

/** Each course's soonest open assignment or upcoming exam, with its due status worked out in the student's time zone. */
async function nextDueByCourse(userId: string, timeZone: string): Promise<Map<string, NextDue>> {
  const now = new Date();
  const [assignments, exams] = await Promise.all([
    db.assignment.findMany({
      where: { userId, status: { not: "COMPLETED" }, canvasRemovedAt: null },
      orderBy: { dueAt: "asc" },
      select: { classId: true, title: true, dueAt: true },
    }),
    db.exam.findMany({
      where: { userId, examAt: { gte: now } },
      orderBy: { examAt: "asc" },
      select: { classId: true, title: true, examAt: true },
    }),
  ]);
  const soonest = new Map<string, { title: string; at: Date; exam: boolean }>();
  const consider = (classId: string, title: string, at: Date, exam: boolean) => {
    const current = soonest.get(classId);
    if (!current || at < current.at) soonest.set(classId, { title, at, exam });
  };
  for (const a of assignments) consider(a.classId, a.title, a.dueAt, false);
  for (const e of exams) consider(e.classId, e.title, e.examAt, true);
  const result = new Map<string, NextDue>();
  for (const [classId, item] of soonest) {
    result.set(classId, {
      title: item.title,
      exam: item.exam,
      status: dueStatus(item.at, timeZone, now),
      dateLabel: formatDueDate(item.at, timeZone, now),
    });
  }
  return result;
}

export default async function ClassesPage() {
  const user = await requireUser();
  const timeZone = resolveTimeZone(user.profile?.timezone);
  const today = localDateKey(new Date(), timeZone);

  const classes = await db.class.findMany({
    where: { userId: user.id },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      teacher: true,
      period: true,
      color: true,
      priority: true,
      archived: true,
      level: true,
      code: true,
      institution: true,
      subject: true,
      termStart: true,
      termEnd: true,
      weeklyHours: true,
      catalogId: true,
      createdAt: true,
      _count: { select: { assignments: true, exams: true } },
    },
  });
  const [popular, profile, nextDue] = await Promise.all([
    popularCatalogCourses(),
    db.profile.findUnique({ where: { userId: user.id }, select: { studyLevel: true } }),
    nextDueByCourse(user.id, timeZone),
  ]);
  // The student's own courses, newest first: "recent" in the picker, and duplicates are marked.
  const ownCourses = [...classes]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((course) => ({ name: course.name, catalogId: course.catalogId, code: course.code, institution: course.institution, archived: course.archived }));

  const active = classes.filter((course) => !course.archived);
  const archived = classes.filter((course) => course.archived);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your courses, with their assignments, materials, and rubrics.
          </p>
        </div>
        <AddClassButton
          timeZone={timeZone}
          context={{ studentLevel: profile?.studyLevel ?? null, popularIds: popular.map((course) => course.catalogId), ownCourses }}
        />
      </div>

      {classes.length === 0 ? (
        <PathEmpty title="No courses yet">
          Add a course, or{" "}
          <Link href="/integrations/canvas" className="underline underline-offset-4">connect Canvas</Link> to import yours.
        </PathEmpty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((course) => (
            <ClassCard key={course.id} data={toCardData(course, today, nextDue.get(course.id))} timeZone={timeZone} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Archived
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {archived.map((course) => (
              <ClassCard key={course.id} data={toCardData(course, today)} timeZone={timeZone} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
