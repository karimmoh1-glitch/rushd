import { test, expect, type Page } from "@playwright/test";

// The adaptive planner through the real UI, with AI off: a course with topics
// and real practice answers plus an exam. Two days later (the server clock is
// moved forward with the test-only rushd-test-now cookie, see
// src/lib/time/now.ts) the topics are due for review. Today shows a review
// block, a readiness estimate for the exam, the biggest gap with its
// prerequisite hint, and, after the student skips a block, what changed.

const COURSE = "Planner Chemistry";

async function newStudent(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-planner-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Planner");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  // A custom course (not in the catalog), added from the picker.
  await page.getByRole("combobox", { name: "Search courses" }).pressSequentially(COURSE);
  await page.getByRole("option", { name: /as a custom course/ }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // to the optional details
  await page.getByRole("button", { name: "Continue" }).click(); // to work
  await page.getByRole("button", { name: "Continue" }).click(); // to study time
  // Evenings on weekdays and afternoons on weekends: some time is left at 10 AM any day.
  await page.getByText("Weekday evenings").click();
  await page.getByText("Weekend afternoons").click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function addQuestion(page: Page, topic: string, prompt: string, answer: string) {
  await page.getByRole("button", { name: "Add a question" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Topic").selectOption({ label: topic });
  await dialog.getByLabel("Problem").fill(prompt);
  await dialog.getByLabel("Worked solution").fill(answer);
  await dialog.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("review blocks, readiness, biggest gap, and what changed after a skip", async ({ browser }) => {
  test.setTimeout(240_000);
  const port = Number(process.env.E2E_PORT ?? 3000);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": "127.0.0.3" } });
  const page = await context.newPage();
  await newStudent(page);

  // Real work: an assignment and an exam for the course.
  await page.goto("/dashboard");
  await page
    .getByLabel("Your assignments and tests this week, one per line")
    .fill(`${COURSE}: lab report in 4 days 1h\n${COURSE}: unit quiz in 6 days`);
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });

  // A topic map with a prerequisite, and the student's own questions.
  await page.goto("/courses");
  await page.getByRole("link", { name: COURSE }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: COURSE })).toBeVisible();
  const courseUrl = page.url().replace(/\/$/, "");
  await page.goto(`${courseUrl}/topics`);
  for (const title of ["Stoichiometry", "Gas laws", "Equilibrium"]) {
    await page.getByLabel("New topic").fill(title);
    await page.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit Gas laws" }).click();
  await page.getByRole("dialog").getByLabel("Stoichiometry").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(`${courseUrl}/practice`);
  await addQuestion(page, "Gas laws", "A gas at 2 atm is compressed to half its volume. New pressure?", "4 atm (Boyle's law)");
  await addQuestion(page, "Gas laws", "What happens to volume when temperature doubles at constant pressure?", "It doubles (Charles's law)");
  await addQuestion(page, "Stoichiometry", "How many moles are in 36 g of water?", "2 mol");

  // One practice session: both gas law questions missed, stoichiometry right.
  await page.getByRole("button", { name: "Start a practice session" }).click();
  await page.waitForURL(/\/practice\/[^/]+$/);
  for (let i = 0; i < 3; i++) {
    const prompt = (await page.locator("main").innerText()).toLowerCase();
    await page.getByRole("button", { name: "Show the answer" }).click();
    await page.getByRole("button", { name: prompt.includes("moles") ? "I got it" : "I missed it" }).click();
  }
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();

  // Two days later, at 10 AM: the server clock moves forward for this browser only.
  const later = new Date();
  later.setDate(later.getDate() + 2);
  later.setHours(10, 0, 0, 0);
  await context.addCookies([{ name: "rushd-test-now", value: later.toISOString(), url: `http://localhost:${port}` }]);
  await page.goto("/dashboard");
  await expect(
    page.getByText(later.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), { exact: true }),
    "the dev server needs RUSHD_TEST_CLOCK=1 (playwright.config.ts sets it)",
  ).toBeVisible();

  // A review block on today's plan, with its reason.
  const todayPanel = page.getByRole("region", { name: "Today", exact: true });
  const reviewRow = todayPanel.getByRole("listitem").filter({ hasText: "Gas laws" });
  await expect(reviewRow).toContainText("Review");
  await reviewRow.getByRole("button", { name: "Why now?" }).click();
  await expect(page.getByText(/^Review due: Gas laws/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Readiness for the quiz: an honest estimate from coverage.
  const readiness = page.getByRole("region", { name: "Next assessment" });
  await expect(readiness).toContainText("quiz", { ignoreCase: true });
  await expect(readiness).toContainText("Not enough evidence");
  await expect(readiness).toContainText("You've practiced 2 of 3 topics");
  await expect(readiness).toContainText("Practice Equilibrium: no answers yet.");

  // The biggest gap, its prerequisite, and a way to practice it.
  const gap = page.getByRole("group", { name: "Biggest gap" });
  await expect(gap).toContainText("Gas laws");
  await expect(gap).toContainText("Stoichiometry is a prerequisite you haven't practiced enough to know");
  await expect(gap.getByRole("button", { name: "Practice", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Mastery by course" })).toContainText("1 needs review");

  // Skip the lab report today: the plan moves it and says why.
  await todayPanel.getByRole("button", { name: /^Skip ".*lab report.*" today$/i }).click();
  await expect(page.getByText(/Skipped for today|Heads up/).first()).toBeVisible();
  await page.reload();
  const changed = page.getByRole("region", { name: "What changed" });
  await expect(changed).toContainText(/Moved .*lab report.* because you skipped it today\./i);
  await expect(todayPanel.getByText(/lab report/i)).toHaveCount(0);

  // The schedule shows review blocks distinctly, with their reasons inline, and the same note.
  await page.goto("/plan");
  await expect(page.getByRole("region", { name: "What changed" })).toContainText("because you skipped it today");
  const planReview = page.getByRole("listitem").filter({ hasText: "spaced review" }).first();
  await expect(planReview).toContainText("Review");
  await expect(planReview).toContainText(/Review due: (Gas laws|Stoichiometry)/);

  // "Not this week" from the block menu keeps the quiz prep out until Monday.
  await page.getByRole("button", { name: /^Actions for .*quiz/i }).first().click();
  await page.getByRole("menuitem", { name: "Not this week" }).click();
  await expect(page.getByText(/Off this week|Heads up/).first()).toBeVisible();

  // Dismissing the note keeps it gone.
  await page.goto("/dashboard");
  await page.getByRole("region", { name: "What changed" }).getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("region", { name: "What changed" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "What changed" })).toHaveCount(0);

  // Both pages fit a phone: no horizontal scroll at 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/plan"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > width + 1 && (el as HTMLElement).offsetParent !== null)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 80)} -> ${Math.round(el.getBoundingClientRect().right)}`);
      return { scrollWidth: document.documentElement.scrollWidth, wide };
    });
    expect(overflow.scrollWidth, `${path} overflows: ${overflow.wide.join(" | ")}`).toBeLessThanOrEqual(390);
  }
  await context.close();
});
