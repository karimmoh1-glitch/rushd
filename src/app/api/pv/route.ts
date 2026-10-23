import { countPageView } from "@/lib/analytics/page-view";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getClientIp } from "@/server/actions/client-ip";

// Receives cookieless page-view beacons from public pages. Only a fixed set of
// paths is counted (see page-view.ts); the body carries nothing else.

/** A tracked path is at most ~30 characters; anything bigger is not a beacon. */
const MAX_BODY_BYTES = 256;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const ip = await getClientIp();
  const rate = await checkRateLimit(`pv:${ip}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (rate.allowed) {
    const body = await request.text();
    await countPageView(body.slice(0, 40));
  }
  return new Response(null, { status: 204 });
}
