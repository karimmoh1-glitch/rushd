import { createHash } from "node:crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";

// The Postgres rate limiter persists across runs. Clear only the buckets the
// local test client uses, so repeated runs
// don't trip signup or inquiry limits. Real users' buckets are untouched.
// The dev server reports loopback addresses in x-forwarded-for; a11y.spec.ts
// signs up from 127.0.0.2 so a full run stays under the per-IP signup limit.
const CLIENTS = ["local", "::1", "127.0.0.1", "::ffff:127.0.0.1", "127.0.0.2"];
const KEYS = ["signup", "school-inquiry", "pv", "reset"].flatMap((p) => CLIENTS.map((c) => `${p}:${c}`));

export default async function setup() {
  if (!process.env.DATABASE_URL) return;
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hashes = KEYS.map((k) => createHash("sha256").update(k).digest("hex"));
    await pool.query(`DELETE FROM "RateLimitBucket" WHERE key = ANY($1)`, [hashes]);
  } finally {
    await pool.end();
  }
}
