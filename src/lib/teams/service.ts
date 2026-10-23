import "server-only";
import { db } from "@/lib/db";
import { CANVAS_CLASS_COLORS } from "@/lib/canvas/colors";
import { decryptToken, encryptToken, isVaultConfigured, VaultError } from "@/lib/canvas/token-vault";
import { exchangeCode, refreshTokens, TeamsAuthError, teamsConfigured } from "./oauth";
import { GraphError, getMe, listAssignments, listClasses, type GraphAssignment } from "./graph";

// Microsoft Teams for Education, read-only. Security: userId always comes from
// the session and every query is scoped to it. The refresh token is only
// stored encrypted (bound to the user) and is never returned or logged.
// Microsoft rotates refresh tokens, so each use saves the newest one.

export interface TeamsDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export type TeamsResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

const DEFAULT_MINUTES = 45;
const SYNC_LOCK_MS = 2 * 60 * 1000;
const OPEN_STATUSES = new Set(["assigned", "published"]);
const DONE_SUBMISSIONS = new Set(["submitted", "returned"]);

type Transaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];
type TeamsClassInfo = { id: string; displayName?: string | null };

/** Turns any error into a friendly failure result. */
function fail(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof TeamsAuthError || error instanceof GraphError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof VaultError) {
    return { ok: false, error: "Teams integration isn't available on this server yet.", code: error.code };
  }
  // Only log the error's type, never the object.
  console.error("[teams] unexpected error", (error as Error)?.name ?? typeof error);
  return { ok: false, error: "Something went wrong talking to Microsoft Teams. Try again." };
}

/** Keeps a link only if it's https on teams.microsoft.com. */
function safeTeamsUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname === "teams.microsoft.com") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function teamsAvailable(): boolean {
  return teamsConfigured() && isVaultConfigured();
}

/** Saves (or renames) the Teams classes for a connection. */
async function saveClasses(client: Transaction | typeof db, connectionId: string, classes: TeamsClassInfo[]) {
  for (const teamsClass of classes) {
    const name = (teamsClass.displayName ?? "Untitled class").slice(0, 120);
    await client.teamsClass.upsert({
      where: { connectionId_teamsClassId: { connectionId, teamsClassId: teamsClass.id } },
      update: { name },
      create: { connectionId, teamsClassId: teamsClass.id, name },
    });
  }
}

/** Finishes the Microsoft sign-in: saves the refresh token and the class list. */
export async function connectTeams(
  userId: string,
  code: string,
  verifier: string,
  deps: TeamsDeps = {},
): Promise<TeamsResult<{ accountName: string | null; classCount: number }>> {
  try {
    const tokens = await exchangeCode(code, verifier, deps.fetchImpl);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return { ok: false, error: "Microsoft didn't grant offline access. Try connecting again." };
    }
    const me = await getMe(tokens.access_token, deps.fetchImpl);
    const classes = await listClasses(tokens.access_token, deps.fetchImpl);

    await db.$transaction(async (tx) => {
      const encryptedRefreshToken = encryptToken(userId, refreshToken);
      const connection = await tx.teamsConnection.upsert({
        where: { userId },
        update: { encryptedRefreshToken, accountName: me.name, status: "ACTIVE", lastSyncError: null },
        create: { userId, encryptedRefreshToken, accountName: me.name },
        select: { id: true },
      });
      await saveClasses(tx, connection.id, classes);
    });

    return { ok: true, value: { accountName: me.name, classCount: classes.length } };
  } catch (error) {
    return fail(error);
  }
}

async function markNeedsReauth(userId: string) {
  await db.teamsConnection.update({ where: { userId }, data: { status: "NEEDS_REAUTH" } });
}

/** Runs `callWithToken` with a fresh access token, saving the new refresh token Microsoft hands back. */
async function withAccessToken<T>(userId: string, deps: TeamsDeps, callWithToken: (token: string) => Promise<T>): Promise<T> {
  const connection = await db.teamsConnection.findUnique({ where: { userId }, select: { encryptedRefreshToken: true } });
  if (!connection) {
    throw new GraphError("Teams isn't connected.", "UNAUTHORIZED");
  }

  let tokens;
  try {
    const refreshToken = decryptToken(userId, connection.encryptedRefreshToken);
    tokens = await refreshTokens(refreshToken, deps.fetchImpl);
  } catch (error) {
    if (error instanceof TeamsAuthError && error.code === "INVALID_GRANT") {
      await markNeedsReauth(userId);
    }
    throw error;
  }

  if (tokens.refresh_token) {
    await db.teamsConnection.update({
      where: { userId },
      data: { encryptedRefreshToken: encryptToken(userId, tokens.refresh_token), status: "ACTIVE" },
    });
  }

  try {
    return await callWithToken(tokens.access_token);
  } catch (error) {
    if (error instanceof GraphError && error.code === "UNAUTHORIZED") {
      await markNeedsReauth(userId);
    }
    throw error;
  }
}

