// Runs before any test module is imported — sets env vars so src/lib/env.ts
// (evaluated eagerly on first import) resolves against the dedicated
// rushd_test database rather than dev data. See package.json's
// test:integration script and vitest.integration.config.mts.
process.env.DATABASE_URL ??=
  "postgresql://karimmohamed@localhost:5432/rushd_test?schema=public";
process.env.SESSION_SECRET ??= "integration-test-secret-not-for-production-use";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
