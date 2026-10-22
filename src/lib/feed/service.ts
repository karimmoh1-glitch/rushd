import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { CANVAS_CLASS_COLORS } from "@/lib/canvas/colors";
import { decryptToken, encryptToken, isVaultConfigured, VaultError } from "@/lib/canvas/token-vault";
import { resolveTimeZone } from "@/lib/time/zone";
import { parseCanvasFeed, parseFeedUrl, type FeedAssignment } from "./ics";
import { FeedError, fetchFeedText, type FetchFeedText } from "./fetch-feed";

// Canvas through the calendar feed: for schools that turn off access tokens.
// Read-only and scoped to the session's userId. The feed only says what's due,
// not whether it was submitted, so completion stays the student's to mark.

export interface FeedDeps {
  fetchText?: FetchFeedText;
  now?: () => Date;
}

export type FeedResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export interface FeedSyncSummary {
  created: number;
  updated: number;
  removed: number;
}

const DEFAULT_MINUTES = 45;
const SYNC_LOCK_MS = 2 * 60 * 1000;
const PAST_WINDOW_MS = 14 * 86_400_000;

function fail(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof FeedError) return { ok: false, error: error.message, code: error.code };
  if (error instanceof VaultError) return { ok: false, error: "Calendar import isn't available on this server yet.", code: error.code };
  console.error("[feed] unexpected error", (error as Error)?.name ?? typeof error);
  return { ok: false, error: "Something went wrong reading that calendar. Try again." };
}

export function feedAvailable(): boolean {
  return isVaultConfigured();
}

/** Links back to the assignment, only on the feed's own host. */
function safeLink(url: string | null, host: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === host ? u.toString() : null;
  } catch {
    return null;
  }
}

async function timeZoneOf(userId: string): Promise<string> {
  const profile = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return resolveTimeZone(profile?.timezone);
}

export async function connectFeed(userId: string, rawUrl: string, deps: FeedDeps = {}): Promise<FeedResult<FeedSyncSummary>> {
  const url = parseFeedUrl(rawUrl);
  if (!url) {
    return { ok: false, error: "That isn't a Canvas calendar feed link. It ends in .ics and is under Calendar → Calendar Feed.", code: "BAD_URL" };
  }
  const now = (deps.now ?? (() => new Date()))();
  let locked = false;
  try {
    const text = await (deps.fetchText ?? fetchFeedText)(url);
    const items = parseCanvasFeed(text, await timeZoneOf(userId));
    // Hold the same lock as a sync, so a connect can't interleave with one.
    const data = { encryptedUrl: encryptToken(userId, url.toString()), host: url.hostname, status: "ACTIVE", lastSyncError: null, syncStartedAt: now };
    const updated = await db.calendarFeed.updateMany({
      where: { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - SYNC_LOCK_MS) } }] },
      data,
    });
    if (updated.count === 0) {
      if (await db.calendarFeed.findUnique({ where: { userId }, select: { id: true } })) {
        return { ok: false, error: "A sync is already running. Try again in a minute.", code: "IN_PROGRESS" };
      }
      try {
        await db.calendarFeed.create({ data: { userId, ...data } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return { ok: false, error: "A sync is already running. Try again in a minute.", code: "IN_PROGRESS" };
        }
        throw error;
      }
    }
    locked = true;
    return { ok: true, value: await applyFeed(userId, url.hostname, items, now) };
  } catch (error) {
    if (locked) await db.calendarFeed.update({ where: { userId }, data: { syncStartedAt: null } }).catch(() => {});
    return fail(error);
  }
}

