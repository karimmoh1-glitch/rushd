import { NextResponse } from "next/server";
import { CODE_RE, REF_COOKIE } from "@/lib/referral/referral";

// Invite links: therushd.com/r/<code>. Remembers the code for 30 days in an
// httpOnly cookie (read once at signup), then shows the homepage.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = new URL("/?invited=1", request.url);
  const res = NextResponse.redirect(target, 307);
  if (CODE_RE.test(code)) {
    res.cookies.set(REF_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  return res;
}
