import { runDailySync } from "@/lib/jobs/daily-sync";
import { sendWeeklyDigests } from "@/lib/jobs/study-emails";
import { cronAuthorized } from "@/lib/jobs/cron-auth";

// Vercel Cron, once a day (vercel.json): re-sync connected sources, then send
// the Sunday "your week" emails (only where it's Sunday for the student).
// Anything without "Authorization: Bearer $CRON_SECRET" is refused.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sync = await runDailySync(70_000);
  const digests = await sendWeeklyDigests(35_000);
  console.info("[cron] daily", JSON.stringify({ sync, digests }));
  return Response.json({ sync, digests });
}
