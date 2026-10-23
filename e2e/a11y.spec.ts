import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated accessibility check of the public pages (WCAG 2.1 A/AA rules).
// Catches what machines can: contrast, names, labels, landmarks, ARIA misuse.

const PAGES = ["/", "/tools", "/tools/rank-my-week", "/tools/exam-study-planner", "/pricing", "/how-it-works", "/signup", "/login", "/forgot-password", "/privacy"];

for (const path of PAGES) {
  for (const scheme of ["dark", "light"] as const) {
    test(`a11y ${scheme}: ${path}`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: scheme, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(path);
      await page.evaluate((s) => {
        localStorage.setItem("theme", s);
      }, scheme);
      await page.reload();
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(results.passes.length, "axe ran its rules").toBeGreaterThan(10);
      expect(summary, summary.join("\n")).toEqual([]);
      await context.close();
    });
  }
}

test("a11y: signed-in pages", async ({ browser }) => {
  test.setTimeout(120_000);
  // Its own client address, so this signup doesn't count against the others' limit.
  const context = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": "127.0.0.2" } });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-a11y-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Axe Tester");
  // Onboarding: level, skip courses and work, finish on Today.
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const problems: string[] = [];
  for (const path of ["/dashboard", "/assignments", "/plan", "/settings", "/integrations/canvas", "/integrations/canvas-calendar", "/integrations/teams", "/mastery", "/practice"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of r.violations) problems.push(`${path} ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
  await context.close();
});
