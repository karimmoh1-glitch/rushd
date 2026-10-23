import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { CANVAS_CLASS_COLORS } from "./colors";
import { CanvasClient, CanvasApiError, type CanvasCourse as ApiCourse } from "./client";
import { normalizeCanvasBaseUrl, CanvasUrlError } from "./base-url";
import { decryptToken, encryptToken, isVaultConfigured, VaultError } from "./token-vault";
import { mapAssignment, type MappedAssignment, type SkipReason } from "./mapping";
import {
  diffCanvasAssignments,
  diffHasChanges,
  type ExistingCanvasRow,
  type FetchedCourse,
  type SyncDiff,
} from "./sync-diff";
import { loadPlanningContext } from "@/lib/planning/generate-for-user";
import { generatePlan } from "@/lib/planning/schedule";
import type { WorkItem } from "@/lib/planning/types";
import { log } from "@/lib/log";

// The Canvas integration: connect, choose courses, preview a sync, apply it,
// disconnect. Security: userId always comes from the caller's session (never
// from client input), and every query is scoped to it. The decrypted token
// only lives inside these functions and is never returned, logged or saved.

export interface CanvasDeps {
  /** For tests only. Production always uses the real, SSRF-protected client. */
  createClient?: (baseUrl: string, token: string) => CanvasClient;
  now?: () => Date;
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

type Failure = { ok: false; error: string; code?: string };
type Transaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const NOT_CONNECTED = "Canvas isn't connected.";

function makeClient(deps: CanvasDeps, baseUrl: string, token: string): CanvasClient {
  if (deps.createClient) {
    return deps.createClient(baseUrl, token);
  }
  return new CanvasClient(baseUrl, token);
}

function currentTime(deps: CanvasDeps): Date {
  return deps.now ? deps.now() : new Date();
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof CanvasApiError && error.code === "UNAUTHORIZED";
}

/** Turns any error into a friendly failure result. */
function fail(error: unknown): Failure {
  if (error instanceof CanvasApiError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof CanvasUrlError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof VaultError) {
    let message = "Your saved Canvas connection can't be read. Please reconnect.";
    if (error.code === "NOT_CONFIGURED" || error.code === "BAD_KEY") {
      message = "Canvas integration isn't available on this server yet.";
    }
    return { ok: false, error: message, code: error.code };
  }
  // Only log the error's type, never the object (it could contain a request).
  log.error("canvas.unexpected_error", { err: error });
  return { ok: false, error: "Something went wrong talking to Canvas. Please try again." };
}

// --- Safe reads (never select the token) ---------------------------------------

export interface CanvasConnectionView {
  baseUrl: string;
  canvasUserName: string | null;
  status: "ACTIVE" | "NEEDS_REAUTH" | "ERROR";
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncSummary: SyncSummary | null;
  connectedAt: Date;
  courses: {
    id: string;
    canvasCourseId: string;
    name: string;
    courseCode: string | null;
    termName: string | null;
    selected: boolean;
    className: string | null;
    classColor: string | null;
    lastSyncedAt: Date | null;
  }[];
  importedCount: number;
}

export async function getCanvasConnectionView(userId: string): Promise<CanvasConnectionView | null> {
  const connection = await db.canvasConnection.findUnique({
    where: { userId },
    select: {
      baseUrl: true,
      canvasUserName: true,
      status: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      lastSyncSummary: true,
      createdAt: true,
      courses: {
        orderBy: [{ selected: "desc" }, { name: "asc" }],
        select: {
          id: true,
          canvasCourseId: true,
          name: true,
          courseCode: true,
          termName: true,
          selected: true,
          lastSyncedAt: true,
          class: { select: { name: true, color: true } },
        },
      },
    },
  });
  if (!connection) {
    return null;
  }

  const importedCount = await db.assignment.count({
    where: { userId, source: "CANVAS", canvasRemovedAt: null },
  });

  const courses = connection.courses.map((course) => ({
    id: course.id,
    canvasCourseId: course.canvasCourseId,
    name: course.name,
    courseCode: course.courseCode,
    termName: course.termName,
    selected: course.selected,
    className: course.class?.name ?? null,
    classColor: course.class?.color ?? null,
    lastSyncedAt: course.lastSyncedAt,
  }));

  return {
    baseUrl: connection.baseUrl,
    canvasUserName: connection.canvasUserName,
    status: connection.status,
    lastSyncAt: connection.lastSyncAt,
    lastSyncStatus: connection.lastSyncStatus,
    lastSyncError: connection.lastSyncError,
    lastSyncSummary: (connection.lastSyncSummary as SyncSummary | null) ?? null,
    connectedAt: connection.createdAt,
    courses,
    importedCount,
  };
}

/** The only place the encrypted token is read. */
export async function loadSecret(userId: string) {
  const connection = await db.canvasConnection.findUnique({
    where: { userId },
    select: { id: true, baseUrl: true, encryptedToken: true },
  });
  if (!connection) {
    return null;
  }
  return {
    id: connection.id,
    baseUrl: connection.baseUrl,
    token: decryptToken(userId, connection.encryptedToken),
  };
}

// --- Connect -------------------------------------------------------------------

function looksLikeToken(token: string): boolean {
  return token.length >= 20 && token.length <= 512 && !/\s/.test(token);
}

export async function connectCanvas(
  userId: string,
  rawBaseUrl: string,
  rawToken: string,
  deps: CanvasDeps = {},
): Promise<ServiceResult<{ canvasUserName: string; courseCount: number }>> {
  if (!isVaultConfigured()) {
    return { ok: false, error: "Canvas integration isn't available on this server yet.", code: "NOT_CONFIGURED" };
  }
  const token = rawToken.trim();
  if (!looksLikeToken(token)) {
    return { ok: false, error: "That doesn't look like a Canvas access token. Copy the whole token Canvas showed you.", code: "BAD_TOKEN" };
  }

  let client: CanvasClient | null = null;
  try {
    const baseUrl = normalizeCanvasBaseUrl(rawBaseUrl);
    client = makeClient(deps, baseUrl, token);
    const self = await client.getSelf();
    const courses = await client.listCourses();
    const encryptedToken = encryptToken(userId, token);

    const connectionData = {
      baseUrl,
      encryptedToken,
      canvasUserId: String(self.id),
      canvasUserName: self.name.slice(0, 120),
      status: "ACTIVE" as const,
    };

    await db.$transaction(async (tx) => {
      const existing = await tx.canvasConnection.findUnique({ where: { userId }, select: { id: true, baseUrl: true } });
      // A different Canvas site means the old course ids mean nothing.
      if (existing && existing.baseUrl !== baseUrl) {
        await tx.canvasCourse.deleteMany({ where: { connectionId: existing.id } });
      }
      const connection = await tx.canvasConnection.upsert({
        where: { userId },
        create: { userId, ...connectionData },
        update: { ...connectionData, lastSyncError: null, syncStartedAt: null },
        select: { id: true },
      });
      await upsertCourses(tx, connection.id, courses);
    });

    return { ok: true, value: { canvasUserName: self.name, courseCount: courses.length } };
  } catch (error) {
    if (error instanceof CanvasApiError && error.code === "UNAUTHORIZED") {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Canvas didn't accept that token. Make sure you copied all of it, that it hasn't expired, and that it's for this school's Canvas.",
      };
    }
    if (error instanceof CanvasApiError && error.code === "NOT_FOUND") {
      return {
        ok: false,
        code: "NOT_FOUND",
        error: "No Canvas found at that address. Use the address you see in your browser when you're logged into Canvas.",
      };
    }
    return fail(error);
  } finally {
    await client?.close();
  }
}

