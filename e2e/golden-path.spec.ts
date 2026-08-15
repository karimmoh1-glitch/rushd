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
