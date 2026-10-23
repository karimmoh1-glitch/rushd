import { pingDatabase } from "@/lib/health";
import { log } from "@/lib/log";
import { requestIdFrom, withRequestIdHeader } from "@/lib/request-id";
import packageJson from "../../../../package.json";

// Uptime monitoring: GET /api/health. No auth, nothing secret, never cached.
// 200 when the app is up and the database answers within DB_TIMEOUT_MS;
// 503 when the database doesn't (the monitor should alert on that).

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** The deployed commit, when the host provides one (Vercel does). */
function commit(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null;
  return sha ? sha.slice(0, 12) : null;
}

export async function GET(request: Request) {
  const requestId = requestIdFrom(request.headers);
  const database = await pingDatabase();
  const healthy = database.status === "ok";
  if (!healthy) {
    log.warn("health.db_unavailable", { requestId, db: database.status, latencyMs: database.latencyMs });
  }
  const body = {
    status: healthy ? "ok" : "degraded",
    version: packageJson.version,
    commit: commit(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    time: new Date().toISOString(),
    checks: { database },
  };
  return withRequestIdHeader(
    Response.json(body, {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }),
    requestId,
  );
}

/** Some monitors use HEAD; same checks, no body. */
export async function HEAD(request: Request) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