async function upsertCourses(tx: Transaction, connectionId: string, courses: ApiCourse[]) {
  for (const course of courses) {
    const data = {
      name: course.name.slice(0, 160),
      courseCode: course.course_code?.slice(0, 80) ?? null,
      termName: course.term?.name?.slice(0, 80) ?? null,
    };
    const canvasCourseId = String(course.id);
    await tx.canvasCourse.upsert({
      where: { connectionId_canvasCourseId: { connectionId, canvasCourseId } },
      create: { connectionId, canvasCourseId, ...data },
      update: data,
    });
  }
}

export async function refreshCanvasCourses(userId: string, deps: CanvasDeps = {}): Promise<ServiceResult<{ courseCount: number }>> {
  let client: CanvasClient | null = null;
  try {
    const secret = await loadSecret(userId);
    if (!secret) {
      return { ok: false, error: NOT_CONNECTED };
    }
    client = makeClient(deps, secret.baseUrl, secret.token);
    const courses = await client.listCourses();
    await db.$transaction(async (tx) => upsertCourses(tx, secret.id, courses));
    return { ok: true, value: { courseCount: courses.length } };
  } catch (error) {
    if (isUnauthorized(error)) {
      await markNeedsReauth(userId);
    }
    return fail(error);
  } finally {
    await client?.close();
  }
}

