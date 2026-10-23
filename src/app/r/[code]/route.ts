import { NextResponse } from "next/server";
import { CODE_RE, REF_COOKIE } from "@/lib/referral/referral";
import { countPageView } from "@/lib/analytics/page-view";

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/** The invite code this browser already has saved, if any. */
function savedInviteCode(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  const match = cookieHeader?.match(/(?:^|;\s*)rushd_ref=([^;]+)/);
  return match?.[1];
}

// Invite links: therushd.com/r/<code>. Remembers the code for 30 days in an
// httpOnly cookie (read once at signup), then shows the homepage.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = new URL("/?invited=1", request.url);
  const response = NextResponse.redirect(target, 307);

  // Badly formed codes still go to the homepage, but nothing is saved.
  if (!CODE_RE.test(code)) {
    return response;
  }

  // Count a visit only the first time this browser arrives with this invite.
  if (savedInviteCode(request) !== code) {
    await countPageView("#ref-visit");
  }
  response.cookies.set(REF_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_IN_SECONDS,
  });
  return response;
}
