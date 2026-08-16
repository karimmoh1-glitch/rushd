import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

// Cloudflare Workers can't open raw TCP sockets, so this uses Neon's
// WebSocket-based driver everywhere db.ts is imported (dev, tests, and
// production alike) rather than branching per environment — plain `pg`
// cannot even be bundled for the Cloudflare build (fails at bundle time on
// its optional "pg-cloudflare" dependency), so there's no viable dual-path
// here. See docs/ARCHITECTURE.md.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaNeon({ connectionString: env.DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
