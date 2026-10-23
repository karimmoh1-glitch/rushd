import { test, expect, type Page } from "@playwright/test";

// The tutor with AI off (as in production): an honest "not available" state
// that shows what it would use for the course and links into the no-AI
// learning loop (topic review, practice with your own questions, mistakes),
// instead of an error. The API refuses with a fallback flag, not a crash.

async function newStudent(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-tutor-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Tutee");
  // Onboarding: level, skip courses and work, finish on Today.
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("with AI off, the tutor explains it's unavailable and links into practice and mistakes", async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.6" } });
  const page = await context.newPage();
  await newStudent(page);

  // A course with one topic, one own question, and one missed answer.
  await page.goto("/courses");
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Course" }).fill("General Chemistry");
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "General Chemistry" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "General Chemistry" })).toBeVisible();
  const courseUrl = page.url().replace(/\/$/, "");
  const classId = courseUrl.split("/").pop()!;
  await page.goto(`${courseUrl}/topics`);
  await page.getByLabel("New topic").fill("Stoichiometry");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("heading", { name: "Stoichiometry", level: 3 })).toBeVisible();
  // No tutor links while it's unavailable.
  await expect(page.getByRole("link", { name: /Ask the tutor/ })).toHaveCount(0);
  await page.goto(`${courseUrl}/practice`);
  await page.getByRole("button", { name: "Add a question" }).click();
  await page.getByRole("dialog").getByLabel("Topic").selectOption({ label: "Stoichiometry" });
  await page.getByRole("dialog").getByLabel("Problem").fill("How many moles of O2 react with 4 mol of H2?");
  await page.getByRole("dialog").getByLabel("Worked solution").fill("2 mol");
  await page.getByRole("dialog").getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Start a practice session" }).click();
  await page.waitForURL(/\/practice\/[^/]+$/);
  await page.getByRole("button", { name: "Show the answer" }).click();
  await page.getByRole("button", { name: "I missed it" }).click();
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await page.goto(`${courseUrl}/mistakes`);
  await expect(page.getByText("How many moles of O2 react with 4 mol of H2?").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ask the tutor/ })).toHaveCount(0);

  // The tutor, opened about that course.
  await page.goto(`/tutor?classId=${classId}`);
  await expect(page.getByRole("heading", { name: "Tutor", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The tutor isn't available right now" })).toBeVisible();
  await expect(page.getByText(/AI tutoring is switched off on this server/)).toBeVisible();
  // What it would use, and what isn't on file.
  await expect(page.getByLabel(/^Using: General Chemistry[^,]*, 1 topic, syllabus not uploaded$/)).toBeVisible();
  // No message box to type into a tutor that can't answer.
  await expect(page.getByLabel("Message the tutor")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Mistakes: General Chemistry" })).toContainText("1 to retry");
  await page.screenshot({ path: "test-results/tutor-fallback.png", fullPage: true });

  await page.getByRole("link", { name: "Mistakes: General Chemistry" }).click();
  await expect(page.getByRole("heading", { name: "Mistake history" })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Practice: General Chemistry" }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${classId}/practice$`));

  // The API says the same thing, with the fallback flag the page uses.
  const response = await page.request.post("/api/tutor", {
    data: { message: "help", classId },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "The tutor isn't available right now.", fallback: true });

  // Another student's mistake link is ignored, not trusted.
  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.7" } });
  const otherPage = await other.newPage();
  await newStudent(otherPage);
  await otherPage.goto(`/tutor?classId=${classId}&topic=nope&mistake=nope`);
  await expect(otherPage.getByLabel(/^Using: All courses/)).toBeVisible();
  await other.close();
  await context.close();
});
