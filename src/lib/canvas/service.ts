import "server-only";
import { db } from "@/lib/db";
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

// Orchestrates the Canvas integration: connect, choose courses, preview a
// sync, apply it, disconnect. Every function takes the authenticated userId
// from its caller (server actions derive it from the session — never from
// client input) and scopes every query to it.
//
// The decrypted token exists only inside these functions, only for the
// duration of a request, and is never returned, logged, or persisted in any
// form other than the vault's ciphertext.

export interface CanvasDeps {
  /** Test seam. Production always uses the real, SSRF-guarded client. */
  createClient?: (baseUrl: string, token: string) => CanvasClient;
  now?: () => Date;
}

const realClient = (baseUrl: string, token: string) => new CanvasClient(baseUrl, token);

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

function fail(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof CanvasApiError) return { ok: false, error: error.message, code: error.code };
  if (error instanceof CanvasUrlError) return { ok: false, error: error.message, code: error.code };
  if (error instanceof VaultError) {
    return {
      ok: false,
      error:
        error.code === "NOT_CONFIGURED" || error.code === "BAD_KEY"
          ? "Canvas integration isn't available on this server yet."
          : "Your saved Canvas connection can't be read. Please reconnect.",
      code: error.code,
    };
  }
  // Unexpected: log the type only (never the object, which could carry a request).
  console.error("[canvas] unexpected error", (error as Error)?.name ?? typeof error);
  return { ok: false, error: "Something went wrong talking to Canvas. Please try again." };
}

