import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { formatDateKey, localDateKey } from "@/lib/time/zone";
import { levelLabel } from "@/lib/courses/catalog";
import { toDateInput } from "@/lib/courses/service";
import { termProgress } from "@/lib/courses/term";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EditCourseButton } from "./edit-course-button";
import { SyncContentButton } from "./sync-content-button";
import { CourseTabs } from "./course-tabs";

// The course workspace header and tabs, shared by Overview, Topics, Practice and Mistakes.

export async function getCourseHeader(userId: string, id: string) {
  return db.class.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      color: true,
      teacher: true,
      period: true,
      priority: true,
      archived: true,
      level: true,
      code: true,
      institution: true,
      subject: true,
      termStart: true,
      termEnd: true,
      weeklyHours: true,
      canvasCourses: { where: { selected: true }, select: { name: true, contentSyncedAt: true, contentSyncNote: true }, take: 1 },
    },
  });
}

export type CourseHeaderData = NonNullable<Awaited<ReturnType<typeof getCourseHeader>>>;

export function CourseHeader({ course, timeZone, now }: { course: CourseHeaderData; timeZone: string; now: Date }) {
  const canvas = course.canvasCourses[0] ?? null;
  const termStart = toDateInput(course.termStart);
  const termEnd = toDateInput(course.termEnd);
  const term = termProgress(termStart, termEnd, localDateKey(now, timeZone));
  const identity = [levelLabel(course.level ?? undefined), course.code, course.institution, course.subject].filter(Boolean).join(" · ");
  const people = [course.teacher, course.period].filter(Boolean).join(" · ");

  return (
    <header
      style={{ ["--course" as string]: course.color }}
      className="course-tint relative -mx-4 overflow-hidden px-4 pt-5 sm:mx-0 sm:rounded-2xl sm:px-7 sm:pt-6 sm:ring-1 sm:ring-foreground/[0.07]"
    >
      <span aria-hidden="true" className="course-rule absolute inset-x-0 top-0 h-1" />
      <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">
        Courses
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-tight text-balance sm:text-[2.5rem]">{course.name}</h1>
          {identity && <p className="course-ink mt-2 text-sm font-medium">{identity}</p>}
          {people && <p className="mt-0.5 text-sm text-muted-foreground">{people}</p>}
          {course.archived && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Archived</Badge>
              Hidden from your plan. Restore it from the Courses page.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <EditCourseButton
            timeZone={timeZone}
            course={{
              id: course.id,
              name: course.name,
              teacher: course.teacher ?? undefined,
              period: course.period ?? undefined,
              color: course.color,
              priority: course.priority,
              level: course.level ?? undefined,
              code: course.code ?? undefined,
              institution: course.institution ?? undefined,
              subject: course.subject ?? undefined,
              termStart,
              termEnd,
              weeklyHours: course.weeklyHours ?? undefined,
            }}
          />
          {canvas && <SyncContentButton classId={course.id} />}
          {aiEnabled && (
            <Link href={`/tutor?classId=${course.id}`} className={buttonVariants({ variant: "outline" })}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              Ask the tutor
            </Link>
          )}
        </div>
      </div>
      {term?.state === "running" && termStart && termEnd && (
        <div className="mt-5 max-w-md">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {formatDateKey(termStart, { month: "short", day: "numeric" })} – {formatDateKey(termEnd, { month: "short", day: "numeric" })}
            </span>
            <span className="tabular-nums">
              Week {term.week} of {term.weeks}
            </span>
          </div>
          <span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded-full bg-foreground/10">
            <span className="course-rule block h-full rounded-full" style={{ width: `${term.percent}%` }} />
          </span>
        </div>
      )}
      <CourseTabs courseId={course.id} />
    </header>
  );
}
