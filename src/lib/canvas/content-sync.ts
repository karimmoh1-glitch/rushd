import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { CanvasApiError, CanvasContentClient } from "./client";
import { CanvasUrlError } from "./base-url";
import { VaultError } from "./token-vault";
import { safeCanvasUrl } from "./mapping";
import { htmlToText, parseRubric } from "./content";
import { loadSecret, markNeedsReauth, type ServiceResult } from "./service";

// Mirrors one course's content (modules in order, pages, assignment
// descriptions and rubrics, recent announcements) into CourseModule and
// CourseMaterial, strictly read-only against Canvas. The mirror is a cache:
// each run replaces the course's rows in a single transaction.

export interface ContentDeps {
  /** Test seam. Production always uses the real, SSRF-guarded client. */
  createClient?: (baseUrl: string, token: string) => CanvasContentClient;
  now?: () => Date;
}

export interface ContentSyncSummary {
  modules: number;
  moduleItems: number;
  pages: number;
  assignments: number;
  rubrics: number;
  announcements: number;
  notes: string[];
}

const ANNOUNCEMENT_LOOKBACK_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Canvas answers 403/404 when a course hides a tool (Pages, Announcements)
 * from students. That's a fact about the course, not a failed sync. */
function hiddenFromStudents(error: unknown): boolean {
  return error instanceof CanvasApiError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND");
}

async function optional<T>(load: () => Promise<T>, fallback: T, note: string, notes: string[]): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!hiddenFromStudents(error)) throw error;
    notes.push(note);
    return fallback;
  }
}