// --- Safe reads (no secret material ever selected) --------------------------

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
  const conn = await db.canvasConnection.findUnique({
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
  if (!conn) return null;
  const importedCount = await db.assignment.count({
    where: { userId, source: "CANVAS", canvasRemovedAt: null },
  });
  return {
    baseUrl: conn.baseUrl,
    canvasUserName: conn.canvasUserName,
    status: conn.status,
    lastSyncAt: conn.lastSyncAt,
    lastSyncStatus: conn.lastSyncStatus,
    lastSyncError: conn.lastSyncError,
    lastSyncSummary: (conn.lastSyncSummary as SyncSummary | null) ?? null,
    connectedAt: conn.createdAt,
    courses: conn.courses.map((c) => ({
      id: c.id,
      canvasCourseId: c.canvasCourseId,
      name: c.name,
      courseCode: c.courseCode,
      termName: c.termName,
      selected: c.selected,
      className: c.class?.name ?? null,
      classColor: c.class?.color ?? null,
      lastSyncedAt: c.lastSyncedAt,
    })),
    importedCount,
  };
}

/** The only place the ciphertext is read. */
async function loadSecret(userId: string) {
  const conn = await db.canvasConnection.findUnique({
    where: { userId },
    select: { id: true, baseUrl: true, encryptedToken: true },
  });
  if (!conn) return null;
  return { id: conn.id, baseUrl: conn.baseUrl, token: decryptToken(userId, conn.encryptedToken) };
}

// --- Connect -----------------------------------------------------------------

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
  if (token.length < 20 || token.length > 512 || /\s/.test(token)) {
    return { ok: false, error: "That doesn't look like a Canvas access token. Copy the whole token Canvas showed you.", code: "BAD_TOKEN" };
  }

  let client: CanvasClient | null = null;
  try {
    const baseUrl = normalizeCanvasBaseUrl(rawBaseUrl);
    client = (deps.createClient ?? realClient)(baseUrl, token);
    const self = await client.getSelf();
    const courses = await client.listCourses();
    const encryptedToken = encryptToken(userId, token);

    await db.$transaction(async (tx) => {
      const existing = await tx.canvasConnection.findUnique({ where: { userId }, select: { id: true, baseUrl: true } });
      // Switching to a different Canvas instance invalidates course ids.
      if (existing && existing.baseUrl !== baseUrl) {
        await tx.canvasCourse.deleteMany({ where: { connectionId: existing.id } });
      }
      const conn = await tx.canvasConnection.upsert({
        where: { userId },
        create: {
          userId,
          baseUrl,
          encryptedToken,
          canvasUserId: String(self.id),
          canvasUserName: self.name.slice(0, 120),
          status: "ACTIVE",
        },
        update: {
          baseUrl,
          encryptedToken,
          canvasUserId: String(self.id),
          canvasUserName: self.name.slice(0, 120),
          status: "ACTIVE",
          lastSyncError: null,
          syncStartedAt: null,
        },
        select: { id: true },
      });
      await upsertCourses(tx, conn.id, courses);
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

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function upsertCourses(tx: Tx, connectionId: string, courses: ApiCourse[]) {
  for (const c of courses) {
    const data = {
      name: c.name.slice(0, 160),
      courseCode: c.course_code?.slice(0, 80) ?? null,
      termName: c.term?.name?.slice(0, 80) ?? null,
    };
    await tx.canvasCourse.upsert({
      where: { connectionId_canvasCourseId: { connectionId, canvasCourseId: String(c.id) } },
      create: { connectionId, canvasCourseId: String(c.id), ...data },
      update: data,
    });
  }
}

export async function refreshCanvasCourses(userId: string, deps: CanvasDeps = {}): Promise<ServiceResult<{ courseCount: number }>> {
  let client: CanvasClient | null = null;
  try {
    const secret = await loadSecret(userId);
    if (!secret) return { ok: false, error: "Canvas isn't connected." };
    client = (deps.createClient ?? realClient)(secret.baseUrl, secret.token);
    const courses = await client.listCourses();
    await db.$transaction(async (tx) => upsertCourses(tx, secret.id, courses));
    return { ok: true, value: { courseCount: courses.length } };
  } catch (error) {
    if (error instanceof CanvasApiError && error.code === "UNAUTHORIZED") await markNeedsReauth(userId);
    return fail(error);
  } finally {
    await client?.close();
  }
}

// --- Course selection --------------------------------------------------------

/** Sets which Canvas courses sync. Each selected course is linked to a Rushd
 * class — an existing one with the same name, or a new one. Deselecting stops
 * syncing that course; its already-imported assignments stay put. */
export async function setSelectedCanvasCourses(
  userId: string,
  courseRowIds: string[],
): Promise<ServiceResult<{ selected: number; classesCreated: number }>> {
  const conn = await db.canvasConnection.findUnique({ where: { userId }, select: { id: true } });
  if (!conn) return { ok: false, error: "Canvas isn't connected." };

  const unique = [...new Set(courseRowIds)].slice(0, 50);
  let classesCreated = 0;

  await db.$transaction(async (tx) => {
    // Scope by connection, which is scoped by user: foreign ids match nothing.
    const courses = await tx.canvasCourse.findMany({
      where: { connectionId: conn.id },
      select: { id: true, name: true, classId: true },
    });
    const wanted = new Set(unique);
    const classes = await tx.class.findMany({ where: { userId }, select: { id: true, name: true, archived: true } });
    const byName = new Map(classes.filter((c) => !c.archived).map((c) => [c.name.trim().toLowerCase(), c.id]));
    let colorIndex = classes.length;

    for (const course of courses) {
      const selected = wanted.has(course.id);
      let classId = course.classId;
      if (selected && !classId) {
        const existing = byName.get(course.name.trim().toLowerCase());
        if (existing) classId = existing;
        else {
          const created = await tx.class.create({
            data: {
              userId,
              name: course.name.slice(0, 80),
              color: CANVAS_CLASS_COLORS[colorIndex++ % CANVAS_CLASS_COLORS.length],
            },
            select: { id: true },
          });
          classId = created.id;
          byName.set(course.name.trim().toLowerCase(), created.id);
          classesCreated++;
        }
      }
      await tx.canvasCourse.update({ where: { id: course.id }, data: { selected, classId } });
    }
  });

  return { ok: true, value: { selected: unique.length, classesCreated } };
}

// --- Sync --------------------------------------------------------------------

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

async function fetchCourses(
  client: CanvasClient,
  baseUrl: string,
  courses: { canvasCourseId: string; classId: string; name: string }[],
): Promise<{ fetched: FetchedCourse[]; errors: Map<string, string>; authFailed: boolean }> {
  const fetched: FetchedCourse[] = [];
  const errors = new Map<string, string>();
  let authFailed = false;
  let next = 0;

  async function worker() {
    while (next < courses.length && !authFailed) {
      const course = courses[next++];
      try {
        const raw = await client.listAssignments(course.canvasCourseId);
        const assignments: MappedAssignment[] = [];
        const skipped: { id: string; reason: SkipReason }[] = [];
        for (const a of raw) {
          const r = mapAssignment(baseUrl, course.canvasCourseId, a);
          if (r.ok) assignments.push(r.value);
          else skipped.push({ id: String(a.id), reason: r.reason });
        }
        fetched.push({ canvasCourseId: course.canvasCourseId, classId: course.classId, ok: true, assignments, skipped });
      } catch (error) {
        if (error instanceof CanvasApiError && error.code === "UNAUTHORIZED") authFailed = true;
        errors.set(course.canvasCourseId, error instanceof CanvasApiError ? error.message : "Couldn't read this course.");
        fetched.push({ canvasCourseId: course.canvasCourseId, classId: course.classId, ok: false, assignments: [], skipped: [] });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(COURSE_CONCURRENCY, courses.length) }, worker));
  return { fetched, errors, authFailed };
}

async function markNeedsReauth(userId: string) {
  await db.canvasConnection.updateMany({
    where: { userId },
    data: {
      status: "NEEDS_REAUTH",
      lastSyncStatus: "error",
      lastSyncError: "Canvas stopped accepting the saved token (it may have expired or been revoked). Reconnect to resume syncing.",
    },
  });
}

/**
 * Fetches the selected courses from Canvas and diffs them against Rushd.
 * dryRun=true changes nothing and returns a preview (including how the plan
 * would change); dryRun=false applies the diff in one transaction.
 */
export async function runCanvasSync(
  userId: string,
  options: { dryRun: boolean } & CanvasDeps,
): Promise<ServiceResult<SyncReport>> {
  const now = (options.now ?? (() => new Date()))();
  let client: CanvasClient | null = null;
  let locked = false;

  try {
    const conn = await db.canvasConnection.findUnique({
      where: { userId },
      select: {
        id: true,
        courses: { where: { selected: true }, select: { id: true, canvasCourseId: true, name: true, classId: true } },
      },
    });
    if (!conn) return { ok: false, error: "Canvas isn't connected." };
    if (conn.courses.length === 0) return { ok: false, error: "Choose at least one course to sync.", code: "NO_COURSES" };

    if (!options.dryRun) {
      const got = await db.canvasConnection.updateMany({
        where: { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - SYNC_LOCK_MS) } }] },
        data: { syncStartedAt: now },
      });
      if (got.count === 0) return { ok: false, error: "A sync is already running. Give it a minute.", code: "LOCKED" };
      locked = true;
    }

    // A selected course whose class was deleted gets re-linked first.
    const missingClass = conn.courses.filter((c) => !c.classId);
    if (missingClass.length > 0) {
      const selectedIds = conn.courses.map((c) => c.id);
      await setSelectedCanvasCourses(userId, selectedIds);
    }
    const courses = await db.canvasCourse.findMany({
      where: { connectionId: conn.id, selected: true, classId: { not: null } },
      select: { canvasCourseId: true, name: true, classId: true },
    });

    const secret = await loadSecret(userId);
    if (!secret) return { ok: false, error: "Canvas isn't connected." };
    client = (options.createClient ?? realClient)(secret.baseUrl, secret.token);

    const { fetched, errors, authFailed } = await fetchCourses(
      client,
      secret.baseUrl,
      courses.map((c) => ({ canvasCourseId: c.canvasCourseId, classId: c.classId!, name: c.name })),
    );
    if (authFailed) {
      if (!options.dryRun) await markNeedsReauth(userId);
      return { ok: false, code: "UNAUTHORIZED", error: "Canvas stopped accepting your token. Reconnect Canvas to keep syncing." };
    }
    if (fetched.every((f) => !f.ok)) {
      const first = [...errors.values()][0] ?? "Couldn't read your courses from Canvas.";
      if (!options.dryRun) {
        await db.canvasConnection.update({
          where: { userId },
          data: { status: "ERROR", lastSyncStatus: "error", lastSyncError: first, lastSyncAt: now },
        });
      }
      return { ok: false, error: first };
    }

    const existingRows = await db.assignment.findMany({
      where: {
        userId,
        source: "CANVAS",
        canvasCourseId: { in: courses.map((c) => c.canvasCourseId) },
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
    const existing: ExistingCanvasRow[] = existingRows.map((r) => ({
      ...r,
      canvasCourseId: r.canvasCourseId!,
      canvasAssignmentId: r.canvasAssignmentId!,
    }));

    const diff = diffCanvasAssignments(existing, fetched);
    const courseName = new Map(courses.map((c) => [c.canvasCourseId, c.name]));
    const summary: SyncSummary = {
      created: diff.counts.created,
      updated: diff.counts.updated,
      completed: diff.counts.completed,
      removed: diff.counts.removed,
      restored: diff.counts.restored,
      unchanged: diff.counts.unchanged,
      skippedNoDueDate: diff.counts.skippedNoDueDate,
      skippedUnpublished: diff.counts.skippedUnpublished,
      coursesOk: fetched.filter((f) => f.ok).length,
      coursesFailed: fetched.filter((f) => !f.ok).length,
    };
    const report: SyncReport = {
      applied: false,
      summary,
      courses: fetched.map((f) => ({
        name: courseName.get(f.canvasCourseId) ?? "Course",
        ok: f.ok,
        error: errors.get(f.canvasCourseId),
        assignments: f.assignments.length,
      })),
      samples: {
        created: diff.creates.slice(0, 12).map((c) => ({
          title: c.mapped.title,
          course: courseName.get(c.mapped.canvasCourseId) ?? "",
          dueAt: c.mapped.dueAt,
          complete: c.mapped.complete,
        })),
        completed: diff.updates.filter((u) => u.kinds.includes("completed")).slice(0, 8).map((u) => u.title),
        updated: diff.updates.filter((u) => u.kinds.includes("details")).slice(0, 8).map((u) => u.title),
        removed: diff.removes.slice(0, 8).map((r) => r.title),
      },
      impact: null,
    };

    if (options.dryRun) {
      report.impact = await computePlanImpact(userId, diff, now);
      return { ok: true, value: report };
    }

    await applyDiff(userId, conn.id, diff, fetched, summary, errors, now);
    report.applied = true;
    return { ok: true, value: report };
  } catch (error) {
    if (error instanceof CanvasApiError && error.code === "UNAUTHORIZED" && !options.dryRun) await markNeedsReauth(userId);
    return fail(error);
  } finally {
    await client?.close();
    if (locked) {
      await db.canvasConnection.updateMany({ where: { userId }, data: { syncStartedAt: null } }).catch(() => {});
    }
  }
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
  const okCourseIds = fetched.filter((f) => f.ok).map((f) => f.canvasCourseId);
  const partial = summary.coursesFailed > 0;

  await db.$transaction([
    ...(diff.creates.length > 0
      ? [
          db.assignment.createMany({
            // The unique (userId, canvasCourseId, canvasAssignmentId) index makes
            // a racing duplicate a no-op rather than a second copy.
            skipDuplicates: true,
            data: diff.creates.map(({ classId, mapped: m }) => ({
              userId,
              classId,
              source: "CANVAS" as const,
              title: m.title,
              dueAt: m.dueAt,
              estimatedMinutes: m.defaultEstimate,
              estimatedByRushd: true,
              priority: "MEDIUM" as const,
              status: m.complete ? ("COMPLETED" as const) : ("NOT_STARTED" as const),
              completedAt: m.complete
                ? m.completionMarker && m.completionMarker.getUTCFullYear() > 1970
                  ? m.completionMarker
                  : now
                : null,
              canvasCourseId: m.canvasCourseId,
              canvasAssignmentId: m.canvasAssignmentId,
              canvasUrl: m.canvasUrl,
              pointsPossible: m.pointsPossible,
              canvasSubmittedAt: m.completionMarker,
              canvasSyncedAt: now,
            })),
          }),
        ]
      : []),
    ...diff.updates.map((u) =>
      db.assignment.updateMany({
        where: { id: u.id, userId, source: "CANVAS" },
        data: { ...u.data, canvasSyncedAt: now },
      }),
    ),
    ...(diff.removes.length > 0
      ? [
          db.assignment.updateMany({
            where: { id: { in: diff.removes.map((r) => r.id) }, userId, source: "CANVAS" },
            data: { canvasRemovedAt: now },
          }),
        ]
      : []),
    db.canvasCourse.updateMany({
      where: { connectionId, canvasCourseId: { in: okCourseIds } },
      data: { lastSyncedAt: now },
    }),
    db.canvasConnection.update({
      where: { userId },
      data: {
        status: "ACTIVE",
        lastSyncAt: now,
        lastSyncStatus: partial ? "partial" : "ok",
        lastSyncError: partial ? [...errors.values()][0] ?? null : null,
        lastSyncSummary: { ...summary },
      },
    }),
  ]);
}

async function computePlanImpact(userId: string, diff: SyncDiff, now: Date): Promise<PlanImpact | null> {
  if (!diffHasChanges(diff)) {
    return { addedOpenMinutes: 0, shortfallBefore: 0, shortfallAfter: 0, overloadedDaysAfter: 0, atRisk: [] };
  }
  const ctx = await loadPlanningContext(userId, now);
  const before = generatePlan(ctx);

  const classIds = [...new Set(diff.creates.map((c) => c.classId))];
  const classes = await db.class.findMany({
    where: { userId, id: { in: classIds } },
    select: { id: true, name: true, color: true, priority: true },
  });
  const classById = new Map(classes.map((c) => [c.id, c]));

  const leaving = new Set([
    ...diff.removes.map((r) => r.id),
    ...diff.updates.filter((u) => u.data.status === "COMPLETED").map((u) => u.id),
  ]);
  const updatesById = new Map(diff.updates.map((u) => [u.id, u]));
  const items: WorkItem[] = ctx.workItems
    .filter((w) => !(w.kind === "assignment" && leaving.has(w.id)))
    .map((w) => {
      const u = w.kind === "assignment" ? updatesById.get(w.id) : undefined;
      if (!u) return w;
      return {
        ...w,
        title: u.data.title ?? w.title,
        dueAt: u.data.dueAt ?? w.dueAt,
        remainingMinutes: u.data.estimatedMinutes ?? w.remainingMinutes,
      };
    });
  let addedOpenMinutes = 0;
  diff.creates.forEach((c, i) => {
    if (c.mapped.complete || c.mapped.dueAt.getTime() < now.getTime() - 86_400_000 * 30) return;
    const cls = classById.get(c.classId);
    if (!cls) return;
    addedOpenMinutes += c.mapped.defaultEstimate;
    items.push({
      kind: "assignment",
      id: `preview-${i}`,
      classId: cls.id,
      title: c.mapped.title,
      className: cls.name,
      classColor: cls.color,
      priority: "MEDIUM",
      classPriority: cls.priority,
      dueAt: c.mapped.dueAt,
      remainingMinutes: c.mapped.defaultEstimate,
      rawEstimatedMinutes: c.mapped.defaultEstimate,
      estimateAdjusted: false,
      source: "CANVAS",
    });
  });
  const after = generatePlan({ ...ctx, workItems: items });

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  return {
    addedOpenMinutes,
    shortfallBefore: sum(before.unscheduledMinutesByItem),
    shortfallAfter: sum(after.unscheduledMinutesByItem),
    overloadedDaysAfter: (after.warnings ?? []).filter((w) => w.type === "OVERLOADED_DAY").length,
    atRisk: (after.warnings ?? [])
      .flatMap((w) => (w.type === "DEADLINE_SHORTFALL" ? [{ title: w.title, shortMinutes: w.shortMinutes }] : []))
      .slice(0, 5),
  };
}

// --- Disconnect --------------------------------------------------------------

/**
 * Deletes the stored credential (and course list) — Rushd can no longer reach
 * Canvas for this student. Imported assignments are kept as ordinary work
 * unless the student chooses to remove them; manual work is never touched.
 */
export async function disconnectCanvas(
  userId: string,
  options: { removeImported: boolean },
): Promise<ServiceResult<{ removedAssignments: number }>> {
  const result = await db.$transaction(async (tx) => {
    const conn = await tx.canvasConnection.findUnique({ where: { userId }, select: { id: true } });
    if (!conn) return null;
    let removedAssignments = 0;
    if (options.removeImported) {
      const r = await tx.assignment.deleteMany({ where: { userId, source: "CANVAS" } });
      removedAssignments = r.count;
    } else {
      // Kept rows stay CANVAS-sourced (provenance is history), but with no
      // connection they simply stop syncing.
    }
    await tx.canvasConnection.delete({ where: { id: conn.id } });
    return { removedAssignments };
  });
  if (!result) return { ok: false, error: "Canvas isn't connected." };
  return { ok: true, value: result };
}
