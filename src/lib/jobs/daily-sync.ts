import "server-only";
import { db } from "@/lib/db";
import { runCanvasSync } from "@/lib/canvas/service";
import { runTeamsSync } from "@/lib/teams/service";
import { runFeedSync } from "@/lib/feed/service";
import { regeneratePlanSnapshot } from "@/server/actions/plans";

// Once a day, re-read every connected source so a student's plan is current
// even if they never press "Sync". Stalest connections go first and the run
// stops at its time budget; whatever is left is first in line tomorrow (or
// whenever the student opens the app and syncs). One student's failure never
// stops the others; failures are recorded on the connection as usual.

const STALE_MS = 20 * 60 * 60 * 1000;
const BATCH = 200;

export interface DailySyncReport {
  canvas: number;
  teams: number;
  feeds: number;
  failed: number;
  plans: number;
  outOfTime: boolean;
}

export async function runDailySync(budgetMs: number, now = new Date()): Promise<DailySyncReport> {
  const deadline = Date.now() + budgetMs;
  const stale = new Date(now.getTime() - STALE_MS);
  const staleOrNever = { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: stale } }] };
  const [canvas, teams, feeds] = await Promise.all([
    db.canvasConnection.findMany({
      where: { status: { in: ["ACTIVE", "ERROR"] }, courses: { some: { selected: true } }, ...staleOrNever },
      orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
      select: { userId: true },
      take: BATCH,
    }),
    db.teamsConnection.findMany({
      where: { status: "ACTIVE", classes: { some: { selected: true } }, ...staleOrNever },
      orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
      select: { userId: true },
      take: BATCH,
    }),
    db.calendarFeed.findMany({
      where: staleOrNever,
      orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
      select: { userId: true },
      take: BATCH,
    }),
  ]);

  const report: DailySyncReport = { canvas: 0, teams: 0, feeds: 0, failed: 0, plans: 0, outOfTime: false };
  const touched = new Set<string>();
  type Job = { kind: "canvas" | "teams" | "feeds"; userId: string; run: () => Promise<{ ok: boolean }> };
  const jobs: Job[] = [
    ...canvas.map((c): Job => ({ kind: "canvas", userId: c.userId, run: () => runCanvasSync(c.userId, { dryRun: false }) })),
    ...teams.map((t): Job => ({ kind: "teams", userId: t.userId, run: () => runTeamsSync(t.userId) })),
    ...feeds.map((f): Job => ({ kind: "feeds", userId: f.userId, run: () => runFeedSync(f.userId) })),
  ];

  for (const { kind, userId, run } of jobs) {
    if (Date.now() > deadline) {
      report.outOfTime = true;
      break;
    }
    try {
      // A job that hangs past the budget is abandoned so the rest still run.
      const remaining = Math.max(1_000, deadline - Date.now());
      const r = await Promise.race([
        run(),
        new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: false }), Math.min(remaining, 30_000))),
      ]);
      if (r.ok) {
        report[kind]++;
        touched.add(userId);
      } else report.failed++;
    } catch {
      report.failed++;
    }
  }

  for (const userId of touched) {
    if (Date.now() > deadline) {
      report.outOfTime = true;
      break;
    }
    await regeneratePlanSnapshot(userId);
    report.plans++;
  }
  return report;
}
