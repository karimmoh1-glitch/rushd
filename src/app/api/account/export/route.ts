import { getCurrentUser } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logEvent } from "@/lib/analytics/log-event";
import { exportStream } from "@/lib/data-rights/export";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";

// GET /api/account/export: the signed-in student's data as a JSON download
// (Settings → Your data). Session cookie only; rate limited; never cached.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPORT_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

function plain(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers);
  const respond = (response: Response) => withRequestIdHeader(response, requestId);

  // A link on another site can't start downloads (and burn the student's quota).
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return respond(plain(403, "Start the download from Rushd's Settings page."));
  }
  const user = await getCurrentUser();
  if (!user) return respond(plain(401, "Log in to download your data."));

  const rate = await checkRateLimit(`data-export:${user.id}`, EXPORT_LIMIT);
  if (!rate.allowed) {
    return respond(plain(429, "You've downloaded your data several times this hour. Try again later.", { "Retry-After": String(rate.retryAfterSeconds ?? 3600) }));
  }

  await logEvent(user.id, "data_exported");
  log.info("account.export_started", { requestId });
  const day = new Date().toISOString().slice(0, 10);
  return respond(
    new Response(exportStream(user.id), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="rushd-data-${day}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }),
  );
}