// --- Course selection ----------------------------------------------------------

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Sets which Canvas courses sync. Each selected course is linked to a Rushd
 * class: an existing one with the same name, or a new one. Deselecting stops
 * syncing; already-imported assignments stay. */
export async function setSelectedCanvasCourses(
  userId: string,
  courseRowIds: string[],
): Promise<ServiceResult<{ selected: number; classesCreated: number }>> {
  const connection = await db.canvasConnection.findUnique({ where: { userId }, select: { id: true } });
  if (!connection) {
    return { ok: false, error: NOT_CONNECTED };
  }

  const uniqueIds = [...new Set(courseRowIds)].slice(0, 50);
  const wanted = new Set(uniqueIds);
  let classesCreated = 0;

  await db.$transaction(async (tx) => {
    // Scoped to this user's connection, so ids from other users match nothing.
    const courses = await tx.canvasCourse.findMany({
      where: { connectionId: connection.id },
      select: { id: true, name: true, classId: true },
    });
    const classes = await tx.class.findMany({ where: { userId }, select: { id: true, name: true, archived: true } });

    const classIdByName = new Map<string, string>();
    for (const existingClass of classes) {
      if (!existingClass.archived) {
        classIdByName.set(nameKey(existingClass.name), existingClass.id);
      }
    }
    let colorIndex = classes.length;

    for (const course of courses) {
      const selected = wanted.has(course.id);
      let classId = course.classId;

      if (selected && !classId) {
        const matchingClassId = classIdByName.get(nameKey(course.name));
        if (matchingClassId) {
          classId = matchingClassId;
        } else {
          const color = CANVAS_CLASS_COLORS[colorIndex % CANVAS_CLASS_COLORS.length];
          colorIndex++;
          const created = await tx.class.create({
            data: { userId, name: course.name.slice(0, 80), color },
            select: { id: true },
          });
          classId = created.id;
          classIdByName.set(nameKey(course.name), created.id);
          classesCreated++;
        }
      }

      await tx.canvasCourse.update({ where: { id: course.id }, data: { selected, classId } });
    }
  });

  return { ok: true, value: { selected: uniqueIds.length, classesCreated } };
}

// --- Sync ----------------------------------------------------------------------

export interface SyncSummary {
  created: number;
  updated: number;
  completed: number;
  removed: number;
  restored: number;
  unchanged: number;
  skippedNoDueDate: number;
  skippedUnpublished: number;
  coursesOk: number;
  coursesFailed: number;
}

export interface SyncReport {
  applied: boolean;
  summary: SyncSummary;
  courses: { name: string; ok: boolean; error?: string; assignments: number }[];
  samples: {
    created: { title: string; course: string; dueAt: Date; complete: boolean }[];
    completed: string[];
    updated: string[];
    removed: string[];
  };
  impact: PlanImpact | null;
}

export interface PlanImpact {
  addedOpenMinutes: number;
  shortfallBefore: number;
  shortfallAfter: number;
  overloadedDaysAfter: number;
  atRisk: { title: string; shortMinutes: number }[];
}

const SYNC_LOCK_MS = 3 * 60_000;
const COURSE_CONCURRENCY = 3;
const DAY_MS = 86_400_000;

interface CourseToFetch {
  canvasCourseId: string;
  classId: string;
  name: string;
}

interface FetchResults {
  fetched: FetchedCourse[];
  errors: Map<string, string>;
  authFailed: boolean;
}

