import { timingSafeEqual } from "node:crypto";
import { runDailySync } from "@/lib/jobs/daily-sync";

// Vercel Cron calls this once a day (vercel.json) with
// "Authorization: Bearer $CRON_SECRET". Anything else is refused, and without
// CRON_SECRET set the endpoint does nothing.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const report = await runDailySync(100_000);
  console.info("[cron] daily sync", JSON.stringify(report));
  return Response.json(report);
}
