import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// The main screens pass axe (WCAG 2 A/AA) in both color schemes, with real data on them.
test("main screens have no axe violations in light or dark", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const colorScheme of ["dark", "light"] as const) {
    const context = await browser.newContext({ colorScheme, extraHTTPHeaders: { "x-forwarded-for": "127.0.0.4" } });
    // The app defaults to dark and keeps the student's choice in localStorage (next-themes).
    await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), colorScheme);
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForTimeout(1500);
    const pages: [string, string][] = [["/", "home"]];
    await page.goto("/signup");
    await page.getByLabel("Email").fill(`e2e-axe-${colorScheme}-${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("checkbox", { name: /13 or older/ }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("What should we call you?").fill("Axe");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Weekday evenings").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("e.g. AP Chemistry").fill("AP Chemistry");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.getByRole("heading", { name: "Your Rushd profile is ready." }).waitFor();
    await page.goto("/dashboard");
    await page.getByLabel("Your assignments and tests this week, one per line").fill("AP Chemistry: lab report tomorrow 2h\nAP Chemistry quiz in 3 days\nEnglish essay in 5 days 1h");
    await page.getByRole("button", { name: "Add and rank" }).click();
    await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });
    pages.push(["/dashboard", "dashboard"], ["/courses", "courses"], ["/assignments", "assignments"]);
    const results: string[] = [];
    for (const [path, name] of pages) {
      await page.goto(path);
      await page.waitForTimeout(1200);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of r.violations) results.push(`${colorScheme} ${name}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    await page.goto("/courses");
    await page.getByRole("link", { name: "AP Chemistry" }).first().click();
    await page.waitForTimeout(1500);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const v of r.violations) results.push(`${colorScheme} course: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

    // The learning screens, with real data: a topic, a question, one answer.
    async function check(name: string) {
      await page.waitForTimeout(1000);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of result.violations) results.push(`${colorScheme} ${name}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    const courseUrl = page.url().replace(/\/$/, "");
    await page.goto(`${courseUrl}/topics`);
    await page.getByLabel("New topic").fill("Stoichiometry");
    await page.getByRole("button", { name: "Add topic" }).click();
    await page.getByRole("heading", { name: "Stoichiometry", level: 3 }).waitFor();
    await check("topics");
    await page.goto(`${courseUrl}/practice`);
    await page.getByRole("button", { name: "Add a question" }).click();
    await page.getByRole("dialog").getByLabel("Problem").fill("How many moles are in 18 g of water?");
    await page.getByRole("dialog").getByLabel("Worked solution").fill("18 g ÷ 18 g/mol = 1 mol");
    await page.getByRole("dialog").getByLabel("Hint (optional)").fill("Use the molar mass of water");
    await check("question dialog");
    await page.getByRole("dialog").getByRole("button", { name: "Add question" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await check("practice");
    await page.getByRole("button", { name: "Start a practice session" }).click();
    await page.waitForURL(/\/practice\/[^/]+$/);
    await page.getByRole("button", { name: "Show a hint" }).click();
    await check("session question");
    await page.getByRole("button", { name: "Show the answer" }).click();
    await check("session answer");
    await page.getByRole("button", { name: "I missed it" }).click();
    await page.getByRole("heading", { name: "Session done" }).waitFor();
    await check("session summary");
    await page.goto(`${courseUrl}/mistakes`);
    await check("mistakes");
    await page.goto("/mastery");
    await check("mastery");
    // Today and the schedule with learning data on them: the readiness
    // estimate, the biggest gap, review blocks two days later, and a
    // "What changed" note after a skip.
    await page.goto("/dashboard");
    await check("dashboard with learning");
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    later.setHours(10, 0, 0, 0);
    await context.addCookies([{ name: "rushd-test-now", value: later.toISOString(), url: new URL(page.url()).origin }]);
    await page.goto("/dashboard");
    const skip = page.getByRole("region", { name: "Today", exact: true }).getByRole("button", { name: /^Skip ".*" today$/ }).first();
    if (await skip.count()) {
      await skip.click();
      await page.waitForTimeout(1500);
      await page.goto("/dashboard");
    }
    await check("dashboard two days later");
    await page.goto("/plan");
    await check("plan two days later");
    await context.clearCookies({ name: "rushd-test-now" });
    expect(results).toEqual([]);
    await context.close();
  }
});