/** Fetches one course's assignments and maps them. */
async function fetchOneCourse(client: CanvasClient, baseUrl: string, course: CourseToFetch): Promise<FetchedCourse> {
  const rawAssignments = await client.listAssignments(course.canvasCourseId);
  const assignments: MappedAssignment[] = [];
  const skipped: { id: string; reason: SkipReason }[] = [];

  for (const rawAssignment of rawAssignments) {
    const result = mapAssignment(baseUrl, course.canvasCourseId, rawAssignment);
    if (result.ok) {
      assignments.push(result.value);
    } else {
      skipped.push({ id: String(rawAssignment.id), reason: result.reason });
    }
  }

  return { canvasCourseId: course.canvasCourseId, classId: course.classId, ok: true, assignments, skipped };
}

/** Fetches several courses, a few at a time. Stops early if the token is rejected. */
async function fetchCourses(client: CanvasClient, baseUrl: string, courses: CourseToFetch[]): Promise<FetchResults> {
  const results: FetchResults = { fetched: [], errors: new Map(), authFailed: false };
  let nextIndex = 0;

  // Each worker keeps taking the next course until none are left.
  async function worker() {
    while (nextIndex < courses.length && !results.authFailed) {
      const course = courses[nextIndex];
      nextIndex++;
      try {
        results.fetched.push(await fetchOneCourse(client, baseUrl, course));
      } catch (error) {
        if (isUnauthorized(error)) {
          results.authFailed = true;
        }
        const message = error instanceof CanvasApiError ? error.message : "Couldn't read this course.";
        results.errors.set(course.canvasCourseId, message);
        results.fetched.push({ canvasCourseId: course.canvasCourseId, classId: course.classId, ok: false, assignments: [], skipped: [] });
      }
    }
  }

  const workerCount = Math.min(COURSE_CONCURRENCY, courses.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export async function markNeedsReauth(userId: string) {
  await db.canvasConnection.updateMany({
    where: { userId },
    data: {
      status: "NEEDS_REAUTH",
      lastSyncStatus: "error",
      lastSyncError: "Canvas stopped accepting the saved token (it may have expired or been revoked). Reconnect to resume syncing.",
    },
  });
}

/** Tries to take the per-user sync lock. A lock older than SYNC_LOCK_MS counts as stale. */
async function takeSyncLock(userId: string, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - SYNC_LOCK_MS);
  const result = await db.canvasConnection.updateMany({
    where: { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: staleBefore } }] },
    data: { syncStartedAt: now },
  });
  return result.count > 0;
}

function firstError(errors: Map<string, string>): string | undefined {
  for (const message of errors.values()) {
    return message;
  }
  return undefined;
}

async function loadExistingCanvasRows(userId: string, canvasCourseIds: string[]): Promise<ExistingCanvasRow[]> {
  const rows = await db.assignment.findMany({
    where: {
      userId,
      source: "CANVAS",
      canvasCourseId: { in: canvasCourseIds },
      canvasAssignmentId: { not: null },
    },
    select: {
      id: true,
      canvasCourseId: true,
      canvasAssignmentId: true,
      title: true,
      dueAt: true,
      pointsPossible: true,
      canvasUrl: true,
      status: true,
      canvasSubmittedAt: true,
      canvasRemovedAt: true,
      estimatedByRushd: true,
      estimatedMinutes: true,
    },
  });
  // The query only returns rows where both Canvas ids are set.
  return rows.map((row) => ({
    ...row,
    canvasCourseId: row.canvasCourseId!,
    canvasAssignmentId: row.canvasAssignmentId!,
  }));
}

function countCourses(fetched: FetchedCourse[]): { ok: number; failed: number } {
  let ok = 0;
  let failed = 0;
  for (const course of fetched) {
    if (course.ok) {
      ok++;
    } else {
      failed++;
    }
  }
  return { ok, failed };
}

