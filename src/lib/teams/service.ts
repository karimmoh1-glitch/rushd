import "server-only";
import { db } from "@/lib/db";
import { CANVAS_CLASS_COLORS } from "@/lib/canvas/colors";
import { decryptToken, encryptToken, isVaultConfigured, VaultError } from "@/lib/canvas/token-vault";
import { exchangeCode, refreshTokens, TeamsAuthError, teamsConfigured } from "./oauth";
import { GraphError, getMe, listAssignments, listClasses, type GraphAssignment } from "./graph";

// Microsoft Teams for Education, read-only. Every function takes the userId
// from its caller (the session) and scopes every query to it. The refresh
// token is stored only as user-bound ciphertext and never returned or logged.
// Microsoft rotates refresh tokens, so each use stores the newest one.

export interface TeamsDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export type TeamsResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

const DEFAULT_MINUTES = 45;
const SYNC_LOCK_MS = 2 * 60 * 1000;
const OPEN_STATUSES = new Set(["assigned", "published"]);
const DONE_SUBMISSIONS = new Set(["submitted", "returned"]);

function fail(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof TeamsAuthError || error instanceof GraphError) return { ok: false, error: error.message, code: error.code };
  if (error instanceof VaultError) return { ok: false, error: "Teams integration isn't available on this server yet.", code: error.code };
  console.error("[teams] unexpected error", (error as Error)?.name ?? typeof error);
  return { ok: false, error: "Something went wrong talking to Microsoft Teams. Try again." };
}

function safeTeamsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "teams.microsoft.com" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function teamsAvailable(): boolean {
  return teamsConfigured() && isVaultConfigured();
}

/** Completes the OAuth flow: stores the refresh token and the class list. */
export async function connectTeams(
  userId: string,
  code: string,
  verifier: string,
  deps: TeamsDeps = {},
): Promise<TeamsResult<{ accountName: string | null; classCount: number }>> {
  try {
    const tokens = await exchangeCode(code, verifier, deps.fetchImpl);
    if (!tokens.refresh_token) return { ok: false, error: "Microsoft didn't grant offline access. Try connecting again." };
    const me = await getMe(tokens.access_token, deps.fetchImpl);
    const classes = await listClasses(tokens.access_token, deps.fetchImpl);
    await db.$transaction(async (tx) => {
      const conn = await tx.teamsConnection.upsert({
        where: { userId },
        update: { encryptedRefreshToken: encryptToken(userId, tokens.refresh_token!), accountName: me.name, status: "ACTIVE", lastSyncError: null },
        create: { userId, encryptedRefreshToken: encryptToken(userId, tokens.refresh_token!), accountName: me.name },
        select: { id: true },
      });
      for (const c of classes) {
        await tx.teamsClass.upsert({
          where: { connectionId_teamsClassId: { connectionId: conn.id, teamsClassId: c.id } },
          update: { name: (c.displayName ?? "Untitled class").slice(0, 120) },
          create: { connectionId: conn.id, teamsClassId: c.id, name: (c.displayName ?? "Untitled class").slice(0, 120) },
        });
      }
    });
    return { ok: true, value: { accountName: me.name, classCount: classes.length } };
  } catch (error) {
    return fail(error);
  }
}

/** Runs `fn` with a fresh access token, rotating the stored refresh token. */
async function withAccessToken<T>(userId: string, deps: TeamsDeps, fn: (token: string) => Promise<T>): Promise<T> {
  const conn = await db.teamsConnection.findUnique({ where: { userId }, select: { encryptedRefreshToken: true } });
  if (!conn) throw new GraphError("Teams isn't connected.", "UNAUTHORIZED");
  let tokens;
  try {
    tokens = await refreshTokens(decryptToken(userId, conn.encryptedRefreshToken), deps.fetchImpl);
  } catch (error) {
    if (error instanceof TeamsAuthError && error.code === "INVALID_GRANT") {
      await db.teamsConnection.update({ where: { userId }, data: { status: "NEEDS_REAUTH" } });
    }
    throw error;
  }
  if (tokens.refresh_token) {
    await db.teamsConnection.update({ where: { userId }, data: { encryptedRefreshToken: encryptToken(userId, tokens.refresh_token), status: "ACTIVE" } });
  }
  try {
    return await fn(tokens.access_token);
  } catch (error) {
    if (error instanceof GraphError && error.code === "UNAUTHORIZED") {
      await db.teamsConnection.update({ where: { userId }, data: { status: "NEEDS_REAUTH" } });
    }
    throw error;
  }
}

