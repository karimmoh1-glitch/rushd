import { headers } from "next/headers";
import { countPageView } from "@/lib/analytics/page-view";
import { checkRateLimit } from "@/lib/auth/rate-limit";

// Receives cookieless page-view beacons from public pages. Only a fixed set of
// paths is counted (see page-view.ts); the body carries nothing else.
export async function POST(request: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = await checkRateLimit(`pv:${ip}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (rate.allowed) await countPageView((await request.text()).slice(0, 40));
  return new Response(null, { status: 204 });
}