function buildReport(
  diff: SyncDiff,
  fetched: FetchedCourse[],
  errors: Map<string, string>,
  courseNames: Map<string, string>,
): SyncReport {
  const courseCounts = countCourses(fetched);
  const summary: SyncSummary = {
    created: diff.counts.created,
    updated: diff.counts.updated,
    completed: diff.counts.completed,
    removed: diff.counts.removed,
    restored: diff.counts.restored,
    unchanged: diff.counts.unchanged,
    skippedNoDueDate: diff.counts.skippedNoDueDate,
    skippedUnpublished: diff.counts.skippedUnpublished,
    coursesOk: courseCounts.ok,
    coursesFailed: courseCounts.failed,
  };

  const courses = fetched.map((course) => ({
    name: courseNames.get(course.canvasCourseId) ?? "Course",
    ok: course.ok,
    error: errors.get(course.canvasCourseId),
    assignments: course.assignments.length,
  }));

  const createdSamples = diff.creates.slice(0, 12).map((create) => ({
    title: create.mapped.title,
    course: courseNames.get(create.mapped.canvasCourseId) ?? "",
    dueAt: create.mapped.dueAt,
    complete: create.mapped.complete,
  }));

  const completedTitles: string[] = [];
  const updatedTitles: string[] = [];
  for (const update of diff.updates) {
    if (update.kinds.includes("completed")) {
      completedTitles.push(update.title);
    }
    if (update.kinds.includes("details")) {
      updatedTitles.push(update.title);
    }
  }

  return {
    applied: false,
    summary,
    courses,
    samples: {
      created: createdSamples,
      completed: completedTitles.slice(0, 8),
      updated: updatedTitles.slice(0, 8),
      removed: diff.removes.slice(0, 8).map((remove) => remove.title),
    },
    impact: null,
  };
}

/**
 * Fetches the selected courses from Canvas and compares them with Rushd.
 * dryRun=true changes nothing and returns a preview (including how the plan
 * would change). dryRun=false applies the changes in one transaction.
 */
export async function runCanvasSync(
  userId: string,
  options: { dryRun: boolean } & CanvasDeps,
): Promise<ServiceResult<SyncReport>> {
  const now = currentTime(options);
  let client: CanvasClient | null = null;
  let locked = false;

  try {
    const connection = await db.canvasConnection.findUnique({
      where: { userId },
      select: {
        id: true,
        courses: { where: { selected: true }, select: { id: true, canvasCourseId: true, name: true, classId: true } },
      },
    });
    if (!connection) {
      return { ok: false, error: NOT_CONNECTED };
    }
    if (connection.courses.length === 0) {
      return { ok: false, error: "Choose at least one course to sync.", code: "NO_COURSES" };
    }

    // Only a real sync needs the lock; a preview changes nothing.
    if (!options.dryRun) {
      const gotLock = await takeSyncLock(userId, now);
      if (!gotLock) {
        return { ok: false, error: "A sync is already running. Give it a minute.", code: "LOCKED" };
      }
      locked = true;
    }

    // A selected course whose class was deleted gets linked to a class again first.
    const someClassMissing = connection.courses.some((course) => !course.classId);
    if (someClassMissing) {
      const selectedIds = connection.courses.map((course) => course.id);
      await setSelectedCanvasCourses(userId, selectedIds);
    }
    const courses = await db.canvasCourse.findMany({
      where: { connectionId: connection.id, selected: true, classId: { not: null } },
      select: { canvasCourseId: true, name: true, classId: true },
    });

    const secret = await loadSecret(userId);
    if (!secret) {
      return { ok: false, error: NOT_CONNECTED };
    }
    client = makeClient(options, secret.baseUrl, secret.token);

    // classId is never null here because of the query above.
    const coursesToFetch = courses.map((course) => ({
      canvasCourseId: course.canvasCourseId,
      classId: course.classId!,
      name: course.name,
    }));
    const { fetched, errors, authFailed } = await fetchCourses(client, secret.baseUrl, coursesToFetch);

    if (authFailed) {
      if (!options.dryRun) {
        await markNeedsReauth(userId);
      }
      return { ok: false, code: "UNAUTHORIZED", error: "Canvas stopped accepting your token. Reconnect Canvas to keep syncing." };
    }

    const allFailed = fetched.every((course) => !course.ok);
    if (allFailed) {
      const message = firstError(errors) ?? "Couldn't read your courses from Canvas.";
      if (!options.dryRun) {
        await db.canvasConnection.update({
          where: { userId },
          data: { status: "ERROR", lastSyncStatus: "error", lastSyncError: message, lastSyncAt: now },
        });
      }
      return { ok: false, error: message };
    }

    const canvasCourseIds = courses.map((course) => course.canvasCourseId);
    const existing = await loadExistingCanvasRows(userId, canvasCourseIds);
    const diff = diffCanvasAssignments(existing, fetched);

    const courseNames = new Map<string, string>();
    for (const course of courses) {
      courseNames.set(course.canvasCourseId, course.name);
    }
    const report = buildReport(diff, fetched, errors, courseNames);

    if (options.dryRun) {
      report.impact = await computePlanImpact(userId, diff, now);
      return { ok: true, value: report };
    }

    await applyDiff(userId, connection.id, diff, fetched, report.summary, errors, now);
    report.applied = true;
    return { ok: true, value: report };
  } catch (error) {
    if (isUnauthorized(error) && !options.dryRun) {
      await markNeedsReauth(userId);
    }
    return fail(error);
  } finally {
    await client?.close();
    if (locked) {
      await db.canvasConnection.updateMany({ where: { userId }, data: { syncStartedAt: null } }).catch(() => {});
    }
  }
}