export async function refreshTeamsClasses(userId: string, deps: TeamsDeps = {}): Promise<TeamsResult<{ classCount: number }>> {
  try {
    const classes = await withAccessToken(userId, deps, (t) => listClasses(t, deps.fetchImpl));
    const conn = await db.teamsConnection.findUniqueOrThrow({ where: { userId }, select: { id: true } });
    for (const c of classes) {
      await db.teamsClass.upsert({
        where: { connectionId_teamsClassId: { connectionId: conn.id, teamsClassId: c.id } },
        update: { name: (c.displayName ?? "Untitled class").slice(0, 120) },
        create: { connectionId: conn.id, teamsClassId: c.id, name: (c.displayName ?? "Untitled class").slice(0, 120) },
      });
    }
    return { ok: true, value: { classCount: classes.length } };
  } catch (error) {
    return fail(error);
  }
}

/** Chooses which Teams classes sync; each gets (or reuses) a Rushd course. */
export async function setSelectedTeamsClasses(userId: string, rowIds: string[]): Promise<TeamsResult<{ selected: number }>> {
  const conn = await db.teamsConnection.findUnique({ where: { userId }, select: { id: true } });
  if (!conn) return { ok: false, error: "Teams isn't connected." };
  const wanted = new Set(rowIds.slice(0, 50));
  await db.$transaction(async (tx) => {
    const rows = await tx.teamsClass.findMany({ where: { connectionId: conn.id }, select: { id: true, name: true, classId: true } });
    const existing = await tx.class.findMany({ where: { userId }, select: { id: true, name: true, archived: true } });
    const byName = new Map(existing.filter((c) => !c.archived).map((c) => [c.name.trim().toLowerCase(), c.id]));
    let colorIndex = existing.length;
    for (const row of rows) {
      const selected = wanted.has(row.id);
      let classId = row.classId;
      if (selected && !classId) {
        classId = byName.get(row.name.trim().toLowerCase()) ?? null;
        if (!classId) {
          const created = await tx.class.create({
            data: { userId, name: row.name.slice(0, 80), color: CANVAS_CLASS_COLORS[colorIndex++ % CANVAS_CLASS_COLORS.length] },
            select: { id: true },
          });
          classId = created.id;
          byName.set(row.name.trim().toLowerCase(), created.id);
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

function isOpen(a: GraphAssignment): boolean {
  return !a.status || OPEN_STATUSES.has(a.status);
}

function submitted(a: GraphAssignment): boolean {
  return (a.submissions ?? []).some((s) => s.status && DONE_SUBMISSIONS.has(s.status));
}

export async function runTeamsSync(userId: string, deps: TeamsDeps = {}): Promise<TeamsResult<TeamsSyncSummary>> {
  const now = (deps.now ?? (() => new Date()))();
  const lock = await db.teamsConnection.updateMany({
    where: { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - SYNC_LOCK_MS) } }] },
    data: { syncStartedAt: now },
  });
  if (lock.count === 0) {
    const exists = await db.teamsConnection.findUnique({ where: { userId }, select: { id: true } });
    return { ok: false, error: exists ? "A sync is already running. Give it a minute." : "Teams isn't connected." };
  }
  try {
    const conn = await db.teamsConnection.findUniqueOrThrow({
      where: { userId },
      select: { id: true, classes: { where: { selected: true, classId: { not: null } }, select: { teamsClassId: true, classId: true } } },
    });
    if (conn.classes.length === 0) return { ok: false, error: "Choose at least one class to sync.", code: "NO_CLASSES" };
    const classFor = new Map(conn.classes.map((c) => [c.teamsClassId, c.classId!]));

    const assignments = await withAccessToken(userId, deps, (t) => listAssignments(t, deps.fetchImpl));
    const relevant = assignments.filter((a) => classFor.has(a.classId) && isOpen(a));
    const existing = await db.assignment.findMany({
      where: { userId, source: "TEAMS", teamsClassId: { in: [...classFor.keys()] } },
      select: { id: true, teamsAssignmentId: true, status: true, estimatedByRushd: true },
    });
    const byTeamsId = new Map(existing.map((e) => [e.teamsAssignmentId, e]));
    const summary: TeamsSyncSummary = { created: 0, updated: 0, completed: 0, removed: 0, skippedNoDueDate: 0 };
    const seen = new Set<string>();

    for (const a of relevant) {
      if (!a.dueDateTime) {
        summary.skippedNoDueDate++;
        continue;
      }
      const dueAt = new Date(a.dueDateTime);
      if (Number.isNaN(dueAt.getTime())) {
        summary.skippedNoDueDate++;
        continue;
      }
      seen.add(a.id);
      const done = submitted(a);
      const base = {
        title: (a.displayName ?? "Untitled assignment").slice(0, 200),
        dueAt,
        canvasUrl: safeTeamsUrl(a.webUrl),
        pointsPossible: a.grading?.maxPoints ?? null,
        canvasSyncedAt: now,
        canvasRemovedAt: null,
      };
      const row = byTeamsId.get(a.id);
      if (!row) {
        await db.assignment.create({
          data: {
            ...base,
            userId,
            classId: classFor.get(a.classId)!,
            source: "TEAMS",
            teamsAssignmentId: a.id,
            teamsClassId: a.classId,
            estimatedMinutes: DEFAULT_MINUTES,
            estimatedByRushd: true,
            ...(done ? { status: "COMPLETED", completedAt: now } : {}),
          },
        });
        summary.created++;
        if (done) summary.completed++;
      } else {
        const markDone = done && row.status !== "COMPLETED";
        await db.assignment.update({
          where: { id: row.id },
          data: { ...base, ...(markDone ? { status: "COMPLETED", completedAt: now } : {}) },
        });
        summary.updated++;
        if (markDone) summary.completed++;
      }
    }

    // Gone from Teams (deleted or unpublished): keep the row, drop it from planning.
    const removed = existing.filter((e) => e.teamsAssignmentId && !seen.has(e.teamsAssignmentId)).map((e) => e.id);
    if (removed.length) {
      const r = await db.assignment.updateMany({ where: { id: { in: removed }, userId, canvasRemovedAt: null }, data: { canvasRemovedAt: now } });
      summary.removed = r.count;
    }
    await db.teamsConnection.update({ where: { userId }, data: { lastSyncAt: now, lastSyncError: null, status: "ACTIVE" } });
    return { ok: true, value: summary };
  } catch (error) {
    const result = fail(error);
    await db.teamsConnection.updateMany({ where: { userId }, data: { lastSyncError: result.error.slice(0, 300) } });
    return result;
  } finally {
    await db.teamsConnection.updateMany({ where: { userId }, data: { syncStartedAt: null } });
  }
}

/** Deletes the stored token. Imported assignments are removed or kept as the
 * student chooses; kept ones become ordinary (manual) assignments. */
export async function disconnectTeams(userId: string, removeAssignments: boolean): Promise<TeamsResult<{ removed: number }>> {
  const removed = await db.$transaction(async (tx) => {
    let count = 0;
    if (removeAssignments) {
      count = (await tx.assignment.deleteMany({ where: { userId, source: "TEAMS" } })).count;
    } else {
      await tx.assignment.updateMany({
        where: { userId, source: "TEAMS" },
        data: { source: "MANUAL", teamsAssignmentId: null, teamsClassId: null, canvasUrl: null, canvasSyncedAt: null, canvasRemovedAt: null },
      });
    }
    await tx.teamsConnection.deleteMany({ where: { userId } });
    return count;
  });
  return { ok: true, value: { removed } };
}