export async function syncCourseContent(
  userId: string,
  classId: string,
  deps: ContentDeps = {},
): Promise<ServiceResult<ContentSyncSummary>> {
  const now = (deps.now ?? (() => new Date()))();
  let client: CanvasContentClient | null = null;
  try {
    // Ownership: the course must belong to this user's connection and be
    // linked to this user's class.
    const course = await db.canvasCourse.findFirst({
      where: { classId, selected: true, connection: { userId }, class: { userId } },
      select: { id: true, canvasCourseId: true },
    });
    if (!course) return { ok: false, error: "This class isn't linked to a Canvas course.", code: "NOT_LINKED" };

    const secret = await loadSecret(userId);
    if (!secret) return { ok: false, error: "Canvas isn't connected." };
    client = (deps.createClient ?? ((b, t) => new CanvasContentClient(b, t)))(secret.baseUrl, secret.token);
    const courseId = course.canvasCourseId;
    const notes: string[] = [];

    const modules = await optional(() => client!.listModules(courseId), [], "Modules aren't visible to students in this course.", notes);
    const pages = await optional(() => client!.listPages(courseId), [], "Pages aren't visible to students in this course.", notes);
    const assignments = await client.listAssignments(courseId);
    const announcements = await optional(
      () => client!.listAnnouncements(courseId, new Date(now.getTime() - ANNOUNCEMENT_LOOKBACK_DAYS * DAY_MS), new Date(now.getTime() + DAY_MS)),
      [],
      "Announcements aren't visible to students in this course.",
      notes,
    );

    const linked = await db.assignment.findMany({
      where: { userId, canvasCourseId: courseId, canvasAssignmentId: { in: assignments.map((a) => String(a.id)) } },
      select: { id: true, canvasAssignmentId: true },
    });
    const rushdIdFor = new Map(linked.map((a) => [a.canvasAssignmentId, a.id]));

    const base = { userId, classId, canvasCourseId: courseId, syncedAt: now };
    const moduleRows: Prisma.CourseModuleCreateManyInput[] = [];
    const materialRows: Prisma.CourseMaterialCreateManyInput[] = [];

    modules.forEach((m, mi) => {
      const moduleId = randomUUID();
      moduleRows.push({ ...base, id: moduleId, canvasModuleId: String(m.id), name: m.name.slice(0, 300), position: m.position ?? mi + 1 });
      (m.items ?? []).forEach((item, ii) => {
        const target =
          item.type === "Page" ? item.page_url : item.content_id !== undefined ? String(item.content_id) : undefined;
        materialRows.push({
          ...base,
          kind: "MODULE_ITEM",
          canvasId: String(item.id),
          moduleId,
          position: item.position ?? ii + 1,
          indent: Math.max(0, Math.min(5, item.indent ?? 0)),
          itemType: item.type.slice(0, 40),
          targetId: target?.slice(0, 300) ?? null,
          title: item.title.slice(0, 500),
          url: safeCanvasUrl(secret.baseUrl, item.html_url),
        });
      });
    });

    for (const p of pages) {
      if (p.locked_for_user) continue;
      materialRows.push({
        ...base,
        kind: "PAGE",
        canvasId: p.url.slice(0, 300),
        title: p.title.slice(0, 500),
        body: htmlToText(p.body),
        url: safeCanvasUrl(secret.baseUrl, p.html_url ?? `${secret.baseUrl}/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(p.url)}`),
        postedAt: p.updated_at ? new Date(p.updated_at) : null,
      });
    }

    let rubrics = 0;
    for (const a of assignments) {
      if (a.published === false) continue;
      const rubric = parseRubric(a.rubric);
      if (rubric) rubrics++;
      materialRows.push({
        ...base,
        kind: "ASSIGNMENT",
        canvasId: String(a.id),
        title: a.name.slice(0, 500),
        body: htmlToText(a.description),
        url: safeCanvasUrl(secret.baseUrl, a.html_url),
        postedAt: a.due_at ? new Date(a.due_at) : null,
        pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
        rubric: rubric ?? Prisma.DbNull,
        assignmentId: rushdIdFor.get(String(a.id)) ?? null,
      });
    }

    for (const a of announcements) {
      materialRows.push({
        ...base,
        kind: "ANNOUNCEMENT",
        canvasId: String(a.id),
        title: a.title.slice(0, 500),
        body: htmlToText(a.message),
        url: safeCanvasUrl(secret.baseUrl, a.html_url),
        postedAt: a.posted_at ? new Date(a.posted_at) : null,
      });
    }

    // Duplicate Canvas ids (rare, but Canvas pagination can repeat) would
    // break the unique index; keep the first of each.
    const seen = new Set<string>();
    const uniqueMaterials = materialRows.filter((r) => {
      const key = `${r.kind}:${r.canvasId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await db.$transaction([
      db.courseMaterial.deleteMany({ where: { userId, canvasCourseId: courseId } }),
      db.courseModule.deleteMany({ where: { userId, canvasCourseId: courseId } }),
      db.courseModule.createMany({ data: moduleRows }),
      db.courseMaterial.createMany({ data: uniqueMaterials }),
      db.canvasCourse.update({
        where: { id: course.id },
        data: { contentSyncedAt: now, contentSyncNote: notes.length ? notes.join(" ") : null },
      }),
    ]);

    return {
      ok: true,
      value: {
        modules: moduleRows.length,
        moduleItems: uniqueMaterials.filter((r) => r.kind === "MODULE_ITEM").length,
        pages: uniqueMaterials.filter((r) => r.kind === "PAGE").length,
        assignments: uniqueMaterials.filter((r) => r.kind === "ASSIGNMENT").length,
        rubrics,
        announcements: uniqueMaterials.filter((r) => r.kind === "ANNOUNCEMENT").length,
        notes,
      },
    };
  } catch (error) {
    if (error instanceof CanvasApiError) {
      if (error.code === "UNAUTHORIZED") await markNeedsReauth(userId);
      return { ok: false, error: error.message, code: error.code };
    }
    if (error instanceof CanvasUrlError || error instanceof VaultError) {
      return { ok: false, error: "Your saved Canvas connection can't be used. Please reconnect.", code: error.code };
    }
    console.error("[canvas-content] unexpected error", (error as Error)?.name ?? typeof error);
    return { ok: false, error: "Something went wrong reading this course from Canvas. Please try again." };
  } finally {
    await client?.close();
  }
}
