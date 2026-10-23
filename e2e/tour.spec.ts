import { test, expect, type Page } from "@playwright/test";

// Design review screenshots, on demand: TOUR=1 TOUR_OUT=/some/dir npx playwright test e2e/tour.spec.ts
// Builds a realistic student through the real UI (no seeded fake data), then
// captures the main screens on desktop and phone.

test.skip(!process.env.TOUR, "design tour runs only with TOUR=1");

const OUT = process.env.TOUR_OUT ?? "test-results/tour";

async function shoot(page: Page, name: string) {
  await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test("design tour", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: "dark", extraHTTPHeaders: { "x-forwarded-for": "127.0.0.4" } });
  if (process.env.TOUR_THEME) await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), process.env.TOUR_THEME);
  const page = await context.newPage();

  await page.goto("/");
  await page.waitForTimeout(6500);
  await page.screenshot({ path: `${OUT}/d-home-fold.png` });
  await shoot(page, "d-home-full");

  await page.goto("/signup");
  await shoot(page, "d-signup");
  await page.getByLabel("Email").fill(`e2e-tour-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Maya");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await shoot(page, "d-onboarding-1");
  await page.getByRole("button", { name: "Continue" }).click();
  const picker = page.getByRole("combobox", { name: "Search courses" });
  await picker.pressSequentially("AP Chem");
  await picker.press("Enter");
  await picker.pressSequentially("calc");
  await shoot(page, "d-onboarding-picker");
  await picker.press("Escape");
  await shoot(page, "d-onboarding-picker-empty");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Add details for AP Chemistry" }).click();
  await shoot(page, "d-onboarding-details");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Assignments and exams, one per line").fill("Chem: titration lab report in 2 days 2h\nAPUSH: DBQ outline in 3 days 1h");
  await page.getByRole("button", { name: "Add to my list" }).click();
  await shoot(page, "d-onboarding-work");
  // Today's "What's due" box is part of the tour too, so start the week empty.
  await page.getByRole("button", { name: /^Remove / }).first().click();
  await page.getByRole("button", { name: /^Remove / }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday evenings").click();
  await page.getByText("Weekend afternoons").click();
  await shoot(page, "d-onboarding-2");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);
  await shoot(page, "d-today-empty");

  await page.getByLabel("Your assignments and tests this week, one per line").fill(
    "AP Chemistry: titration lab report in 2 days 2h\nPrecalc: problem set 5.3 tomorrow 45m\nAP Chemistry quiz in 4 days\nEnglish: Gatsby essay draft in 6 days 3h\nAPUSH: DBQ outline in 3 days 1h",
  );
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });
  await page.goto("/dashboard");
  await expect(page.getByText("Next up", { exact: false }).first()).toBeVisible();
  await shoot(page, "d-today");

  await page.goto("/courses");
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Course" }).fill("calc ab");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/d-course-dialog.png` });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByLabel("Course code (optional)").fill("MATH 210");
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Give one course a term and a weekly goal through the edit dialog.
  await page.getByRole("button", { name: "Options for AP Calculus AB" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByText("Term and study time (optional)").click();
  await edit.getByLabel("Term starts").fill("2026-08-25");
  await edit.getByLabel("Term ends").fill("2026-12-18");
  await edit.getByLabel("Study time you want for this course").fill("4");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await shoot(page, "d-courses");
  await page.getByRole("link", { name: "AP Chemistry" }).first().click();
  await shoot(page, "d-course-page");
  await page.goto("/courses");
  await page.getByRole("link", { name: "AP Calculus AB" }).click();
  await shoot(page, "d-course-page-term");
  const calcUrl = page.url().replace(/\/$/, "");

  // Learning core: a topic map, own questions, one session, mistakes.
  await page.goto(`${calcUrl}/topics`);
  await shoot(page, "d-course-topics-empty");
  for (const title of ["Limits", "Derivatives"]) {
    await page.getByLabel("New topic").fill(title);
    await page.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
  }
  for (const title of ["Chain rule", "Product rule"]) {
    await page.getByLabel("New topic").fill(title);
    await page.getByLabel("Inside").selectOption({ label: "Derivatives" });
    await page.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit Chain rule" }).click();
  await page.getByRole("dialog").getByLabel("Limits").check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/d-topic-dialog.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`${calcUrl}/practice`);
  await shoot(page, "d-course-practice-empty");
  const questions: [string, string, string][] = [
    ["Chain rule", "Differentiate sin(x^2)", "2x cos(x^2)"],
    ["Chain rule", "Differentiate (3x + 1)^5", "15(3x + 1)^4"],
    ["Limits", "Evaluate the limit of (x^2 - 1)/(x - 1) as x approaches 1", "Factor: (x - 1)(x + 1)/(x - 1) = x + 1, so the limit is 2"],
  ];
  for (const [topic, prompt, answer] of questions) {
    await page.getByRole("button", { name: "Add a question" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Topic").selectOption({ label: topic });
    await dialog.getByLabel("Problem").fill(prompt);
    await dialog.getByLabel("Worked solution").fill(answer);
    if (prompt.includes("sin")) await dialog.getByLabel("Hint (optional)").fill("Outer derivative times inner derivative");
    if (prompt.includes("sin")) await page.screenshot({ path: `${OUT}/d-question-dialog.png` });
    await dialog.getByRole("button", { name: "Add question" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await shoot(page, "d-course-practice");
  await page.getByRole("button", { name: "Start a practice session" }).click();
  await page.waitForURL(/\/practice\/[^/]+$/);
  const sessionUrl = page.url();
  await page.getByLabel(/Your answer/).fill("cos(x^2)");
  await page.getByRole("button", { name: "Fairly sure" }).click();
  if (await page.getByRole("button", { name: "Show a hint" }).count()) await page.getByRole("button", { name: "Show a hint" }).click();
  await shoot(page, "d-practice-question");
  await page.getByRole("button", { name: "Show the answer" }).click();
  await shoot(page, "d-practice-answer");
  await page.getByRole("button", { name: "I missed it" }).click();
  await page.getByRole("button", { name: "Show the answer" }).click();
  await page.getByRole("button", { name: "I got it" }).click();
  await page.getByRole("button", { name: "Show the answer" }).click();
  await page.getByRole("button", { name: "Partly" }).click();
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await shoot(page, "d-practice-summary");
  await page.goto(`${calcUrl}/mistakes`);
  await shoot(page, "d-course-mistakes");
  await page.goto(`${calcUrl}/topics`);
  await shoot(page, "d-course-topics");
  await page.goto(calcUrl);
  await shoot(page, "d-course-page-learning");

  for (const [path, name] of [
    ["/assignments", "d-assignments"],
    ["/exams", "d-exams"],
    ["/plan", "d-plan"],
    ["/tutor", "d-tutor"],
    ["/practice", "d-practice"],
    ["/mastery", "d-mastery"],
    ["/settings", "d-settings"],
  ] as const) {
    await page.goto(path);
    await shoot(page, name);
  }

  // Start and finish one study session, through the real flow.
  await page.goto("/assignments");
  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/d-session-running.png` });

  // Phone.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, name] of [
    ["/dashboard", "m-today"],
    ["/assignments", "m-assignments"],
    ["/courses", "m-courses"],
    ["/plan", "m-plan"],
    ["/more", "m-more"],
    ["/settings", "m-settings"],
  ] as const) {
    await page.goto(path);
    await shoot(page, name);
  }
  await page.goto("/courses");
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/m-course-sheet.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Add several at once" }).click();
  const multi = page.getByRole("dialog").getByRole("combobox", { name: "Search courses" });
  await multi.pressSequentially("bio");
  await multi.press("Enter");
  await multi.pressSequentially("span");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/m-course-multi.png` });
  await page.keyboard.press("Escape");
  for (const [path, name] of [
    [calcUrl, "m-course-page"],
    [`${calcUrl}/topics`, "m-course-topics"],
    [`${calcUrl}/practice`, "m-course-practice"],
    [`${calcUrl}/mistakes`, "m-course-mistakes"],
    ["/mastery", "m-mastery"],
  ] as const) {
    await page.goto(path);
    await shoot(page, name);
  }
  await page.goto(`${calcUrl}/practice`);
  await page.getByRole("button", { name: "Start a practice session" }).click();
  await page.waitForURL((url) => url.href !== sessionUrl && /\/practice\/[^/]+$/.test(url.pathname));
  await page.getByRole("button", { name: "Show the answer" }).click();
  await shoot(page, "m-practice-answer");
  await context.close();

  // Onboarding on a phone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", extraHTTPHeaders: { "x-forwarded-for": "127.0.0.4" } });
  if (process.env.TOUR_THEME) await phone.addInitScript((theme) => window.localStorage.setItem("theme", theme), process.env.TOUR_THEME);
  const m = await phone.newPage();
  await m.goto("/signup");
  await m.getByLabel("Email").fill(`e2e-tour-m-${Date.now()}@example.com`);
  await m.getByLabel("Password").fill("password123");
  await m.getByRole("checkbox", { name: /13 or older/ }).check();
  await m.getByRole("button", { name: "Create account" }).click();
  await m.getByRole("radio", { name: "Undergraduate", exact: true }).check();
  await shoot(m, "m-onboarding-level");
  await m.getByRole("button", { name: "Continue" }).click();
  const mp = m.getByRole("combobox", { name: "Search courses" });
  for (const course of ["orgo", "data struct", "linear alg"]) {
    await mp.pressSequentially(course);
    await mp.press("Enter");
  }
  await mp.pressSequentially("calc");
  await m.waitForTimeout(300);
  await m.screenshot({ path: `${OUT}/m-onboarding-picker.png` });
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByRole("button", { name: "Add details for Data Structures" }).click();
  await shoot(m, "m-onboarding-details");
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByLabel("Assignments and exams, one per line").fill("Orgo: problem set 4 tomorrow 2h\nData structures midterm in 6 days 3h");
  await m.getByRole("button", { name: "Add to my list" }).click();
  await shoot(m, "m-onboarding-work");
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByText("Weekday evenings").click();
  await shoot(m, "m-onboarding-time");
  await m.getByRole("button", { name: "Finish setup" }).click();
  await m.waitForURL(/dashboard/);
  await shoot(m, "m-today-after-onboarding");
  await phone.close();

  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })).newPage();
  await guest.goto("/");
  await guest.waitForTimeout(6500);
  await guest.screenshot({ path: `${OUT}/m-home-fold.png` });
  await shoot(guest, "m-home-full");
});