/** When Rushd should say an imported, already-done assignment was completed. */
function completedAtFor(mapped: MappedAssignment, now: Date): Date | null {
  if (!mapped.complete) {
    return null;
  }
  const marker = mapped.completionMarker;
  // The 1970 placeholder means "no real submission time", so use now instead.
  if (marker && marker.getUTCFullYear() > 1970) {
    return marker;
  }
  return now;
}

async function applyDiff(
  userId: string,
  connectionId: string,
  diff: SyncDiff,
  fetched: FetchedCourse[],
  summary: SyncSummary,
  errors: Map<string, string>,
  now: Date,
) {
  const okCourseIds: string[] = [];
  for (const course of fetched) {
    if (course.ok) {
      okCourseIds.push(course.canvasCourseId);
    }
  }
  const partial = summary.coursesFailed > 0;

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  if (diff.creates.length > 0) {
    const newRows = diff.creates.map(({ classId, mapped }) => ({
      userId,
      classId,
      source: "CANVAS" as const,
      title: mapped.title,
      dueAt: mapped.dueAt,
      estimatedMinutes: mapped.defaultEstimate,
      estimatedByRushd: true,
      priority: "MEDIUM" as const,
      status: mapped.complete ? ("COMPLETED" as const) : ("NOT_STARTED" as const),
      completedAt: completedAtFor(mapped, now),
      canvasCourseId: mapped.canvasCourseId,
      canvasAssignmentId: mapped.canvasAssignmentId,
      canvasUrl: mapped.canvasUrl,
      pointsPossible: mapped.pointsPossible,
      canvasSubmittedAt: mapped.completionMarker,
      canvasSyncedAt: now,
    }));
    // The unique (userId, canvasCourseId, canvasAssignmentId) index turns a
    // duplicate from a racing sync into a no-op instead of a second copy.
    operations.push(db.assignment.createMany({ skipDuplicates: true, data: newRows }));
  }

  for (const update of diff.updates) {
    operations.push(
      db.assignment.updateMany({
        where: { id: update.id, userId, source: "CANVAS" },
        data: { ...update.data, canvasSyncedAt: now },
      }),
    );
  }

  if (diff.removes.length > 0) {
    const removedIds = diff.removes.map((remove) => remove.id);
    operations.push(
      db.assignment.updateMany({
        where: { id: { in: removedIds }, userId, source: "CANVAS" },
        data: { canvasRemovedAt: now },
      }),
    );
  }

  operations.push(
    db.canvasCourse.updateMany({
      where: { connectionId, canvasCourseId: { in: okCourseIds } },
      data: { lastSyncedAt: now },
    }),
  );

  operations.push(
    db.canvasConnection.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        lastSyncAt: now,
        lastSyncStatus: partial ? "partial" : "ok",
        lastSyncError: partial ? (firstError(errors) ?? null) : null,
        lastSyncSummary: { ...summary },
      },
    }),
  );

  await db.$transaction(operations);
}

function sumValues(record: Record<string, number>): number {
  let total = 0;
  for (const value of Object.values(record)) {
    total += value;
  }
  return total;
}

