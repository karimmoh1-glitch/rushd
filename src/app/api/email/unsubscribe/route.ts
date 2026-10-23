import { db } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { log } from "@/lib/log";
import { requestIdFrom } from "@/lib/request-id";

// GET shows a confirm button (link scanners prefetch GETs, so they must not
// unsubscribe anyone); POST turns study emails off. Mail clients' one-click
// unsubscribe (RFC 8058) POSTs here directly.

/** Wraps a small piece of HTML in Rushd's plain dark page. */
function page(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Study emails · Rushd</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#161514;color:#f2f0eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px"><main style="max-width:420px;text-align:center">${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/** Reads the signed user id ("u") and token ("t") from the link. */
function linkParams(request: Request) {
  const url = new URL(request.url);
  return { userId: url.searchParams.get("u"), token: url.searchParams.get("t") };
}

export async function GET(request: Request) {
  const { userId, token } = linkParams(request);
  if (!verifyUnsubscribe(userId, token)) {
    return page("<p>This link isn't valid. You can turn study emails off in Settings.</p>", 400);
  }
  return page(
    `<h1 style="font-family:Georgia,serif;font-weight:500">Turn off study emails?</h1><p style="color:#a8a49b">No more Sunday plans or streak reminders. Password emails still work.</p><form method="post"><button style="margin-top:12px;background:#f2f0eb;color:#161514;border:0;border-radius:999px;padding:12px 22px;font-weight:600;font-size:15px;cursor:pointer">Turn them off</button></form>`,
  );
}

export async function POST(request: Request) {
  const { userId, token } = linkParams(request);
  if (!verifyUnsubscribe(userId, token)) {
    log.warn("email.unsubscribe_invalid_link", { requestId: requestIdFrom(request.headers) });
    return page("<p>This link isn't valid.</p>", 400);
  }
  // verifyUnsubscribe passing means userId is present.
  await db.profile.updateMany({ where: { userId: userId! }, data: { emailReminders: false } });
  return page(`<h1 style="font-family:Georgia,serif;font-weight:500">Done.</h1><p style="color:#a8a49b">Study emails are off. Turn them back on anytime in Settings.</p>`);
}
