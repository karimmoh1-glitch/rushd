import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

// Neon's WebSocket driver is used everywhere: Cloudflare Workers can't open raw
// TCP sockets, and plain `pg` can't even be bundled for that build.

// Local development and tests only: reach a plain local Postgres through
// scripts/local-db-proxy.mjs. Never set in production.
if (process.env.LOCAL_DB_PROXY) {
  const proxy = process.env.LOCAL_DB_PROXY;
  neonConfig.wsProxy = (host, port) => `${proxy}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

// In development, keep one client across hot reloads instead of opening a new pool each time.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaNeon({ connectionString: env.DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
