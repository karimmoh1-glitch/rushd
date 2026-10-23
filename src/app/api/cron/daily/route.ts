import { runDailySync } from "@/lib/jobs/daily-sync";
import { sendWeeklyDigests } from "@/lib/jobs/study-emails";
import { cronAuthorized } from "@/lib/jobs/cron-auth";
import { recordCronRun } from "@/lib/jobs/cron-log";
import { jobFailure } from "../job-failure";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";

// Vercel Cron, once a day (vercel.json): the Sunday "your week" emails (only
// where it's Sunday for the student), then re-sync connected sources.
// Anything without "Authorization: Bearer $CRON_SECRET" is refused.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers);
  if (!cronAuthorized(request.headers.get("authorization"))) {
    log.warn("cron.unauthorized", { requestId, job: "daily" });
    return withRequestIdHeader(new Response("Unauthorized", { status: 401 }), requestId);
  }
  const started = Date.now();
  // Emails first: a slow sync must never cost students their Sunday email.
  const digests = await sendWeeklyDigests(35_000).catch(jobFailure);
  const sync = await runDailySync(70_000).catch(jobFailure);
  log.info("cron.daily.done", { requestId, durationMs: Date.now() - started, sync, digests });
  await recordCronRun("daily", { sync, digests });
  return withRequestIdHeader(Response.json({ sync, digests }), requestId);
}
