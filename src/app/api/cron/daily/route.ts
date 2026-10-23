import { runDailySync } from "@/lib/jobs/daily-sync";
import { sendWeeklyDigests } from "@/lib/jobs/study-emails";
import { cronAuthorized } from "@/lib/jobs/cron-auth";
import { recordCronRun } from "@/lib/jobs/cron-log";
import { jobFailure } from "../job-failure";

// Vercel Cron, once a day (vercel.json): the Sunday "your week" emails (only
// where it's Sunday for the student), then re-sync connected sources.
// Anything without "Authorization: Bearer $CRON_SECRET" is refused.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Emails first: a slow sync must never cost students their Sunday email.
  const digests = await sendWeeklyDigests(35_000).catch(jobFailure);
  const sync = await runDailySync(70_000).catch(jobFailure);
  console.info("[cron] daily", JSON.stringify({ sync, digests }));
  await recordCronRun("daily", { sync, digests });
  return Response.json({ sync, digests });
}
