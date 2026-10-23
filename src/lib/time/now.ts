import "server-only";
import { cookies } from "next/headers";

// The one "what time is it" for the planner and the Today/Schedule pages.
//
// In production it is always the real clock. For deterministic browser tests
// (e2e/visual.spec.ts compares page structure, which depends on the time of
// day), a test may pin the server clock for ITS OWN requests with the
// `rushd-test-now` cookie. That only works when BOTH:
//   - NODE_ENV is not "production" (next build / next start / Vercel always set
//     production, so a deployed app can never honor it), and
//   - RUSHD_TEST_CLOCK=1 is set explicitly for the dev server (playwright.config.ts
//     sets it for the server it starts).
// A cookie can't turn it on by itself, and nothing reads the cookie otherwise.

export const TEST_CLOCK_COOKIE = "rushd-test-now";

export function testClockAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.RUSHD_TEST_CLOCK === "1";
}

/** Parses a pinned time; null for anything that isn't a valid ISO-like date. */
export function parseTestNow(value: string | undefined): Date | null {
  if (!value || value.length > 40) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The current time for planning and page rendering. */
export async function currentTime(): Promise<Date> {
  if (!testClockAllowed()) return new Date();
  try {
    const pinned = parseTestNow((await cookies()).get(TEST_CLOCK_COOKIE)?.value);
    if (pinned) return pinned;
  } catch {
    // Outside a request (cron jobs, scripts): there's no cookie to read.
  }
  return new Date();
}
