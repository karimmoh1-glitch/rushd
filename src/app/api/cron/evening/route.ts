import { sendStreakNudges } from "@/lib/jobs/study-emails";
import { cronAuthorized } from "@/lib/jobs/cron-auth";
import { recordCronRun } from "@/lib/jobs/cron-log";
import { jobFailure } from "../job-failure";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";

// Vercel Cron, every 6 hours (vercel.json): streak reminders for students
// whose local time is evening. Bearer CRON_SECRET only.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers);
  if (!cronAuthorized(request.headers.get("authorization"))) {
    log.warn("cron.unauthorized", { requestId, job: "evening" });
    return withRequestIdHeader(new Response("Unauthorized", { status: 401 }), requestId);
  }
  const started = Date.now();
  const nudges = await sendStreakNudges(50_000).catch(jobFailure);
  log.info("cron.evening.done", { requestId, durationMs: Date.now() - started, nudges });
  await recordCronRun("evening", nudges);
  return withRequestIdHeader(Response.json(nudges), requestId);
}
