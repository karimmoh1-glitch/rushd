import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageSquareText, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { searchMaterials } from "@/lib/course/retrieval";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncContentButton } from "./sync-content-button";

export const metadata: Metadata = { title: "Course" };
export const maxDuration = 60;

const ITEM_LABEL: Record<string, string> = {
  Page: "Page",
  Assignment: "Assignment",
  Quiz: "Quiz",
  Discussion: "Discussion",
  File: "File",
  ExternalUrl: "Link",
  ExternalTool: "Tool",
};

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

  const cls = await db.class.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      name: true,
      color: true,
      teacher: true,
      canvasCourses: { where: { selected: true }, select: { name: true, contentSyncedAt: true, contentSyncNote: true }, take: 1 },
    },
  });
  if (!cls) notFound();
  const canvas = cls.canvasCourses[0] ?? null;

  const [modules, pages, assignments, announcements, hits] = await Promise.all([
    db.courseModule.findMany({
      where: { userId: user.id, classId: cls.id },
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
      where: { userId: user.id, classId: cls.id, kind: "PAGE" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, canvasId: true },
    }),
    db.courseMaterial.findMany({
      where: { userId: user.id, classId: cls.id, kind: "ASSIGNMENT" },
      orderBy: [{ postedAt: "asc" }],
      select: { id: true, title: true, canvasId: true, postedAt: true, rubric: true, assignmentId: true },
    }),
    db.courseMaterial.findMany({
      where: { userId: user.id, classId: cls.id, kind: "ANNOUNCEMENT" },
      orderBy: { postedAt: "desc" },
      take: 5,
      select: { id: true, title: true, postedAt: true },
    }),
    q?.trim() ? searchMaterials(user.id, { query: q, classId: cls.id, limit: 10 }) : Promise.resolve(null),
  ]);

  // Module items point at pages/assignments by Canvas id; resolve them to
  // the in-app reader where Rushd has the text.
  const pageBySlug = new Map(pages.map((p) => [p.canvasId, p.id]));
  const assignmentByCanvasId = new Map(assignments.map((a) => [a.canvasId, a.id]));
  const readerFor = (item: { itemType: string | null; targetId: string | null }) => {
    if (!item.targetId) return null;
    if (item.itemType === "Page") return pageBySlug.get(item.targetId) ?? null;
    if (item.itemType === "Assignment") return assignmentByCanvasId.get(item.targetId) ?? null;
    return null;
  };
  const inModules = new Set(modules.flatMap((m) => m.materials.map((i) => readerFor(i)).filter(Boolean)));
  const loosePages = pages.filter((p) => !inModules.has(p.id));
  const hasContent = modules.length + pages.length + assignments.length + announcements.length > 0;
  const fmt = (d: Date) => formatDateInZone(d, tz, { month: "short", day: "numeric" });

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">
          Courses
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cls.color }} />
              <span className="truncate">{cls.name}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {canvas
                ? canvas.contentSyncedAt
                  ? `Course content from Canvas, last synced ${formatDateInZone(canvas.contentSyncedAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
                  : "Linked to Canvas. Course content hasn't been synced yet."
                : "Added by hand. Link it to a Canvas course to see modules, pages, and rubrics here."}
            </p>
            {canvas?.contentSyncNote && <p className="mt-1 text-sm text-muted-foreground">{canvas.contentSyncNote}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canvas && <SyncContentButton classId={cls.id} />}
            <Link href={`/tutor?classId=${cls.id}`} className={buttonVariants({ variant: "outline" })}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              Ask the tutor
            </Link>
          </div>
        </div>
      </header>

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
            {hits.map((h) => (
              <li key={h.id} className="py-3">
                <Link href={`/courses/${cls.id}/material/${h.id}`} className="font-medium underline-offset-4 hover:underline">
                  {h.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">{h.kind.replace("_", " ").toLowerCase()}</p>
                {h.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{h.excerpt}</p>}
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
            {announcements.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <Link href={`/courses/${cls.id}/material/${a.id}`} className="truncate text-sm underline-offset-4 hover:underline">
                  {a.title}
                </Link>
                {a.postedAt && <span className="shrink-0 text-xs text-muted-foreground">{fmt(a.postedAt)}</span>}
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
          {modules.map((m) => (
            <div key={m.id}>
              <h3 className="text-sm font-semibold">{m.name}</h3>
              {m.materials.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No items visible to you.</p>
              ) : (
                <ul className="mt-1.5 space-y-0.5">
                  {m.materials.map((item) => {
                    const reader = readerFor(item);
                    if (item.itemType === "SubHeader") {
                      return (
                        <li key={item.id} className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {item.title}
                        </li>
                      );
                    }
                    return (
                      <li key={item.id} className="flex items-baseline gap-3 py-1 text-sm" style={{ paddingLeft: `${(item.indent ?? 0) * 16}px` }}>
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">{ITEM_LABEL[item.itemType ?? ""] ?? item.itemType}</span>
                        {reader ? (
                          <Link href={`/courses/${cls.id}/material/${reader}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                            {item.title}
                          </Link>
                        ) : item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate underline-offset-4 hover:underline">
                            {item.title}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-label="(opens Canvas in a new tab)" />
                          </a>
                        ) : (
                          <span className="min-w-0 truncate">{item.title}</span>
                        )}
                      </li>
                    );
                  })}
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
            {assignments.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <Link
                  href={a.assignmentId ? `/assignments/${a.assignmentId}` : `/courses/${cls.id}/material/${a.id}`}
                  className="min-w-0 truncate underline-offset-4 hover:underline"
                >
                  {a.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.rubric ? "Rubric · " : ""}
                  {a.postedAt ? `Due ${fmt(a.postedAt)}` : "No due date"}
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
            {loosePages.map((p) => (
              <li key={p.id} className="py-2.5 text-sm">
                <Link href={`/courses/${cls.id}/material/${p.id}`} className="underline-offset-4 hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
