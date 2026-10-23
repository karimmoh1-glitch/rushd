import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { searchMaterials } from "@/lib/course/retrieval";
import { getCourseLearning } from "@/lib/learning/load";
import { formatDateInZone, resolveTimeZone } from "@/lib/time/zone";
import { CourseStats, CourseWork, type CourseWorkRow } from "./course-overview";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CourseHeader, getCourseHeader } from "./course-header";
import { LearningSummary } from "./learning-summary";
import { SyllabusOutlineSchema } from "@/lib/syllabus/types";

export const metadata: Metadata = { title: "Course" };
export const maxDuration = 60;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ITEM_LABEL: Record<string, string> = {
  Page: "Page",
  Assignment: "Assignment",
  Quiz: "Quiz",
  Discussion: "Discussion",
  File: "File",
  ExternalUrl: "Link",
  ExternalTool: "Tool",
};

interface ModuleItemRow {
  id: string;
  title: string;
  itemType: string | null;
  indent: number | null;
  url: string | null;
}

function syncStatusText(
  canvas: { contentSyncedAt: Date | null } | null,
  tz: string | null | undefined,
): string {
  if (!canvas) {
    return "Added by hand. Link it to a Canvas course to see modules, pages, and rubrics here.";
  }
  if (!canvas.contentSyncedAt) {
    return "Linked to Canvas. Course content hasn't been synced yet.";
  }
  const syncedAt = formatDateInZone(canvas.contentSyncedAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `Course content from Canvas, last synced ${syncedAt}.`;
}

/** One line in a module: a sub-header, or an item that opens in Rushd, in Canvas, or nowhere. */
function ModuleItem({ item, readerId, courseId }: { item: ModuleItemRow; readerId: string | null; courseId: string }) {
  if (item.itemType === "SubHeader") {
    return (
      <li className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {item.title}
      </li>
    );
  }

  let titleElement: React.ReactNode;
  if (readerId) {
    titleElement = (
      <Link href={`/courses/${courseId}/material/${readerId}`} className="min-w-0 truncate underline-offset-4 hover:underline">
        {item.title}
      </Link>
    );
  } else if (item.url) {
    titleElement = (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate underline-offset-4 hover:underline">
        {item.title}
        <ExternalLink className="h-3 w-3 shrink-0" aria-label="(opens Canvas in a new tab)" />
      </a>
    );
  } else {
    titleElement = <span className="min-w-0 truncate">{item.title}</span>;
  }

  return (
    <li className="flex items-baseline gap-3 py-1 text-sm" style={{ paddingLeft: `${(item.indent ?? 0) * 16}px` }}>
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{ITEM_LABEL[item.itemType ?? ""] ?? item.itemType}</span>
      {titleElement}
    </li>
  );
}

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { q } = await searchParams;
  const tz = user.profile?.timezone;
  const timeZone = resolveTimeZone(tz);
  const now = new Date();

  const course = await getCourseHeader(user.id, id);
  if (!course) notFound();
  const canvas = course.canvasCourses[0] ?? null;

  const [openAssignments, upcomingExams, openCount, weekSessions, modules, pages, assignments, announcements, hits, learning, syllabi] = await Promise.all([
    db.assignment.findMany({
      where: { userId: user.id, classId: course.id, status: { not: "COMPLETED" }, canvasRemovedAt: null },
      orderBy: { dueAt: "asc" },
      take: 8,
      select: { id: true, title: true, dueAt: true },
    }),
    db.exam.findMany({
      where: { userId: user.id, classId: course.id, examAt: { gte: now } },
      orderBy: { examAt: "asc" },
      take: 4,
      select: { id: true, title: true, examAt: true },
    }),
    Promise.all([
      db.assignment.count({ where: { userId: user.id, classId: course.id, status: { not: "COMPLETED" }, canvasRemovedAt: null } }),
      db.exam.count({ where: { userId: user.id, classId: course.id, examAt: { gte: now } } }),
    ]).then(([assignmentCount, examCount]) => assignmentCount + examCount),
    db.studySession.findMany({
      where: {
        userId: user.id,
        status: "COMPLETED",
        startedAt: { gte: new Date(now.getTime() - WEEK_MS) },
        OR: [{ assignment: { classId: course.id } }, { exam: { classId: course.id } }],
      },
      select: { actualMinutes: true, plannedMinutes: true },
    }),
    db.courseModule.findMany({
      where: { userId: user.id, classId: course.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        materials: {
          where: { kind: "MODULE_ITEM" },
          orderBy: { position: "asc" },
          select: { id: true, title: true, itemType: true, targetId: true, indent: true, url: true },
        },
      },
    }),
    db.courseMaterial.findMany({
      where: { userId: user.id, classId: course.id, kind: "PAGE" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, canvasId: true },
    }),
    db.courseMaterial.findMany({
      where: { userId: user.id, classId: course.id, kind: "ASSIGNMENT" },
      orderBy: [{ postedAt: "asc" }],
      select: { id: true, title: true, canvasId: true, postedAt: true, rubric: true, assignmentId: true },
    }),
    db.courseMaterial.findMany({
      where: { userId: user.id, classId: course.id, kind: "ANNOUNCEMENT" },
      orderBy: { postedAt: "desc" },
      take: 5,
      select: { id: true, title: true, postedAt: true },
    }),
    q?.trim() ? searchMaterials(user.id, { query: q, classId: course.id, limit: 10 }) : Promise.resolve(null),
    getCourseLearning(user.id, course.id, now),
    db.courseMaterial.findMany({
      where: { userId: user.id, classId: course.id, kind: "SYLLABUS" },
      orderBy: { postedAt: "desc" },
      take: 3,
      select: { id: true, title: true, postedAt: true, outline: true },
    }),
  ]);
  const latestOutline = syllabi[0] ? (SyllabusOutlineSchema.safeParse(syllabi[0].outline).data ?? null) : null;

  // Module items point at pages and assignments by Canvas id. Find the
  // in-app reader page for each one, where Rushd has the text.
  const pageBySlug = new Map(pages.map((page) => [page.canvasId, page.id]));
  const assignmentByCanvasId = new Map(assignments.map((assignment) => [assignment.canvasId, assignment.id]));
  function readerFor(item: { itemType: string | null; targetId: string | null }): string | null {
    if (!item.targetId) return null;
    if (item.itemType === "Page") return pageBySlug.get(item.targetId) ?? null;
    if (item.itemType === "Assignment") return assignmentByCanvasId.get(item.targetId) ?? null;
    return null;
  }

  // Pages that aren't linked from any module get their own list.
  const inModules = new Set<string>();
  for (const courseModule of modules) {
    for (const item of courseModule.materials) {
      const readerId = readerFor(item);
      if (readerId) inModules.add(readerId);
    }
  }
  const loosePages = pages.filter((page) => !inModules.has(page.id));
  const hasContent = modules.length + pages.length + assignments.length + announcements.length > 0;
  // The course's own open work, soonest first.
  const work: CourseWorkRow[] = [
    ...openAssignments.map((assignment) => ({
      key: `a-${assignment.id}`,
      href: `/assignments/${assignment.id}`,
      title: assignment.title,
      at: assignment.dueAt,
      kind: "assignment" as const,
    })),
    ...upcomingExams.map((exam) => ({
      key: `e-${exam.id}`,
      href: "/exams",
      title: exam.title,
      at: exam.examAt,
      kind: "exam" as const,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  let studiedMinutes = 0;
  for (const session of weekSessions) {
    studiedMinutes += session.actualMinutes ?? session.plannedMinutes;
  }

  function shortDate(date: Date): string {
    return formatDateInZone(date, tz, { month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-8">
      <CourseHeader course={course} timeZone={timeZone} now={now} />

      <div style={{ ["--course" as string]: course.color }} className="space-y-8">
        <CourseStats
          next={work[0]}
          openCount={openCount}
          studiedMinutes={studiedMinutes}
          goalMinutes={course.weeklyHours ? course.weeklyHours * 60 : null}
          tz={timeZone}
          now={now}
        />
        <CourseWork rows={work} tz={timeZone} now={now} />
        {learning && <LearningSummary courseId={course.id} learning={learning} />}
      </div>

      <section aria-labelledby="syllabus-heading" className="space-y-3">
        <h2 id="syllabus-heading" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Syllabus
        </h2>
        {syllabi.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No syllabus yet.{" "}
            <Link href={`/courses/${course.id}/syllabus`} className="font-medium text-foreground underline underline-offset-4">
              Import your syllabus
            </Link>{" "}
            to add its dates, assessments and topics. You check every row before anything is saved.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border border-y border-border">
              {syllabi.map((syllabus) => (
                <li key={syllabus.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <Link href={`/courses/${course.id}/material/${syllabus.id}`} className="min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline">
                    {syllabus.title}
                  </Link>
                  {syllabus.postedAt && <span className="shrink-0 text-xs text-muted-foreground">Imported {shortDate(syllabus.postedAt)}</span>}
                </li>
              ))}
            </ul>
            {latestOutline && latestOutline.objectives.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">Learning objectives, from your syllabus</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {latestOutline.objectives.slice(0, 6).map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <div>
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Materials</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {syncStatusText(canvas, tz)}
          {canvas?.contentSyncNote ? ` ${canvas.contentSyncNote}` : ""}
        </p>
      </div>

      {!canvas && (
        <p className="text-sm">
          <Link href="/integrations/canvas" className="font-medium underline underline-offset-4">
            Connect Canvas
          </Link>{" "}
          and select this course to mirror its content. Rushd only reads from Canvas.
        </p>
      )}

      {hasContent && (
        <form role="search" className="flex max-w-xl gap-2">
          <label htmlFor="course-search" className="sr-only">
            Search this course
          </label>
          <Input id="course-search" name="q" defaultValue={q ?? ""} placeholder="Search pages, assignments, announcements" />
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
        </form>
      )}

      {hits && (
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="border-b border-border pb-2 text-base font-semibold">
            {hits.length ? `Results for “${q}”` : `Nothing matched “${q}”`}
          </h2>
          <ul className="divide-y divide-border">
            {hits.map((hit) => (
              <li key={hit.id} className="py-3">
                <Link href={`/courses/${course.id}/material/${hit.id}`} className="font-medium underline-offset-4 hover:underline">
                  {hit.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">{hit.kind.replace("_", " ").toLowerCase()}</p>
                {hit.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{hit.excerpt}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canvas && !hasContent && (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Sync course content to see this course&apos;s modules, pages, assignment descriptions, rubrics, and recent
          announcements here and in the tutor.
        </p>
      )}

      {announcements.length > 0 && (
        <section aria-labelledby="announcements-heading">
          <h2 id="announcements-heading" className="border-b border-border pb-2 text-base font-semibold">
            Recent announcements
          </h2>
          <ul className="divide-y divide-border">
            {announcements.map((announcement) => (
              <li key={announcement.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <Link href={`/courses/${course.id}/material/${announcement.id}`} className="truncate text-sm underline-offset-4 hover:underline">
                  {announcement.title}
                </Link>
                {announcement.postedAt && <span className="shrink-0 text-xs text-muted-foreground">{shortDate(announcement.postedAt)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {modules.length > 0 && (
        <section aria-labelledby="modules-heading" className="space-y-6">
          <h2 id="modules-heading" className="border-b border-border pb-2 text-base font-semibold">
            Modules
          </h2>
          {modules.map((courseModule) => (
            <div key={courseModule.id}>
              <h3 className="text-sm font-semibold">{courseModule.name}</h3>
              {courseModule.materials.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No items visible to you.</p>
              ) : (
                <ul className="mt-1.5 space-y-0.5">
                  {courseModule.materials.map((item) => (
                    <ModuleItem key={item.id} item={item} readerId={readerFor(item)} courseId={course.id} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {assignments.length > 0 && (
        <section aria-labelledby="assignments-heading">
          <h2 id="assignments-heading" className="border-b border-border pb-2 text-base font-semibold">
            Assignments
          </h2>
          <ul className="divide-y divide-border">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <Link
                  // Open Rushd's own assignment page when this one is linked to it.
                  href={assignment.assignmentId ? `/assignments/${assignment.assignmentId}` : `/courses/${course.id}/material/${assignment.id}`}
                  className="min-w-0 truncate underline-offset-4 hover:underline"
                >
                  {assignment.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {assignment.rubric ? "Rubric · " : ""}
                  {assignment.postedAt ? `Due ${shortDate(assignment.postedAt)}` : "No due date"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loosePages.length > 0 && (
        <section aria-labelledby="pages-heading">
          <h2 id="pages-heading" className="border-b border-border pb-2 text-base font-semibold">
            Other pages
          </h2>
          <ul className="divide-y divide-border">
            {loosePages.map((page) => (
              <li key={page.id} className="py-2.5 text-sm">
                <Link href={`/courses/${course.id}/material/${page.id}`} className="underline-offset-4 hover:underline">
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
