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
  _count: { assignments: number; exams: number };
}

function toCardData(course: ClassRecord, today: string): ClassCardData {
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
    assignmentCount: course._count.assignments,
    examCount: course._count.exams,
  };
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
      _count: { select: { assignments: true, exams: true } },
    },
  });

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
        <AddClassButton timeZone={timeZone} />
      </div>

      {classes.length === 0 ? (
        <PathEmpty title="No courses yet">
          Add a course, or{" "}
          <Link href="/integrations/canvas" className="underline underline-offset-4">connect Canvas</Link> to import yours.
        </PathEmpty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((course) => (
            <ClassCard key={course.id} data={toCardData(course, today)} timeZone={timeZone} />
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