/** Shows how the student's plan would change if the diff were applied. */
async function computePlanImpact(userId: string, diff: SyncDiff, now: Date): Promise<PlanImpact | null> {
  if (!diffHasChanges(diff)) {
    return { addedOpenMinutes: 0, shortfallBefore: 0, shortfallAfter: 0, overloadedDaysAfter: 0, atRisk: [] };
  }
  const context = await loadPlanningContext(userId, now);
  const before = generatePlan(context);

  const classIds = [...new Set(diff.creates.map((create) => create.classId))];
  const classes = await db.class.findMany({
    where: { userId, id: { in: classIds } },
    select: { id: true, name: true, color: true, priority: true },
  });
  const classById = new Map(classes.map((cls) => [cls.id, cls]));

  // Work that would leave the plan: removed, or newly completed.
  const leavingIds = new Set<string>();
  for (const remove of diff.removes) {
    leavingIds.add(remove.id);
  }
  for (const update of diff.updates) {
    if (update.data.status === "COMPLETED") {
      leavingIds.add(update.id);
    }
  }
  const updatesById = new Map(diff.updates.map((update) => [update.id, update]));

  const items: WorkItem[] = [];
  for (const item of context.workItems) {
    const isAssignment = item.kind === "assignment";
    if (isAssignment && leavingIds.has(item.id)) {
      continue;
    }
    const update = isAssignment ? updatesById.get(item.id) : undefined;
    if (!update) {
      items.push(item);
      continue;
    }
    items.push({
      ...item,
      title: update.data.title ?? item.title,
      dueAt: update.data.dueAt ?? item.dueAt,
      remainingMinutes: update.data.estimatedMinutes ?? item.remainingMinutes,
    });
  }

  // Add new, still-open work (skip anything due more than 30 days ago).
  const oldestDue = now.getTime() - DAY_MS * 30;
  let addedOpenMinutes = 0;
  for (let i = 0; i < diff.creates.length; i++) {
    const create = diff.creates[i];
    if (create.mapped.complete || create.mapped.dueAt.getTime() < oldestDue) {
      continue;
    }
    const cls = classById.get(create.classId);
    if (!cls) {
      continue;
    }
    addedOpenMinutes += create.mapped.defaultEstimate;
    items.push({
      kind: "assignment",
      id: `preview-${i}`,
      classId: cls.id,
      title: create.mapped.title,
      className: cls.name,
      classColor: cls.color,
      priority: "MEDIUM",
      classPriority: cls.priority,
      dueAt: create.mapped.dueAt,
      remainingMinutes: create.mapped.defaultEstimate,
      rawEstimatedMinutes: create.mapped.defaultEstimate,
      estimateAdjusted: false,
      source: "CANVAS",
    });
  }
  const after = generatePlan({ ...context, workItems: items });

  let overloadedDaysAfter = 0;
  const atRisk: { title: string; shortMinutes: number }[] = [];
  for (const warning of after.warnings ?? []) {
    if (warning.type === "OVERLOADED_DAY") {
      overloadedDaysAfter++;
    }
    if (warning.type === "DEADLINE_SHORTFALL") {
      atRisk.push({ title: warning.title, shortMinutes: warning.shortMinutes });
    }
  }

  return {
    addedOpenMinutes,
    shortfallBefore: sumValues(before.unscheduledMinutesByItem),
    shortfallAfter: sumValues(after.unscheduledMinutesByItem),
    overloadedDaysAfter,
    atRisk: atRisk.slice(0, 5),
  };
}

// --- Disconnect ----------------------------------------------------------------

/**
 * Deletes the saved token and course list, so Rushd can't reach Canvas for
 * this student anymore. Imported assignments are kept unless the student
 * chooses to remove them; manual work is never touched.
 */
export async function disconnectCanvas(
  userId: string,
  options: { removeImported: boolean },
): Promise<ServiceResult<{ removedAssignments: number }>> {
  const result = await db.$transaction(async (tx) => {
    const connection = await tx.canvasConnection.findUnique({ where: { userId }, select: { id: true } });
    if (!connection) {
      return null;
    }

    // Kept rows stay marked as CANVAS (that's where they came from); with no
    // connection they simply stop syncing.
    let removedAssignments = 0;
    if (options.removeImported) {
      const deleted = await tx.assignment.deleteMany({ where: { userId, source: "CANVAS" } });
      removedAssignments = deleted.count;
    }

    await tx.canvasConnection.delete({ where: { id: connection.id } });
    return { removedAssignments };
  });

  if (!result) {
    return { ok: false, error: NOT_CONNECTED };
  }
  return { ok: true, value: result };
}
