import { test, expect } from "@playwright/test";

// Landing -> signup -> onboarding -> create class -> create assignment ->
// plan reflects it (dashboard + weekly Plan screen) -> complete task ->
// plan adapts. This is the one workflow docs/PRODUCT.md builds the whole
// MVP around, so it's the one flow that must work end to end, not just in
// isolated unit/integration tests.
test("golden path: landing through completing a plan item", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  // Landing page.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Turn academic chaos into a clear plan" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Get started — it's free" }).click();

  // Sign up.
  await expect(page).toHaveURL(/\/signup/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding — step 1: basics.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("What should we call you?").fill("Playwright Student");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: study availability. Select both weekday and weekend presets so
  // this test isn't flaky depending on which day of the week it runs.
  await expect(page.getByText("When can you usually study?")).toBeVisible();
  await page.getByText("Weekday afternoons").click();
  await page.getByText("Weekend afternoons").click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: classes.
  await expect(page.getByText("Add your classes")).toBeVisible();
  await page.getByPlaceholder("e.g. AP Chemistry").fill("Playwright Chemistry");
  await page.getByRole("button", { name: "Go to dashboard" }).click();

  // Dashboard.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Playwright Student/ })).toBeVisible();

  // Create an assignment due today so it lands on today's plan.
  await page.getByRole("link", { name: "Assignments" }).click();
  await expect(page).toHaveURL(/\/assignments/);
  await page.getByRole("button", { name: "Add assignment" }).click();

  await page.getByLabel("Title").fill("Playwright reading response");
  const dueInput = page.getByLabel("Due");
  const todayLocal = new Date();
  todayLocal.setHours(23, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dueValue = `${todayLocal.getFullYear()}-${pad(todayLocal.getMonth() + 1)}-${pad(todayLocal.getDate())}T${pad(todayLocal.getHours())}:${pad(todayLocal.getMinutes())}`;
  await dueInput.fill(dueValue);
  await page.getByRole("button", { name: "Add assignment", exact: true }).click();

  await expect(page.getByText("Playwright reading response")).toBeVisible();

  // The plan should reflect it on the dashboard's Today section.
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Playwright reading response").first()).toBeVisible();

  // ...and on the dedicated weekly Plan screen, under today's column. It
  // may also appear in the Academic Forecast's "top items" list further
  // down the page, so use .first() rather than assuming a unique match.
  await page.getByRole("link", { name: "Plan" }).click();
  await expect(page).toHaveURL(/\/plan/);
  await expect(page.getByText("Playwright reading response").first()).toBeVisible();

  // Complete it from the Assignments page and verify the dashboard adapts.
  await page.getByRole("link", { name: "Assignments" }).click();
  const row = page.locator("div").filter({ hasText: "Playwright reading response" }).first();
  await row.getByRole("checkbox").click();
  await expect(page.getByText("Completed")).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // Completed work should no longer show as an active plan item.
  const activePlanItem = page
    .locator("section", { hasText: "Today" })
    .getByText("Playwright reading response");
  await expect(activePlanItem).toHaveCount(0);
});

// Start -> persist across navigation -> complete with edited actual time.
// This is Rushd's first real feedback loop (see docs/PLANNING_ENGINE.md):
// the engine predicts, the student executes, Rushd records what actually
// happened. Uses its own signup (rather than reusing the flow above) so the
// active-session state doesn't interact with the other test's assertions.
test("study session: start, persists across navigation, completes with an edited actual time", async ({
  page,
}) => {
  const email = `e2e-session-${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("What should we call you?").fill("Session Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday afternoons").click();
  await page.getByText("Weekend afternoons").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("e.g. AP Chemistry").fill("Session Test Class");
  await page.getByRole("button", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Create an assignment, then start a session on it from the Assignments
  // list (a MANUAL-source start, independent of what the live plan chose to
  // schedule today — avoids ambiguity if this item also happens to appear
  // in "One Thing" or Today's plan on the dashboard).
  await page.getByRole("link", { name: "Assignments" }).click();
  await page.getByRole("button", { name: "Add assignment" }).click();
  await page.getByLabel("Title").fill("Session test assignment");
  const dueInput = page.getByLabel("Due");
  const todayLocal = new Date();
  todayLocal.setHours(23, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dueValue = `${todayLocal.getFullYear()}-${pad(todayLocal.getMonth() + 1)}-${pad(todayLocal.getDate())}T${pad(todayLocal.getHours())}:${pad(todayLocal.getMinutes())}`;
  await dueInput.fill(dueValue);
  await page.getByRole("button", { name: "Add assignment", exact: true }).click();
  await expect(page.getByText("Session test assignment")).toBeVisible();

  const row = page.locator("div").filter({ hasText: "Session test assignment" }).first();
  await row.getByRole("button", { name: "Start" }).click();

  // Active session bar appears, showing the assignment and a running timer.
  await expect(page.getByText("Session test assignment").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abandon" })).toBeVisible();

  // Persists across navigation — this is the point of the shared context,
  // not a page-local timer.
  await page.getByRole("link", { name: "Plan" }).click();
  await expect(page).toHaveURL(/\/plan/);
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeVisible();

  // A second Start attempt anywhere should be blocked — only one session at
  // a time. (The dashboard may show this exact assignment again via One
  // Thing/Today; either way, no Start button should be clickable right now.)
  await page.getByRole("link", { name: "Home" }).click();
  const anyStartButton = page.getByRole("button", { name: "Start" }).first();
  if (await anyStartButton.count()) {
    await expect(anyStartButton).toBeDisabled();
  }

  // Complete, editing the pre-filled actual-minutes value.
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  const actualMinutesInput = page.getByLabel("You worked for (minutes)");
  await actualMinutesInput.fill("58");
  await page.getByRole("button", { name: "Confirm" }).click();

  // Summary shows estimated vs. actual, and the bar is gone.
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
  await expect(page.getByText("58 min")).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);
});

// Abandon flow: optional structured reason, never forced.
test("study session: abandon with an optional reason", async ({ page }) => {
  const email = `e2e-abandon-${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("What should we call you?").fill("Abandon Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday afternoons").click();
  await page.getByText("Weekend afternoons").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("e.g. AP Chemistry").fill("Abandon Test Class");
  await page.getByRole("button", { name: "Go to dashboard" }).click();

  await page.getByRole("link", { name: "Exams" }).click();
  await page.getByRole("button", { name: "Add exam" }).click();
  await page.getByLabel("Title").fill("Chemistry review exam");
  const examDate = new Date();
  examDate.setDate(examDate.getDate() + 3);
  examDate.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const examValue = `${examDate.getFullYear()}-${pad(examDate.getMonth() + 1)}-${pad(examDate.getDate())}T${pad(examDate.getHours())}:${pad(examDate.getMinutes())}`;
  await page.getByLabel("Date").fill(examValue);
  await page.getByRole("button", { name: "Add exam", exact: true }).click();
  await expect(page.getByText("Chemistry review exam")).toBeVisible();

  const row = page.locator("div").filter({ hasText: "Chemistry review exam" }).first();
  await row.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Abandon" })).toBeVisible();

  await page.getByRole("button", { name: "Abandon" }).click();
  await expect(page.getByRole("heading", { name: "Why did you stop?" })).toBeVisible();
  await page.getByText("Got distracted").click();
  await page.getByRole("button", { name: "End session" }).click();

  // The bar is gone and nothing was forced — no error, no required field.
  await expect(page.getByRole("button", { name: "Abandon" })).toHaveCount(0);
});
