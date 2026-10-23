import { test, expect, type Page } from "@playwright/test";
import { seedReviewData } from "./review-seed";

// No page scrolls sideways on a 390px phone, with real data on it: long
// titles, long emails, a rubric, a practice check, a session history.

const PUBLIC = [
  "/how-it-works", "/pricing", "/tools", "/tools/rank-my-week", "/tools/exam-study-planner", "/schools", "/founder",
  "/changelog", "/download", "/privacy", "/terms", "/contact", "/login", "/signup", "/forgot-password", "/reset-password",
];

async function overflow(page: Page, path: string): Promise<string | null> {
  await page.goto(path);
  await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(300);
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return extra > 0 ? `${path}: ${extra}px wider than the screen` : null;
}

test("public and auth pages fit a 390px screen", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const wide: string[] = [];
  for (const path of PUBLIC) {
    const result = await overflow(page, path);
    if (result) wide.push(result);
  }
  expect(wide).toEqual([]);
  await context.close();
});

test("signed-in pages fit a 390px screen", async ({ browser }) => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to seed review data");
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": "127.0.0.6" } });
  const page = await context.newPage();
  const email = `e2e-layout-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Maya");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const picker = page.getByRole("combobox", { name: "Search courses" });
  for (const course of ["AP Chem", "AP U.S. History"]) {
    await picker.pressSequentially(course);
    await picker.press("Enter");
  }
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday evenings").click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);
  await page.getByLabel("Your assignments and tests this week, one per line").fill(
    "AP Chemistry: a very long assignment title about the equilibrium constant lab write-up and error analysis in 2 days 2h\nAP Chemistry quiz in 4 days\nAP United States History: DBQ outline tomorrow 1h",
  );
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });
  const ids = await seedReviewData(email);

  const paths = [
    "/assignments", `/assignments/${ids.assignmentId}`, "/exams", "/courses", "/practice", `/practice/${ids.assessmentId}`,
    "/mastery/habits", "/settings", "/more", "/profile", "/integrations/canvas", "/integrations/canvas-calendar",
    "/integrations/teams", "/upgrade", "/admin", "/admin/ai", "/admin/growth",
  ];
  if (ids.manualAssignmentId) paths.push(`/assignments/${ids.manualAssignmentId}`);
  const wide: string[] = [];
  for (const path of paths) {
    const result = await overflow(page, path);
    if (result) wide.push(result);
  }
  expect(wide).toEqual([]);
  await context.close();
});