export async function refreshTeamsClasses(userId: string, deps: TeamsDeps = {}): Promise<TeamsResult<{ classCount: number }>> {
  try {
    const classes = await withAccessToken(userId, deps, (token) => listClasses(token, deps.fetchImpl));
    const connection = await db.teamsConnection.findUniqueOrThrow({ where: { userId }, select: { id: true } });
    await saveClasses(db, connection.id, classes);
    return { ok: true, value: { classCount: classes.length } };
  } catch (error) {
    return fail(error);
  }
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Chooses which Teams classes sync. Each one gets (or reuses) a Rushd class. */
export async function setSelectedTeamsClasses(userId: string, rowIds: string[]): Promise<TeamsResult<{ selected: number }>> {
  const connection = await db.teamsConnection.findUnique({ where: { userId }, select: { id: true } });
  if (!connection) {
    return { ok: false, error: "Teams isn't connected." };
  }
  const wanted = new Set(rowIds.slice(0, 50));

  await db.$transaction(async (tx) => {
    // Scoped to this user's connection, so ids from other users match nothing.
    const rows = await tx.teamsClass.findMany({
      where: { connectionId: connection.id },
      select: { id: true, name: true, classId: true },
    });
    const existingClasses = await tx.class.findMany({ where: { userId }, select: { id: true, name: true, archived: true } });

    const classIdByName = new Map<string, string>();
    for (const existingClass of existingClasses) {
      if (!existingClass.archived) {
        classIdByName.set(nameKey(existingClass.name), existingClass.id);
      }
    }
    let colorIndex = existingClasses.length;

    for (const row of rows) {
      const selected = wanted.has(row.id);
      let classId = row.classId;

      if (selected && !classId) {
        classId = classIdByName.get(nameKey(row.name)) ?? null;
        if (!classId) {
          const color = CANVAS_CLASS_COLORS[colorIndex % CANVAS_CLASS_COLORS.length];
          colorIndex++;
          const created = await tx.class.create({
            data: { userId, name: row.name.slice(0, 80), color },
            select: { id: true },
          });
          classId = created.id;
          classIdByName.set(nameKey(row.name), created.id);
        }
      }

      await tx.teamsClass.update({ where: { id: row.id }, data: { selected, classId } });
    }
  });

  return { ok: true, value: { selected: wanted.size } };
}

export interface TeamsSyncSummary {
  created: number;
  updated: number;
  completed: number;
  removed: number;
  skippedNoDueDate: number;
}

function isOpen(assignment: GraphAssignment): boolean {
  return !assignment.status || OPEN_STATUSES.has(assignment.status);
}

function isSubmitted(assignment: GraphAssignment): boolean {
  for (const submission of assignment.submissions ?? []) {
    if (submission.status && DONE_SUBMISSIONS.has(submission.status)) {
      return true;
    }
  }
  return false;
}

/** Reads the due date, or returns null if it's missing or unreadable. */
function dueDateOf(assignment: GraphAssignment): Date | null {
  if (!assignment.dueDateTime) {
    return null;
  }
  const dueAt = new Date(assignment.dueDateTime);
  if (Number.isNaN(dueAt.getTime())) {
    return null;
  }
  return dueAt;
}

export async function runTeamsSync(userId: string, deps: TeamsDeps = {}): Promise<TeamsResult<TeamsSyncSummary>> {
  const now = deps.now ? deps.now() : new Date();

  // One sync at a time per student. A lock older than SYNC_LOCK_MS counts as stale.
  const staleBefore = new Date(now.getTime() - SYNC_LOCK_MS);
  const lock = await db.teamsConnection.updateMany({
    where: { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: staleBefore } }] },
    data: { syncStartedAt: now },
  });
  if (lock.count === 0) {
    const exists = await db.teamsConnection.findUnique({ where: { userId }, select: { id: true } });
    if (exists) {
      return { ok: false, error: "A sync is already running. Give it a minute." };
    }
    return { ok: false, error: "Teams isn't connected." };
  }

  try {
    const connection = await db.teamsConnection.findUniqueOrThrow({
      where: { userId },
      select: {
        id: true,
        classes: { where: { selected: true, classId: { not: null } }, select: { teamsClassId: true, classId: true } },
      },
    });
    if (connection.classes.length === 0) {
      return { ok: false, error: "Choose at least one class to sync.", code: "NO_CLASSES" };
    }

    // Teams class id -> Rushd class id (never null because of the query above).
    const rushdClassIdFor = new Map<string, string>();
    for (const teamsClass of connection.classes) {
      rushdClassIdFor.set(teamsClass.teamsClassId, teamsClass.classId!);
    }

    const allAssignments = await withAccessToken(userId, deps, (token) => listAssignments(token, deps.fetchImpl));
    const relevant = allAssignments.filter((assignment) => {
      return rushdClassIdFor.has(assignment.classId) && isOpen(assignment);
    });

    const existing = await db.assignment.findMany({
      where: { userId, source: "TEAMS", teamsClassId: { in: [...rushdClassIdFor.keys()] } },
      select: { id: true, teamsAssignmentId: true, status: true, estimatedByRushd: true },
    });
    const existingByTeamsId = new Map(existing.map((row) => [row.teamsAssignmentId, row]));

    const summary: TeamsSyncSummary = { created: 0, updated: 0, completed: 0, removed: 0, skippedNoDueDate: 0 };
    const seenIds = new Set<string>();

    for (const assignment of relevant) {
      const dueAt = dueDateOf(assignment);
      if (!dueAt) {
        summary.skippedNoDueDate++;
        continue;
      }
      seenIds.add(assignment.id);
      const done = isSubmitted(assignment);

      const sharedFields = {
        title: (assignment.displayName ?? "Untitled assignment").slice(0, 200),
        dueAt,
        canvasUrl: safeTeamsUrl(assignment.webUrl),
        pointsPossible: assignment.grading?.maxPoints ?? null,
        canvasSyncedAt: now,
        canvasRemovedAt: null,
      };

      const row = existingByTeamsId.get(assignment.id);
      if (!row) {
        const completedFields = done ? { status: "COMPLETED" as const, completedAt: now } : {};
        await db.assignment.create({
          data: {
            ...sharedFields,
            userId,
            classId: rushdClassIdFor.get(assignment.classId)!,
            source: "TEAMS",
            teamsAssignmentId: assignment.id,
            teamsClassId: assignment.classId,
            estimatedMinutes: DEFAULT_MINUTES,
            estimatedByRushd: true,
            ...completedFields,
          },
        });
        summary.created++;
        if (done) {
          summary.completed++;
        }
      } else {
        // Only mark done once; if the student already completed it, leave it alone.
        const markDone = done && row.status !== "COMPLETED";
        const completedFields = markDone ? { status: "COMPLETED" as const, completedAt: now } : {};
        await db.assignment.update({
          where: { id: row.id },
          data: { ...sharedFields, ...completedFields },
        });
        summary.updated++;
        if (markDone) {
          summary.completed++;
        }
      }
    }

    // Gone from Teams (deleted or unpublished): keep the row, but take it out of the plan.
    const removedIds: string[] = [];
    for (const row of existing) {
      if (row.teamsAssignmentId && !seenIds.has(row.teamsAssignmentId)) {
        removedIds.push(row.id);
      }
    }
    if (removedIds.length > 0) {
      const result = await db.assignment.updateMany({
        where: { id: { in: removedIds }, userId, canvasRemovedAt: null },
        data: { canvasRemovedAt: now },
      });
      summary.removed = result.count;
    }

    await db.teamsConnection.update({ where: { userId }, data: { lastSyncAt: now, lastSyncError: null, status: "ACTIVE" } });
    return { ok: true, value: summary };
  } catch (error) {
    const result = fail(error);
    await db.teamsConnection.updateMany({ where: { userId }, data: { lastSyncError: result.error.slice(0, 300) } });
    return result;
  } finally {
    // Always release the sync lock.
    await db.teamsConnection.updateMany({ where: { userId }, data: { syncStartedAt: null } });
  }
}

/** Deletes the saved token. Imported assignments are deleted, or kept as
 * normal manual assignments, as the student chooses. */
export async function disconnectTeams(userId: string, removeAssignments: boolean): Promise<TeamsResult<{ removed: number }>> {
  const removed = await db.$transaction(async (tx) => {
    let count = 0;
    if (removeAssignments) {
      const deleted = await tx.assignment.deleteMany({ where: { userId, source: "TEAMS" } });
      count = deleted.count;
    } else {
      await tx.assignment.updateMany({
        where: { userId, source: "TEAMS" },
        data: {
          source: "MANUAL",
          teamsAssignmentId: null,
          teamsClassId: null,
          canvasUrl: null,
          canvasSyncedAt: null,
          canvasRemovedAt: null,
        },
      });
    }
    await tx.teamsConnection.deleteMany({ where: { userId } });
    return count;
  });
  return { ok: true, value: { removed } };
}
