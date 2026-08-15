import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionFromToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Optimistic redirect only — reads the session cookie, never the database.
// The real authorization check (does this user own this data, has this user
// finished onboarding) happens in src/lib/auth/dal.ts on every protected
// page and server action. This proxy exists purely to avoid flashing
// protected UI at signed-out visitors and to bounce signed-in visitors away
// from /login and /signup.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/classes",
  "/assignments",
  "/exams",
  "/plan",
  "/settings",
  "/admin",
];
const AUTH_PAGES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await readSessionFromToken(token);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isProtected && !session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
