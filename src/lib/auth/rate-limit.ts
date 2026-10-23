import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { log } from "@/lib/log";

// Fixed-window rate limiter backed by Postgres, so a limit holds across every
// serverless instance (an in-process Map resets per instance and per deploy).
// Keys are hashed before storage: the table never holds raw emails or IPs.

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 10;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function rateLimitKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function checkRateLimit(
  key: string,
  { max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS }: { max?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  try {
    // One atomic upsert: start a fresh window if the old one expired,
    // otherwise count this attempt against it.
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${rateLimitKey(key)}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];

    // On about 2% of calls, clean up expired buckets in the background.
    if (Math.random() < 0.02) {
      void db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => {});
    }

    if (!row || row.count <= max) return { allowed: true };
    const msUntilReset = new Date(row.resetAt).getTime() - now.getTime();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msUntilReset / 1000)) };
  } catch (error) {
    // Fail open: a limiter outage must not lock every student out. The
    // underlying action still needs the database, so it fails on its own.
    log.warn("rate_limit.check_failed_open", { err: error });
    return { allowed: true };
  }
}
