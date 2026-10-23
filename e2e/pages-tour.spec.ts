import { test, expect, type Page } from "@playwright/test";
import { seedReviewData } from "./review-seed";

// Design review screenshots for the pages outside the main tour, on demand:
//   TOUR=1 TOUR_OUT=/some/dir [TOUR_THEME=light] npx playwright test e2e/pages-tour.spec.ts
// A real signup builds the student. What the UI can't create locally (a Canvas
// assignment with its rubric, a saved draft review, a practice check, finished
// study sessions, the admin flag) is seeded the way course-content.spec.ts does;
// the e2e teardown deletes the account and everything under it.

test.skip(!process.env.TOUR, "design tour runs only with TOUR=1");

const OUT = process.env.TOUR_OUT ?? "test-results/pages-tour";

async function shoot(page: Page, name: string) {
  await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.log(`OVERFLOW ${name}: ${overflow}px`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

const PUBLIC = [
  "/how-it-works", "/pricing", "/tools", "/tools/rank-my-week", "/tools/exam-study-planner", "/schools", "/founder",
  "/changelog", "/download", "/privacy", "/terms", "/contact", "/login", "/signup", "/forgot-password", "/reset-password",
];

test("pages tour", async ({ browser }) => {
  test.setTimeout(600_000);
  const theme = process.env.TOUR_THEME ?? "dark";
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: theme === "light" ? "light" : "dark", extraHTTPHeaders: { "x-forwarded-for": "127.0.0.5" } });
  await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  const page = await context.newPage();

  for (const [width, prefix] of [[1360, "d"], [390, "m"]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of PUBLIC) {
      await page.goto(path);
      await shoot(page, `${prefix}-public${path.replace(/\//g, "-")}`);
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });

  const email = `e2e-pages-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Maya");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const picker = page.getByRole("combobox", { name: "Search courses" });
  for (const course of ["AP Chem", "AP Calculus AB", "AP U.S. History"]) {
    await picker.pressSequentially(course);
    await picker.press("Enter");
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday evenings").click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);

  // Empty states first.
  const empty = ["/assignments", "/exams", "/practice", "/mastery/habits", "/courses"];
  for (const [width, prefix] of [[1360, "d"], [390, "m"]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of empty) {
      await page.goto(path);
      await shoot(page, `${prefix}-empty${path.replace(/\//g, "-")}`);
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });

  await page.goto("/dashboard");
  await page.getByLabel("Your assignments and tests this week, one per line").fill(
    "AP Chemistry: titration lab report in 2 days 2h\nAP Calculus AB: problem set 5.3 tomorrow 45m\nAP Chemistry quiz in 4 days\nAP U.S. History: DBQ outline in 3 days 1h\nAP Calculus AB unit test in 9 days\nAP U.S. History: reading notes yesterday 30m",
  );
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });
  const ids = await seedReviewData(email);

  const screens: [string, string][] = [
    ["/assignments", "assignments"],
    [`/assignments/${ids.assignmentId}`, "assignment-canvas"],
    ...(ids.manualAssignmentId ? [[`/assignments/${ids.manualAssignmentId}`, "assignment-manual"] as [string, string]] : []),
    ["/exams", "exams"],
    ["/mastery/habits", "habits"],
    ["/practice", "practice"],
    [`/practice/${ids.assessmentId}`, "practice-result"],
    ["/courses", "courses"],
    ["/settings", "settings"],
    ["/more", "more"],
    ["/profile", "profile"],
    ["/integrations/canvas", "integrations-canvas"],
    ["/integrations/canvas-calendar", "integrations-canvas-calendar"],
    ["/integrations/teams", "integrations-teams"],
    ["/upgrade", "upgrade"],
    ["/admin", "admin"],
    ["/admin/ai", "admin-ai"],
    ["/admin/growth", "admin-growth"],
  ];
  for (const [width, prefix] of [[1360, "d"], [390, "m"]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [path, name] of screens) {
      await page.goto(path);
      await shoot(page, `${prefix}-${name}`);
    }
  }

  // A running session: the other Start buttons are disabled.
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/assignments");
  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await page.waitForTimeout(800);
  await shoot(page, "d-assignments-session-running");
  await page.goto("/exams");
  await shoot(page, "d-exams-session-running");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assignments");
  await shoot(page, "m-assignments-session-running");
  await context.close();
});
