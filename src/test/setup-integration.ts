// Runs before any test module is imported. DATABASE_URL comes from .env —
// the same Neon database `npm run dev` uses. Integration tests can no
// longer point at a separate local Postgres instance the way they used to:
// src/lib/db.ts's Neon driver (required for the Cloudflare deployment, see
// docs/ARCHITECTURE.md) only speaks to Neon's proxy, not a generic local
// Postgres server. This means dev and integration-test data currently share
// one database — each test creates and deletes its own users
// (src/test/helpers.ts), so this is low-risk for now, but add a second Neon
// branch and point this file at it if real isolation becomes necessary.
import "dotenv/config";

process.env.SESSION_SECRET ??= "integration-test-secret-not-for-production-use";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
