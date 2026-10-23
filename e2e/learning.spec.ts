import { test, expect, type Page } from "@playwright/test";

// The learning loop through the real UI, with AI off (as in production):
// topic map -> own questions -> practice session (hints before the answer,
// self-marking, confidence) -> mistakes -> retry -> mastery overview.
// Another student can't open any of it.

async function newStudent(page: Page, label: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-learning-${label}-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Learner");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Your Rushd profile is ready." })).toBeVisible();
}

async function addCourse(page: Page, name: string) {
  await page.goto("/courses");
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Course" }).fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().replace(/\/$/, "");
}

async function addQuestion(page: Page, topic: string, prompt: string, answer: string, hint?: string) {
  await page.getByRole("button", { name: "Add a question" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Topic").selectOption({ label: topic });
  await dialog.getByLabel("Problem").fill(prompt);
  await dialog.getByLabel("Worked solution").fill(answer);
  if (hint) await dialog.getByLabel("Hint (optional)").fill(hint);
  await dialog.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(prompt)).toBeVisible();
}

test("topics, own questions, a practice session, mistakes and mastery, without AI", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.5" } });
  const page = await context.newPage();
  await newStudent(page, "a");
  const courseUrl = await addCourse(page, "Calculus I");

  // The overview invites topics; nothing is made up.
  await expect(page.getByRole("heading", { name: "Learning" })).toBeVisible();
  await page.getByRole("navigation", { name: "Course sections" }).getByRole("link", { name: "Topics" }).click();
  await expect(page.getByText("No topics yet")).toBeVisible();

  // Topic map: two topics and a subtopic.
  for (const title of ["Limits", "Derivatives"]) {
    await page.getByLabel("New topic").fill(title);
    await page.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
  }
  await page.getByLabel("New topic").fill("Chain rule");
  await page.getByLabel("Inside").selectOption({ label: "Derivatives" });
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("heading", { name: "Chain rule", level: 3 })).toBeVisible();
  // A duplicate is refused.
  await page.getByLabel("New topic").fill("limits");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByText("This course already has that topic.")).toBeVisible();
  await page.getByLabel("New topic").fill("");

  // Prerequisite: Chain rule builds on Limits.
  await page.getByRole("button", { name: "Edit Chain rule" }).click();
  await page.getByRole("dialog").getByLabel("Limits").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Builds on Limits")).toBeVisible();
  // Reorder: move Derivatives above Limits.
  await page.getByRole("button", { name: "Move Derivatives up" }).click();
  await expect(page.locator("h3").first()).toHaveText("Derivatives");
  await expect(page.getByText("Not enough evidence").first()).toBeVisible();

  // Practice: the subject-aware form (math: worked problems), own questions only.
  await page.getByRole("navigation", { name: "Course sections" }).getByRole("link", { name: "Practice" }).click();
  await expect(page.getByText(/Worked problems: write out each step/)).toBeVisible();
  await expect(page.getByText("Generated questions aren't available yet. Add your own.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate questions" })).toHaveCount(0);
  await addQuestion(page, "Chain rule", "Differentiate sin(x^2)", "2x cos(x^2)", "Outer derivative times inner derivative");
  await addQuestion(page, "Chain rule", "Differentiate (3x+1)^5", "15(3x+1)^4");
  await expect(page.getByText("Your question").first()).toBeVisible();

  // A session: confidence, a hint before the answer, then self-marking.
  await page.getByRole("button", { name: "Start a practice session" }).click();
  await page.waitForURL(/\/practice\/[^/]+$/);
  const sessionPath = new URL(page.url()).pathname.replace(/^\/courses\/[^/]+/, "");
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await expect(page.getByText("2x cos(x^2)")).toHaveCount(0);
  await page.getByLabel(/Your answer/).fill("cos(x^2)");
  await page.getByRole("button", { name: "Sure", exact: true }).click();
  await page.getByRole("button", { name: "Show a hint" }).click();
  await expect(page.getByText("Outer derivative times inner derivative")).toBeVisible();
  await page.getByRole("button", { name: "Show the answer" }).click();
  await expect(page.getByText("2x cos(x^2)")).toBeVisible();
  await expect(page.getByText(/You used 1 hint/)).toBeVisible();
  await page.getByRole("button", { name: "I missed it" }).click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Show the answer" }).click();
  await page.getByRole("button", { name: "I got it" }).click();
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await expect(page.getByText(/1 of 2 correct/)).toBeVisible();
  // Half right in one sitting: the topic now has a (low-confidence) estimate, and it's never "secure".
  await expect(page.getByRole("listitem").filter({ hasText: "Chain rule" })).toContainText("Needs review");

  // Mistakes: what was missed, what the student wrote, and a retry.
  await page.getByRole("link", { name: "Review mistakes" }).click();
  await expect(page.getByRole("heading", { name: "Mistake history" })).toBeVisible();
  await expect(page.getByText("Differentiate sin(x^2)")).toBeVisible();
  await expect(page.locator("p", { hasText: "You wrote:" })).toContainText("cos(x^2)");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForURL(/\/practice\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Retry missed questions" })).toBeVisible();
  await page.getByRole("button", { name: "Show the answer" }).click();
  await page.getByRole("button", { name: "I got it" }).click();
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await page.goto(`${courseUrl}/mistakes`);
  await expect(page.getByRole("heading", { name: /Answered correctly since/ })).toBeVisible();

  // Mastery: grouped by course, honest status, no secure from one sitting.
  await page.goto("/mastery");
  await expect(page.getByRole("heading", { name: "Calculus I" })).toBeVisible();
  await expect(page.getByLabel("Calculus I").getByText("Chain rule")).toBeVisible();
  // Struggling with Chain rule points at its unpracticed prerequisite.
  await expect(page.getByLabel("Biggest gap")).toContainText("Limits is a prerequisite you haven't practiced enough to know");
  await expect(page.getByText("Secure", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/answers correct across/).first()).toBeVisible();

  // Another student can't open any of it.
  const otherContext = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.5" } });
  const other = await otherContext.newPage();
  await newStudent(other, "b");
  for (const path of ["", "/topics", "/practice", "/mistakes", sessionPath]) {
    // Course pages stream (they have a loading state), so the not-found arrives in the body, not the status code.
    await other.goto(`${courseUrl}${path}`);
    await expect(other.getByRole("heading", { name: "Page not found." })).toBeVisible();
    await expect(other.getByText("Calculus I")).toHaveCount(0);
  }
  await otherContext.close();
  await context.close();
});
