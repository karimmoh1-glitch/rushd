// Applies pending Prisma migrations over Neon's WebSocket driver, for
// networks where `prisma migrate deploy` can't open a TCP connection.
// Keeps Prisma's own bookkeeping (_prisma_migrations), so either tool can
// take over later. Each migration runs in its own transaction.
//
//   node --env-file=.env scripts/apply-migrations.mjs          # list pending
//   node --env-file=.env scripts/apply-migrations.mjs --apply  # apply them
//
// Never prints the connection string.
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = globalThis.WebSocket;

const apply = process.argv.includes("--apply");
const dir = join(import.meta.dirname, "..", "prisma", "migrations");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows } = await pool.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const applied = new Set(rows.map((r) => r.migration_name));
  const pending = readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory() && !applied.has(name))
    .sort();

  if (pending.length === 0) {
    console.log("No pending migrations.");
  }
  for (const name of pending) {
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    if (!apply) {
      console.log(`pending: ${name}`);
      continue;
    }
    const client = await pool.connect();
    try {
      const startedAt = new Date();
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, $4, now(), 1)`,
        [randomUUID(), createHash("sha256").update(sql).digest("hex"), name, startedAt],
      );
      await client.query("COMMIT");
      console.log(`applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`failed: ${name}: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
