import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// The main screens pass axe (WCAG 2 A/AA) in both color schemes, with real data on them.
test("main screens have no axe violations in light or dark", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const colorScheme of ["dark", "light"] as const) {
    const context = await browser.newContext({ colorScheme, extraHTTPHeaders: { "x-forwarded-for": "127.0.0.4" } });
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
    expect(results).toEqual([]);
    await context.close();
  }
});
