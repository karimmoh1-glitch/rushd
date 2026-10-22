import "server-only";
import { db } from "@/lib/db";

// Last run of each scheduled job, kept in AppSetting so the admin page can
// show that the crons are actually running.

export type CronName = "daily" | "evening";

export async function recordCronRun(name: CronName, report: unknown): Promise<void> {
  const key = `cron.${name}.last`;
  const value = JSON.parse(JSON.stringify({ at: new Date().toISOString(), report }));
  await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }).catch(() => {});
}

export async function lastCronRuns(): Promise<Record<CronName, { at: string; report: unknown } | null>> {
  const rows = await db.appSetting.findMany({ where: { key: { in: ["cron.daily.last", "cron.evening.last"] } } });
  const get = (k: string) => (rows.find((r) => r.key === k)?.value as { at: string; report: unknown } | undefined) ?? null;
  return { daily: get("cron.daily.last"), evening: get("cron.evening.last") };
}
