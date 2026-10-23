import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets several checkouts (worktrees) each test their own dev server.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup.ts",
  globalTeardown: "./e2e/teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
    // Lets a test pin the server clock for its own requests with the
    // rushd-test-now cookie (src/lib/time/now.ts). Ignored by any production
    // build. If you start the dev server yourself for e2e, set it there too.
    env: { RUSHD_TEST_CLOCK: "1" },
  },
});
