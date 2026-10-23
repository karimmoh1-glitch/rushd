import "server-only";
import { db } from "@/lib/db";

// The database check behind GET /api/health.

const DB_TIMEOUT_MS = 2_000;

export type DbStatus = { status: "ok"; latencyMs: number } | { status: "error" | "timeout"; latencyMs: number };

export async function pingDatabase(timeoutMs = DB_TIMEOUT_MS): Promise<DbStatus> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const outcome = await Promise.race([db.$queryRaw`SELECT 1`.then(() => "ok" as const), timeout]);
    return { status: outcome, latencyMs: Date.now() - started };
  } catch {
    return { status: "error", latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
