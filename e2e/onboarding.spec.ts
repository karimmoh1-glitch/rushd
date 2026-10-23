import { test, expect } from "@playwright/test";

// Multi-course onboarding, keyboard only in the picker: level → three courses
// (one custom) → a term for one course → work → study time → Today shows a
// real first action built from that work.
test("onboarding: level, three courses by keyboard, a term, work, and Today's Next up", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.5" } });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-onboard-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Level is the one required choice.
  const next = page.getByRole("button", { name: "Continue" });
  await expect(next).toBeDisabled();
  await page.getByLabel("What should we call you?").fill("Keyboard Kim");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await next.click();

  // Courses, keyboard only.
  const search = page.getByRole("combobox", { name: "Search courses" });
  await expect(search).toBeFocused();
  await expect(next).toBeDisabled();
  const list = page.getByRole("listbox", { name: "Course suggestions" });
  await expect(list).toHaveAttribute("aria-multiselectable", "true");

  // Similar courses are labeled apart: AP Calculus BC (official) vs college Calculus I (template).
  await search.pressSequentially("calc bc");
  await expect(list.getByRole("option").first()).toContainText("AP Calculus BC");
  await expect(list.getByRole("option").first()).toContainText("AP · Math");
  await search.press("Enter");
  const chips = page.getByRole("list", { name: "Selected courses" });
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await expect(search).toHaveValue("");

  // Arrow keys move the highlight; Enter adds the highlighted one.
  await search.pressSequentially("chemistry");
  await expect(list.getByRole("option", { name: /^AP Chemistry/ })).toBeVisible();
  await search.press("ArrowDown");
  const activeId = await search.getAttribute("aria-activedescendant");
  const activeName = (await page.locator(`[id="${activeId}"]`).locator("span.font-medium").first().textContent())?.trim();
  await search.press("Enter");
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(chips).toContainText(activeName!);

  // Backspace in the empty field removes the last chip; Escape clears a search.
  await search.press("Backspace");
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await search.pressSequentially("organic");
  await search.press("Escape");
  await expect(search).toHaveValue("");

  // Re-add AP Chemistry, then a custom course that isn't in the catalog.
  await search.pressSequentially("ap chem");
  await search.press("Enter");
  await search.pressSequentially("Marine Robotics Lab");
  await expect(list.getByRole("option", { name: /Create “Marine Robotics Lab” as a custom course/ })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(chips.getByRole("listitem")).toHaveCount(3);
  await expect(chips).toContainText("AP Calculus BC");
  await expect(chips).toContainText("AP Chemistry");
  await expect(chips).toContainText("Marine Robotics Lab");
  await expect(page.getByText("3 courses added.")).toBeVisible();
  await next.click();

  // Details: optional and per course. One term, on one course.
  await expect(page.getByRole("heading", { name: "Any details? All optional" })).toBeVisible();
  await expect(page.getByText("Official College Board course").first()).toBeVisible();
  await expect(page.getByText("Your own course")).toBeVisible();
  await page.getByRole("button", { name: "Add details for AP Chemistry" }).click();
  const chem = page.getByRole("group", { name: "Details for AP Chemistry" });
  await chem.getByLabel("Term starts").fill("2026-08-25");
  await chem.getByLabel("Term ends").fill("2026-12-18");
  await chem.getByLabel("Course code").fill("CHEM 1A");
  await next.click();

  // Work: typed lines are matched to the courses just added.
  await page.getByLabel("Assignments and exams, one per line").fill("Chem: titration lab report tomorrow 2h\nRobotics build log friday 1h\nCalc quiz in 3 days");
  await page.getByRole("button", { name: "Add to my list" }).click();
  const work = page.getByRole("list", { name: "Work to add" });
  await expect(work.getByRole("listitem")).toHaveCount(3);
  await expect(work.getByRole("combobox", { name: "Course for Titration lab report" })).toHaveValue("1");
  await expect(work.getByRole("combobox", { name: /Course for Robotics build log/ })).toHaveValue("2");
  await next.click();

  // Study time, then the plan.
  await page.getByText("Weekday afternoons").click();
  await page.getByText("Weekend afternoons").click();
  await page.getByRole("button", { name: "Finish setup" }).click();

  // Today opens on a real first action from the work typed above.
  await expect(page).toHaveURL(/\/dashboard/);
  const nextUp = page.getByRole("region", { name: "Next up" });
  await expect(nextUp).toBeVisible();
  await expect(nextUp).toContainText(/Titration lab report|Robotics build log|Calc quiz|Quiz/i);
  await expect(page.getByRole("heading", { name: /Keyboard Kim/ })).toBeVisible();

  // The courses carry what was entered.
  await page.goto("/courses");
  await expect(page.getByRole("link", { name: "AP Calculus BC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Marine Robotics Lab" })).toBeVisible();
  await expect(page.getByText("AP · CHEM 1A")).toBeVisible();
  await expect(page.getByText("Aug 25 – Dec 18")).toBeVisible();
  await context.close();
});

test("a generic template is labeled as one, on the card and the course page", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": "127.0.0.6" } });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-template-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("radio", { name: "Undergraduate", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const search = page.getByRole("combobox", { name: "Search courses" });
  await search.pressSequentially("data struct");
  await expect(page.getByRole("option").first()).toContainText("Data Structures");
  await expect(page.getByRole("option").first()).toContainText("Undergraduate · Computer Science");
  await search.press("Enter");
  // No horizontal scroll on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Undergraduate · Generic template")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/courses");
  await expect(page.getByText("From a generic template")).toBeVisible();
  await page.getByRole("link", { name: "Data Structures" }).click();
  await expect(page.getByText(/generic “Data Structures” template/)).toBeVisible();
  await context.close();
});