export async function runFeedSync(userId: string, deps: FeedDeps = {}): Promise<FeedResult<FeedSyncSummary>> {
  const now = (deps.now ?? (() => new Date()))();
  const feed = await db.calendarFeed.findUnique({ where: { userId } });
  if (!feed) return { ok: false, error: "No calendar feed is connected.", code: "NOT_CONNECTED" };
  // One sync at a time per student.
  const locked = await db.calendarFeed.updateMany({
    where: { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - SYNC_LOCK_MS) } }] },
    data: { syncStartedAt: now },
  });
  if (locked.count === 0) return { ok: false, error: "A sync is already running.", code: "IN_PROGRESS" };
  try {
    const url = parseFeedUrl(decryptToken(userId, feed.encryptedUrl));
    if (!url) throw new FeedError("UNSAFE_URL", "The saved feed link is no longer valid. Connect it again.");
    const text = await (deps.fetchText ?? fetchFeedText)(url);
    const summary = await applyFeed(userId, url.hostname, parseCanvasFeed(text, await timeZoneOf(userId)), now);
    return { ok: true, value: summary };
  } catch (error) {
    const result = fail(error);
    await db.calendarFeed.update({ where: { userId }, data: { status: "ERROR", lastSyncError: result.error, syncStartedAt: null } });
    return result;
  }
}

async function applyFeed(userId: string, host: string, items: FeedAssignment[], now: Date): Promise<FeedSyncSummary> {
  const cutoff = new Date(now.getTime() - PAST_WINDOW_MS);
  const existing = await db.assignment.findMany({
    where: { userId, source: "CALENDAR" },
    select: { id: true, feedUid: true, status: true, dueAt: true, canvasRemovedAt: true },
  });
  const byUid = new Map(existing.map((a) => [a.feedUid, a]));

  const classes = await db.class.findMany({ where: { userId, archived: false }, select: { id: true, name: true } });
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  let colorIndex = classes.length;
  async function classFor(name: string): Promise<string> {
    const key = name.toLowerCase();
    const found = classByName.get(key);
    if (found) return found;
    const created = await db.class.create({
      data: { userId, name, color: CANVAS_CLASS_COLORS[colorIndex++ % CANVAS_CLASS_COLORS.length] },
      select: { id: true },
    });
    classByName.set(key, created.id);
    return created.id;
  }

  const summary: FeedSyncSummary = { created: 0, updated: 0, removed: 0 };
  const seen = new Set<string>();
  for (const item of items) {
    seen.add(item.uid);
    const link = safeLink(item.url, host);
    const prior = byUid.get(item.uid);
    if (prior) {
      await db.assignment.update({
        where: { id: prior.id },
        data: { title: item.title, dueAt: item.dueAt, canvasUrl: link, canvasSyncedAt: now, canvasRemovedAt: null },
      });
      summary.updated++;
    } else if (item.dueAt >= cutoff) {
      // (userId, feedUid) is unique: a row another sync just created is left alone.
      const r = await db.assignment.createMany({
        skipDuplicates: true,
        data: [
          {
            userId,
            classId: await classFor(item.courseName ?? "Canvas"),
            title: item.title,
            dueAt: item.dueAt,
            estimatedMinutes: DEFAULT_MINUTES,
            estimatedByRushd: true,
            source: "CALENDAR",
            feedUid: item.uid,
            canvasUrl: link,
            canvasSyncedAt: now,
          },
        ],
      });
      summary.created += r.count;
    }
  }

  const gone = existing.filter((a) => a.feedUid && !seen.has(a.feedUid) && !a.canvasRemovedAt && a.status !== "COMPLETED");
  if (gone.length) {
    await db.assignment.updateMany({ where: { id: { in: gone.map((a) => a.id) }, userId }, data: { canvasRemovedAt: now } });
    summary.removed = gone.length;
  }

  await db.calendarFeed.update({
    where: { userId },
    data: { status: "ACTIVE", lastSyncAt: now, lastSyncError: null, syncStartedAt: null },
  });
  return summary;
}

export async function disconnectFeed(userId: string, removeAssignments: boolean): Promise<FeedResult<{ removed: number }>> {
  const removed = await db.$transaction(async (tx) => {
    let count = 0;
    if (removeAssignments) {
      count = (await tx.assignment.deleteMany({ where: { userId, source: "CALENDAR" } })).count;
    } else {
      await tx.assignment.updateMany({
        where: { userId, source: "CALENDAR" },
        data: { source: "MANUAL", feedUid: null, canvasUrl: null, canvasSyncedAt: null },
      });
    }
    await tx.calendarFeed.deleteMany({ where: { userId } });
    return count;
  });
  return { ok: true, value: { removed } };
}
