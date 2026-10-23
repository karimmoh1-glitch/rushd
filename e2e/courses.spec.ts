import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The add/edit course flow: catalog search (keyboard), custom courses, course
// details, validation, and archive/restore keeping the course's work.

async function newStudent(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-courses-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Course Tester");
  // Onboarding: level, skip courses and work, finish on Today.
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("add a catalog course with the keyboard, a custom course, edit, archive and restore", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.3" } });
  const page = await context.newPage();
  await newStudent(page);
  await page.goto("/courses");

  // Catalog course, picked with the keyboard.
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("combobox", { name: "Course" });
  await search.fill("calc bc");
  await expect(dialog.getByRole("listbox", { name: "Course suggestions" })).toBeVisible();
  // The open dialog and suggestion list meet WCAG 2.1 AA (automated checks).
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue("AP Calculus BC");
  await expect(dialog.getByLabel("Subject (optional)")).toHaveValue("Math");
  await dialog.getByLabel("Course code (optional)").fill("MATH 2B");
  await dialog.getByLabel("School (optional)").fill("Lincoln High School");
  await dialog.getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "AP Calculus BC" })).toBeVisible();
  await expect(page.getByText("AP · MATH 2B · Lincoln High School")).toBeVisible();

  // A custom course that isn't in the catalog.
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Course" }).fill("Marine Robotics Lab");
  await expect(page.getByRole("option", { name: /Use “Marine Robotics Lab” as a custom course/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Marine Robotics Lab" })).toBeVisible();

  // Edit: a term that ends before it starts is refused, then a valid one saves.
  await page.getByRole("button", { name: "Options for Marine Robotics Lab" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByText("Term and study time (optional)").click();
  await edit.getByLabel("Term starts").fill("2026-12-18");
  await edit.getByLabel("Term ends").fill("2026-08-25");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toHaveText("The term can't end before it starts.");
  await edit.getByLabel("Term starts").fill("2026-08-25");
  await edit.getByLabel("Term ends").fill("2026-12-18");
  await edit.getByLabel("Study time you want for this course").fill("4");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Aug 25 – Dec 18")).toBeVisible();

  // Archive and restore keep the course's assignment.
  await page.goto("/assignments");
  await page.getByRole("button", { name: "Add assignment" }).first().click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Title").fill("Buoyancy lab");
  await add.getByLabel("Course").click();
  await page.getByRole("option", { name: "Marine Robotics Lab" }).click();
  await add.getByLabel("Due").fill("2026-11-20T23:59");
  await add.getByRole("button", { name: /Add assignment|Save/ }).click();
  await expect(page.getByText("Buoyancy lab")).toBeVisible();

  await page.goto("/courses");
  await page.getByRole("button", { name: "Options for Marine Robotics Lab" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Archived" })).toBeVisible();
  await page.getByRole("button", { name: "Options for Marine Robotics Lab" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Archived" })).toHaveCount(0);
  await expect(page.getByText(/1 assignment, 0 exams/)).toBeVisible();
  await context.close();
});
