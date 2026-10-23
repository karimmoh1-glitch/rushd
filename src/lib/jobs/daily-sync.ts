import "server-only";
import { db } from "@/lib/db";
import { runCanvasSync } from "@/lib/canvas/service";
import { runTeamsSync } from "@/lib/teams/service";
import { runFeedSync } from "@/lib/feed/service";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

// Once a day, re-sync every connected source so plans stay current even if a
// student never presses "Sync". Stalest connections go first; the run stops at
// its time budget and the rest go first tomorrow. One student's failure never
// stops the others.

const STALE_MS = 20 * 60 * 60 * 1000;
const BATCH = 200;
/** Longest a single sync may run before it is abandoned. */
const MAX_JOB_MS = 30_000;

export interface DailySyncReport {
  canvas: number;
  teams: number;
  feeds: number;
  failed: number;
  plans: number;
  outOfTime: boolean;
}

type SyncJob = { kind: "canvas" | "teams" | "feeds"; userId: string; run: () => Promise<{ ok: boolean }> };

/** Runs a job, but gives up (counting it as failed) after `ms`, so a hanging sync can't use up the budget. */
function runWithTimeout(run: () => Promise<{ ok: boolean }>, ms: number): Promise<{ ok: boolean }> {
  const job = run();
  const timeout = new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: false }), ms));
  return Promise.race([job, timeout]);
}

export async function runDailySync(budgetMs: number, now = new Date()): Promise<DailySyncReport> {
  const deadline = Date.now() + budgetMs;
  const stale = new Date(now.getTime() - STALE_MS);
  const staleOrNever = { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: stale } }] };
  const stalestFirst = { lastSyncAt: { sort: "asc" as const, nulls: "first" as const } };
  const [canvas, teams, feeds] = await Promise.all([
    db.canvasConnection.findMany({
      where: { status: { in: ["ACTIVE", "ERROR"] }, courses: { some: { selected: true } }, ...staleOrNever },
      orderBy: stalestFirst,
      select: { userId: true },
      take: BATCH,
    }),
    db.teamsConnection.findMany({
      where: { status: "ACTIVE", classes: { some: { selected: true } }, ...staleOrNever },
      orderBy: stalestFirst,
      select: { userId: true },
      take: BATCH,
    }),
    db.calendarFeed.findMany({
      where: staleOrNever,
      orderBy: stalestFirst,
      select: { userId: true },
      take: BATCH,
    }),
  ]);

  const jobs: SyncJob[] = [];
  for (const c of canvas) jobs.push({ kind: "canvas", userId: c.userId, run: () => runCanvasSync(c.userId, { dryRun: false }) });
  for (const t of teams) jobs.push({ kind: "teams", userId: t.userId, run: () => runTeamsSync(t.userId) });
  for (const f of feeds) jobs.push({ kind: "feeds", userId: f.userId, run: () => runFeedSync(f.userId) });

  const report: DailySyncReport = { canvas: 0, teams: 0, feeds: 0, failed: 0, plans: 0, outOfTime: false };
  const syncedUserIds = new Set<string>();

  for (const job of jobs) {
    if (Date.now() > deadline) {
      report.outOfTime = true;
      break;
    }
    try {
      const remaining = Math.max(1_000, deadline - Date.now());
      const result = await runWithTimeout(job.run, Math.min(remaining, MAX_JOB_MS));
      if (result.ok) {
        report[job.kind]++;
        syncedUserIds.add(job.userId);
      } else {
        report.failed++;
      }
    } catch {
      report.failed++;
    }
  }

  // Rebuild the plan of everyone whose data changed.
  for (const userId of syncedUserIds) {
    if (Date.now() > deadline) {
      report.outOfTime = true;
      break;
    }
    await regeneratePlanSnapshot(userId, "sync");
    report.plans++;
  }
  return report;
}
