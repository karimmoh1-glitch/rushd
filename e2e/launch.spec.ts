import { test, expect } from "@playwright/test";

test("founder page is server-rendered, indexable, and in the sitemap", async ({ request }) => {
  const html = await (await request.get("/founder")).text();
  expect(html).toContain("<title>Karim Mohamed, Founder of Rushd</title>");
  expect(html).toContain('rel="canonical"');
  expect(html).toContain("The problem");
  expect(html).toContain('"@type":"ProfilePage"');
  expect(html).not.toContain("noindex");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/founder</loc>");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).not.toMatch(/Disallow: \/founder/);
});

test("homepage explains the product without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Master any subject." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start learning free" }).first()).toBeVisible();
  await expect(page.getByText("Demo with example content")).toBeVisible();
  await expect(page.getByText("Review the chain rule with trig").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Example week ranked by Pulse" })).toBeVisible();
  await context.close();
});

test("a school can send an inquiry", async ({ page }) => {
  await page.goto("/schools");
  await page.getByLabel("Name").fill("E2E Teacher");
  await page.getByLabel("Work email").fill(`e2e-school-${Date.now()}@example.com`);
  await page.getByLabel("Role").fill("Teacher");
  await page.getByLabel("School or organization").fill("Playwright High");
  await page.getByLabel("What would you like Rushd to help with?").fill("A pilot with one chemistry class next term.");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByText("Thanks, we've got it.")).toBeVisible();
});

test("signed-in student: practice, mastery, tutor preferences, and plan limits", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-launch-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Launch Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: "Check my work" }).click();

  await expect(page).toHaveURL(/\/practice/);
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();

  await page.goto("/mastery");
  await expect(page.getByText("No evidence yet")).toBeVisible();

  await page.goto("/settings#tutor");
  await expect(page.getByText("Free plan")).toBeVisible();
  await expect(page.getByText("0 / 15")).toBeVisible();
  await page.getByLabel("In your own words").fill("Start with hints before giving me the solution.");
  await page.getByRole("button", { name: "Hints first" }).click();
  await page.getByRole("button", { name: "Save tutor preferences" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("In your own words")).toHaveValue("Start with hints before giving me the solution.");
  await expect(page.getByRole("button", { name: "Hints first" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/upgrade?plan=PLUS");
  await expect(page.getByRole("heading", { name: "Upgrade to Plus" })).toBeVisible();
});

test("the live planner demo moved to How it works", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText("Everything fits before its deadline.")).toBeVisible();
});

test("a visitor ranks their week, signs up, and keeps it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your assignments and tests this week, one per line").fill("Bio: lab report tomorrow 2h\nCalc quiz friday");
  await page.getByRole("button", { name: "Rank it" }).click();
  await expect(page.getByRole("list", { name: "Your week ranked by Pulse" }).getByText("Lab report")).toBeVisible();
  await page.getByRole("button", { name: "Save my week, free" }).click();
  await expect(page).toHaveURL(/\/signup\?from=try/);

  await page.getByLabel("Email").fill(`e2e-try-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Try Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: "Add the week I ranked" }).click();

  await expect(page.getByText("Add the 2 items you ranked?")).toBeVisible();
  await page.getByRole("button", { name: "Add them" }).click();
  await expect(page.getByText("Add the 2 items you ranked?")).toBeHidden();
  await page.goto("/assignments");
  await expect(page.getByText("Lab report")).toBeVisible();
  await page.goto("/exams");
  await expect(page.getByText("Calc quiz")).toBeVisible();
});

test("an invite link credits the inviter when a friend joins", async ({ browser }) => {
  test.setTimeout(90_000);
  async function signUp(page: import("@playwright/test").Page, email: string) {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("checkbox", { name: /13 or older/ }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("What should we call you?").fill("Invite Tester");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page.getByRole("heading", { name: "Your Rushd profile is ready." })).toBeVisible();
  }
  const stamp = Date.now();
  const inviter = await (await browser.newContext()).newPage();
  await signUp(inviter, `e2e-inviter-${stamp}@example.com`);
  await inviter.goto("/settings#invite");
  const link = (await inviter.locator("#invite code").innerText()).trim();
  expect(link).toMatch(/\/r\/[a-z2-9]{8}$/);

  const friend = await (await browser.newContext()).newPage();
  await friend.goto(new URL(link).pathname);
  await expect(friend.getByText("A friend invited you to Rushd.")).toBeVisible();
  await friend.goto("/signup");
  await expect(friend.getByText(/A friend invited you\. Study once/)).toBeVisible();
  await signUp(friend, `e2e-friend-${stamp}@example.com`);

  await inviter.reload();
  await expect(inviter.getByText(/1 joined · 0 studied/)).toBeVisible();
});

test("first visit: the hero types an example week and ranks it by itself", async ({ page }) => {
  await page.goto("/");
  const ranked = page.getByRole("list", { name: "Your week ranked by Pulse" });
  await expect(ranked).toBeVisible({ timeout: 8000 });
  await expect(ranked.getByRole("listitem")).toHaveCount(5);
  await page.getByRole("button", { name: "Now type yours" }).click();
  await expect(page.getByLabel("Your assignments and tests this week, one per line")).toHaveValue("");
});

test("reduced motion: nothing plays by itself", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForTimeout(3500);
  await expect(page.getByRole("list", { name: "Your week ranked by Pulse" })).toHaveCount(0);
  await context.close();
});

test("a new student types their week on Today and gets it ranked", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-start-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Start Tester");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: "Go to my plan" }).click();
  await page.getByLabel("Your assignments and tests this week, one per line").fill("Chem: titration lab tomorrow 1h\nSpanish quiz friday");
  await expect(page.getByText("2 items in Chem, Spanish.")).toBeVisible();
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden();
  await expect(page.getByText("Titration lab").first()).toBeVisible();
});
