import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { CANVAS_CLASS_COLORS } from "@/lib/canvas/colors";
import { decryptToken, encryptToken, isVaultConfigured, VaultError } from "@/lib/canvas/token-vault";
import { resolveTimeZone } from "@/lib/time/zone";
import { parseCanvasFeed, parseFeedUrl, type FeedAssignment } from "./ics";
import { FeedError, fetchFeedText, type FetchFeedText } from "./fetch-feed";

// Canvas through the calendar feed, for schools that turn off access tokens.
// Read-only, and every query is scoped to the session's userId. The feed only
// says what's due (not what was submitted), so the student marks work done.

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
const PAST_WINDOW_MS = 14 * 86_400_000; // don't import work due more than 2 weeks ago

/** Turns any error into a friendly failure result. */
function fail(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof FeedError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof VaultError) {
    return { ok: false, error: "Calendar import isn't available on this server yet.", code: error.code };
  }
  // Only log the error's type, never the object.
  console.error("[feed] unexpected error", (error as Error)?.name ?? typeof error);
  return { ok: false, error: "Something went wrong reading that calendar. Try again." };
}

export function feedAvailable(): boolean {
  return isVaultConfigured();
}

/** Keeps a link back to the assignment only if it's https on the feed's own host. */
function safeLink(url: string | null, host: string): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname === host) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

async function timeZoneOf(userId: string): Promise<string> {
  const profile = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return resolveTimeZone(profile?.timezone);
}

/** Matches this user's feed when nobody holds the sync lock (or the lock is stale). */
function unlockedFeedFilter(userId: string, now: Date) {
  const staleBefore = new Date(now.getTime() - SYNC_LOCK_MS);
  return { userId, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: staleBefore } }] };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function connectFeed(userId: string, rawUrl: string, deps: FeedDeps = {}): Promise<FeedResult<FeedSyncSummary>> {
  const url = parseFeedUrl(rawUrl);
  if (!url) {
    return { ok: false, error: "That isn't a Canvas calendar feed link. It ends in .ics and is under Calendar → Calendar Feed.", code: "BAD_URL" };
  }
  const now = deps.now ? deps.now() : new Date();
  const fetchText = deps.fetchText ?? fetchFeedText;
  let locked = false;

  try {
    const text = await fetchText(url);
    const items = parseCanvasFeed(text, await timeZoneOf(userId));

    // Saving the feed also takes the sync lock, so a connect can't overlap a sync.
    // Security: the feed URL contains a private token, so it's stored encrypted.
    const data = {
      encryptedUrl: encryptToken(userId, url.toString()),
      host: url.hostname,
      status: "ACTIVE",
      lastSyncError: null,
      syncStartedAt: now,
    };
    const updated = await db.calendarFeed.updateMany({ where: unlockedFeedFilter(userId, now), data });

    if (updated.count === 0) {
      // Nothing updated: either a sync holds the lock, or there's no feed yet.
      const existing = await db.calendarFeed.findUnique({ where: { userId }, select: { id: true } });
      if (existing) {
        return { ok: false, error: "A sync is already running. Try again in a minute.", code: "IN_PROGRESS" };
      }
      try {
        await db.calendarFeed.create({ data: { userId, ...data } });
      } catch (error) {
        // Another request created the feed at the same moment.
        if (isUniqueConflict(error)) {
          return { ok: false, error: "A sync is already running. Try again in a minute.", code: "IN_PROGRESS" };
        }
        throw error;
      }
    }

    locked = true;
    const summary = await applyFeed(userId, url.hostname, items, now);
    return { ok: true, value: summary };
  } catch (error) {
    if (locked) {
      await db.calendarFeed.update({ where: { userId }, data: { syncStartedAt: null } }).catch(() => {});
    }
    return fail(error);
  }
}

