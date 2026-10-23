import "server-only";
import { db } from "@/lib/db";

// Cookieless page counts for public pages: day + path + count, nothing about
// the visitor. Best-effort; never blocks a page.
const TRACKED = new Set([
  "/",
  "/how-it-works",
  "/pricing",
  "/download",
  "/founder",
  "/schools",
  "/signup",
  "/login",
  "/tools",
  "/tools/rank-my-week",
  "/tools/exam-study-planner",
  "#exam-plan",
  "#try-start",
  "#try",
  "#try-save",
  "#try-share",
  "#ref-visit",
  "/changelog",
]);

export async function countPageView(path: string): Promise<void> {
  // Dev and production share a database; only production traffic counts.
  if (!TRACKED.has(path) || process.env.VERCEL_ENV !== "production") return;
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  try {
    await db.$executeRaw`
      INSERT INTO "PageView" ("day", "path", "count") VALUES (${day}::date, ${path}, 1)
      ON CONFLICT ("day", "path") DO UPDATE SET "count" = "PageView"."count" + 1`;
  } catch (error) {
    console.error("[analytics] page view failed", (error as Error)?.name ?? typeof error);
  }
}

