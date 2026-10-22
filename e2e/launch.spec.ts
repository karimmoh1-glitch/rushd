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