export async function runFeedSync(userId: string, deps: FeedDeps = {}): Promise<FeedResult<FeedSyncSummary>> {
  const now = deps.now ? deps.now() : new Date();
  const fetchText = deps.fetchText ?? fetchFeedText;

  const feed = await db.calendarFeed.findUnique({ where: { userId } });
  if (!feed) {
    return { ok: false, error: "No calendar feed is connected.", code: "NOT_CONNECTED" };
  }

  // One sync at a time per student.
  const lock = await db.calendarFeed.updateMany({
    where: unlockedFeedFilter(userId, now),
    data: { syncStartedAt: now },
  });
  if (lock.count === 0) {
    return { ok: false, error: "A sync is already running.", code: "IN_PROGRESS" };
  }

  try {
    // The saved link is checked again before every use.
    const url = parseFeedUrl(decryptToken(userId, feed.encryptedUrl));
    if (!url) {
      throw new FeedError("UNSAFE_URL", "The saved feed link is no longer valid. Connect it again.");
    }
    const text = await fetchText(url);
    const items = parseCanvasFeed(text, await timeZoneOf(userId));
    const summary = await applyFeed(userId, url.hostname, items, now);
    return { ok: true, value: summary };
  } catch (error) {
    const result = fail(error);
    await db.calendarFeed.update({
      where: { userId },
      data: { status: "ERROR", lastSyncError: result.error, syncStartedAt: null },
    });
    return result;
  }
}

/** Saves the feed's assignments: updates known ones, adds new ones, and marks missing ones removed. */
async function applyFeed(userId: string, host: string, items: FeedAssignment[], now: Date): Promise<FeedSyncSummary> {
  const cutoff = new Date(now.getTime() - PAST_WINDOW_MS);

  const existing = await db.assignment.findMany({
    where: { userId, source: "CALENDAR" },
    select: { id: true, feedUid: true, status: true, dueAt: true, canvasRemovedAt: true },
  });
  const existingByUid = new Map(existing.map((assignment) => [assignment.feedUid, assignment]));

  // Find a class by name, or create one with the next color.
  const classes = await db.class.findMany({ where: { userId, archived: false }, select: { id: true, name: true } });
  const classIdByName = new Map(classes.map((cls) => [cls.name.toLowerCase(), cls.id]));
  let colorIndex = classes.length;

  async function classIdFor(name: string): Promise<string> {
    const key = name.toLowerCase();
    const found = classIdByName.get(key);
    if (found) {
      return found;
    }
    const color = CANVAS_CLASS_COLORS[colorIndex % CANVAS_CLASS_COLORS.length];
    colorIndex++;
    const created = await db.class.create({
      data: { userId, name, color },
      select: { id: true },
    });
    classIdByName.set(key, created.id);
    return created.id;
  }

  const summary: FeedSyncSummary = { created: 0, updated: 0, removed: 0 };
  const seenUids = new Set<string>();

  for (const item of items) {
    seenUids.add(item.uid);
    const link = safeLink(item.url, host);
    const prior = existingByUid.get(item.uid);

    if (prior) {
      await db.assignment.update({
        where: { id: prior.id },
        data: { title: item.title, dueAt: item.dueAt, canvasUrl: link, canvasSyncedAt: now, canvasRemovedAt: null },
      });
      summary.updated++;
    } else if (item.dueAt >= cutoff) {
      // (userId, feedUid) is unique, so a row another sync just created is left alone.
      const result = await db.assignment.createMany({
        skipDuplicates: true,
        data: [
          {
            userId,
            classId: await classIdFor(item.courseName ?? "Canvas"),
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
      summary.created += result.count;
    }
  }

  // Gone from the feed: keep the row, but take it out of the plan (unless it's already done).
  const goneIds: string[] = [];
  for (const assignment of existing) {
    const isGone = assignment.feedUid && !seenUids.has(assignment.feedUid);
    if (isGone && !assignment.canvasRemovedAt && assignment.status !== "COMPLETED") {
      goneIds.push(assignment.id);
    }
  }
  if (goneIds.length > 0) {
    await db.assignment.updateMany({ where: { id: { in: goneIds }, userId }, data: { canvasRemovedAt: now } });
    summary.removed = goneIds.length;
  }

  await db.calendarFeed.update({
    where: { userId },
    data: { status: "ACTIVE", lastSyncAt: now, lastSyncError: null, syncStartedAt: null },
  });
  return summary;
}

/** Deletes the feed. Imported assignments are deleted, or kept as normal manual ones. */
export async function disconnectFeed(userId: string, removeAssignments: boolean): Promise<FeedResult<{ removed: number }>> {
  const removed = await db.$transaction(async (tx) => {
    let count = 0;
    if (removeAssignments) {
      const deleted = await tx.assignment.deleteMany({ where: { userId, source: "CALENDAR" } });
      count = deleted.count;
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
