import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { CanvasApiError, CanvasContentClient, type CanvasAssignment } from "./client";
import { CanvasUrlError } from "./base-url";
import { VaultError } from "./token-vault";
import { safeCanvasUrl } from "./mapping";
import { htmlToText, parseRubric, type CanvasAnnouncement, type CanvasModule, type CanvasPage } from "./content";
import { loadSecret, markNeedsReauth, type ServiceResult } from "./service";
import { log } from "@/lib/log";

// Copies one course's content (modules, pages, assignment descriptions and
// rubrics, recent announcements) into CourseModule and CourseMaterial. Only
// reads from Canvas. Each run replaces the course's rows in one transaction.

export interface ContentDeps {
  /** For tests only. Production always uses the real, SSRF-protected client. */
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

type MaterialRow = Prisma.CourseMaterialCreateManyInput;
type ModuleRow = Prisma.CourseModuleCreateManyInput;

/** Fields every row for this course shares. */
interface RowBase {
  userId: string;
  classId: string;
  canvasCourseId: string;
  syncedAt: Date;
}

/** Canvas answers 403/404 when a course hides a tool (Pages, Announcements)
 * from students. That's a fact about the course, not a failed sync. */
function hiddenFromStudents(error: unknown): boolean {
  return error instanceof CanvasApiError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND");
}

/** Runs `load`. If the tool is hidden from students, adds a note and returns an empty list instead. */
async function loadIfVisible<T>(load: () => Promise<T[]>, note: string, notes: string[]): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    if (!hiddenFromStudents(error)) {
      throw error;
    }
    notes.push(note);
    return [];
  }
}

function buildModuleRows(modules: CanvasModule[], base: RowBase, baseUrl: string) {
  const moduleRows: ModuleRow[] = [];
  const itemRows: MaterialRow[] = [];

  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    const canvasModule = modules[moduleIndex];
    const moduleId = randomUUID();
    moduleRows.push({
      ...base,
      id: moduleId,
      canvasModuleId: String(canvasModule.id),
      name: canvasModule.name.slice(0, 300),
      position: canvasModule.position ?? moduleIndex + 1,
    });

    const items = canvasModule.items ?? [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];

      // Pages are identified by their url slug; everything else by content id.
      let target: string | undefined;
      if (item.type === "Page") {
        target = item.page_url;
      } else if (item.content_id !== undefined) {
        target = String(item.content_id);
      }

      itemRows.push({
        ...base,
        kind: "MODULE_ITEM",
        canvasId: String(item.id),
        moduleId,
        position: item.position ?? itemIndex + 1,
        indent: Math.max(0, Math.min(5, item.indent ?? 0)),
        itemType: item.type.slice(0, 40),
        targetId: target?.slice(0, 300) ?? null,
        title: item.title.slice(0, 500),
        url: safeCanvasUrl(baseUrl, item.html_url),
      });
    }
  }

  return { moduleRows, itemRows };
}

function buildPageRows(pages: CanvasPage[], base: RowBase, baseUrl: string, courseId: string): MaterialRow[] {
  const rows: MaterialRow[] = [];
  for (const page of pages) {
    if (page.locked_for_user) {
      continue;
    }
    const fallbackUrl = `${baseUrl}/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(page.url)}`;
    rows.push({
      ...base,
      kind: "PAGE",
      canvasId: page.url.slice(0, 300),
      title: page.title.slice(0, 500),
      body: htmlToText(page.body),
      url: safeCanvasUrl(baseUrl, page.html_url ?? fallbackUrl),
      postedAt: page.updated_at ? new Date(page.updated_at) : null,
    });
  }
  return rows;
}

function buildAssignmentRows(
  assignments: CanvasAssignment[],
  base: RowBase,
  baseUrl: string,
  rushdIdByCanvasId: Map<string | null, string>,
): { rows: MaterialRow[]; rubricCount: number } {
  const rows: MaterialRow[] = [];
  let rubricCount = 0;

  for (const assignment of assignments) {
    if (assignment.published === false) {
      continue;
    }
    const rubric = parseRubric(assignment.rubric);
    if (rubric) {
      rubricCount++;
    }
    rows.push({
      ...base,
      kind: "ASSIGNMENT",
      canvasId: String(assignment.id),
      title: assignment.name.slice(0, 500),
      body: htmlToText(assignment.description),
      url: safeCanvasUrl(baseUrl, assignment.html_url),
      postedAt: assignment.due_at ? new Date(assignment.due_at) : null,
      pointsPossible: typeof assignment.points_possible === "number" ? assignment.points_possible : null,
      rubric: rubric ?? Prisma.DbNull,
      assignmentId: rushdIdByCanvasId.get(String(assignment.id)) ?? null,
    });
  }

  return { rows, rubricCount };
}

function buildAnnouncementRows(announcements: CanvasAnnouncement[], base: RowBase, baseUrl: string): MaterialRow[] {
  const rows: MaterialRow[] = [];
  for (const announcement of announcements) {
    rows.push({
      ...base,
      kind: "ANNOUNCEMENT",
      canvasId: String(announcement.id),
      title: announcement.title.slice(0, 500),
      body: htmlToText(announcement.message),
      url: safeCanvasUrl(baseUrl, announcement.html_url),
      postedAt: announcement.posted_at ? new Date(announcement.posted_at) : null,
    });
  }
  return rows;
}

