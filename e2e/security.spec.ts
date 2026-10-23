import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("security headers are on every page", async ({ request }) => {
  for (const path of ["/", "/login", "/api/health"]) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers["content-security-policy"], path).toContain("default-src 'self'");
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"], path).toBe("max-age=63072000; includeSubDomains");
    expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
  }
});

test("health endpoint answers for uptime monitors", async ({ request }) => {
  const res = await request.get("/api/health", { headers: { "x-request-id": "e2e-health-check-1" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-request-id"]).toBe("e2e-health-check-1");
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.checks.database.status).toBe("ok");
});

test("a student downloads their own data from Settings", async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.3" } });
  const page = await context.newPage();
  const email = `e2e-export-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Exporter");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("e.g. AP Chemistry").fill("Biology");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: "Go to my plan" }).click();
  await page.waitForURL(/dashboard/);

  await page.goto("/settings");
  const downloadStarted = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download my data" }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/^rushd-data-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await download.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.account.email).toBe(email);
  expect(data.profile[0].displayName).toBe("Exporter");
  expect(data.courses.map((c: { name: string }) => c.name)).toContain("Biology");
  expect(text).not.toContain("passwordHash");

  // Another site can't start the download for this student.
  const crossSite = await page.request.get("/api/account/export", { headers: { "sec-fetch-site": "cross-site" } });
  expect(crossSite.status()).toBe(403);
  await context.close();
});
