import { sendStreakNudges } from "@/lib/jobs/study-emails";
import { cronAuthorized } from "@/lib/jobs/cron-auth";

// Vercel Cron, once a day in the Americas' evening (vercel.json): streak
// reminders for students whose local time is evening. Bearer CRON_SECRET only.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const nudges = await sendStreakNudges(50_000);
  console.info("[cron] evening", JSON.stringify(nudges));
  return Response.json(nudges);
}