/** Canvas pagination can repeat ids, which would break the unique index. Keeps the first of each. */
function removeDuplicates(rows: MaterialRow[]): MaterialRow[] {
  const seen = new Set<string>();
  const unique: MaterialRow[] = [];
  for (const row of rows) {
    const key = `${row.kind}:${row.canvasId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function countKind(rows: MaterialRow[], kind: MaterialRow["kind"]): number {
  let count = 0;
  for (const row of rows) {
    if (row.kind === kind) {
      count++;
    }
  }
  return count;
}

export async function syncCourseContent(
  userId: string,
  classId: string,
  deps: ContentDeps = {},
): Promise<ServiceResult<ContentSyncSummary>> {
  const now = deps.now ? deps.now() : new Date();
  let client: CanvasContentClient | null = null;

  try {
    // Ownership check: the course must belong to this user's connection and be
    // linked to this user's class.
    const course = await db.canvasCourse.findFirst({
      where: { classId, selected: true, connection: { userId }, class: { userId } },
      select: { id: true, canvasCourseId: true },
    });
    if (!course) {
      return { ok: false, error: "This class isn't linked to a Canvas course.", code: "NOT_LINKED" };
    }

    const secret = await loadSecret(userId);
    if (!secret) {
      return { ok: false, error: "Canvas isn't connected." };
    }
    const contentClient = deps.createClient
      ? deps.createClient(secret.baseUrl, secret.token)
      : new CanvasContentClient(secret.baseUrl, secret.token);
    client = contentClient;

    const courseId = course.canvasCourseId;
    const notes: string[] = [];

    const modules = await loadIfVisible(
      () => contentClient.listModules(courseId),
      "Modules aren't visible to students in this course.",
      notes,
    );
    const pages = await loadIfVisible(
      () => contentClient.listPages(courseId),
      "Pages aren't visible to students in this course.",
      notes,
    );
    const assignments = await contentClient.listAssignments(courseId);
    const announcementsSince = new Date(now.getTime() - ANNOUNCEMENT_LOOKBACK_DAYS * DAY_MS);
    const announcementsUntil = new Date(now.getTime() + DAY_MS);
    const announcements = await loadIfVisible(
      () => contentClient.listAnnouncements(courseId, announcementsSince, announcementsUntil),
      "Announcements aren't visible to students in this course.",
      notes,
    );

    // Link each Canvas assignment to the matching Rushd assignment, if there is one.
    const linkedAssignments = await db.assignment.findMany({
      where: { userId, canvasCourseId: courseId, canvasAssignmentId: { in: assignments.map((a) => String(a.id)) } },
      select: { id: true, canvasAssignmentId: true },
    });
    const rushdIdByCanvasId = new Map<string | null, string>();
    for (const linked of linkedAssignments) {
      rushdIdByCanvasId.set(linked.canvasAssignmentId, linked.id);
    }

    const base: RowBase = { userId, classId, canvasCourseId: courseId, syncedAt: now };
    const { moduleRows, itemRows } = buildModuleRows(modules, base, secret.baseUrl);
    const assignmentResult = buildAssignmentRows(assignments, base, secret.baseUrl, rushdIdByCanvasId);

    const materialRows = [
      ...itemRows,
      ...buildPageRows(pages, base, secret.baseUrl, courseId),
      ...assignmentResult.rows,
      ...buildAnnouncementRows(announcements, base, secret.baseUrl),
    ];
    const uniqueMaterials = removeDuplicates(materialRows);

    await db.$transaction([
      db.courseMaterial.deleteMany({ where: { userId, canvasCourseId: courseId } }),
      db.courseModule.deleteMany({ where: { userId, canvasCourseId: courseId } }),
      db.courseModule.createMany({ data: moduleRows }),
      db.courseMaterial.createMany({ data: uniqueMaterials }),
      db.canvasCourse.update({
        where: { id: course.id },
        data: { contentSyncedAt: now, contentSyncNote: notes.length > 0 ? notes.join(" ") : null },
      }),
    ]);

    return {
      ok: true,
      value: {
        modules: moduleRows.length,
        moduleItems: countKind(uniqueMaterials, "MODULE_ITEM"),
        pages: countKind(uniqueMaterials, "PAGE"),
        assignments: countKind(uniqueMaterials, "ASSIGNMENT"),
        rubrics: assignmentResult.rubricCount,
        announcements: countKind(uniqueMaterials, "ANNOUNCEMENT"),
        notes,
      },
    };
  } catch (error) {
    if (error instanceof CanvasApiError) {
      if (error.code === "UNAUTHORIZED") {
        await markNeedsReauth(userId);
      }
      return { ok: false, error: error.message, code: error.code };
    }
    if (error instanceof CanvasUrlError || error instanceof VaultError) {
      return { ok: false, error: "Your saved Canvas connection can't be used. Please reconnect.", code: error.code };
    }
    // Only log the error's type, never the object.
    log.error("canvas_content.unexpected_error", { err: error });
    return { ok: false, error: "Something went wrong reading this course from Canvas. Please try again." };
  } finally {
    await client?.close();
  }
}
