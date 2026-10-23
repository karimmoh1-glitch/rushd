import "server-only";
import { db } from "@/lib/db";

// Last run of each scheduled job, kept in AppSetting so the admin page can
// show that the crons are actually running.

export type CronName = "daily" | "evening";

export async function recordCronRun(name: CronName, report: unknown): Promise<void> {
  const key = `cron.${name}.last`;
  // A JSON round trip turns the report into plain JSON that Prisma can store.
  const value = JSON.parse(JSON.stringify({ at: new Date().toISOString(), report }));
  await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }).catch(() => {});
}

type CronRun = { at: string; report: unknown };

export async function lastCronRuns(): Promise<Record<CronName, CronRun | null>> {
  const rows = await db.appSetting.findMany({ where: { key: { in: ["cron.daily.last", "cron.evening.last"] } } });

  function runFor(key: string): CronRun | null {
    const row = rows.find((r) => r.key === key);
    if (!row || row.value == null) return null;
    return row.value as CronRun;
  }
  return { daily: runFor("cron.daily.last"), evening: runFor("cron.evening.last") };
}
