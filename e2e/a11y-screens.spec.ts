import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedReviewData } from "./review-seed";
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
    // Public and auth pages, signed out.
    const signedOut: string[] = [];
    for (const path of ["/login", "/signup", "/forgot-password", "/reset-password", "/contact", "/pricing", "/schools", "/download", "/founder"]) {
      await page.goto(path);
      await page.waitForTimeout(800);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of r.violations) signedOut.push(`${colorScheme} ${path}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    const email = `e2e-axe-${colorScheme}-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("checkbox", { name: /13 or older/ }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    const results: string[] = [...signedOut];
    async function axe(name: string) {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of r.violations) results.push(`${colorScheme} ${name}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    // Every onboarding step, including the course picker with results and chips.
    await page.getByLabel("What should we call you?").fill("Axe");
    await page.getByRole("radio", { name: "AP", exact: true }).check();
    await axe("onboarding-level");
    await page.getByRole("button", { name: "Continue" }).click();
    const picker = page.getByRole("combobox", { name: "Search courses" });
    await picker.fill("AP Chemistry");
    await picker.press("Enter");
    await picker.fill("calc");
    await page.waitForTimeout(300);
    await axe("onboarding-courses");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Add details for AP Chemistry" }).click();
    await axe("onboarding-details");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Assignments and exams, one per line").fill("Chem: lab report tomorrow 2h");
    await page.getByRole("button", { name: "Add to my list" }).click();
    await axe("onboarding-work");
    // Today's own "What's due" box is checked below, so start with nothing due.
    await page.getByRole("button", { name: "Remove Lab report" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Weekday evenings").click();
    await axe("onboarding-study-time");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.waitForURL(/dashboard/);
    await page.getByLabel("Your assignments and tests this week, one per line").fill("AP Chemistry: lab report tomorrow 2h\nAP Chemistry quiz in 3 days\nEnglish essay in 5 days 1h");
    await page.getByRole("button", { name: "Add and rank" }).click();
    await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });
    // Seeded like a real account would have them: a Canvas assignment with a rubric and a draft review, a practice check, study sessions, admin.
    const seeded = await seedReviewData(email);
    pages.push(
      ["/dashboard", "dashboard"], ["/courses", "courses"], ["/assignments", "assignments"], ["/settings", "settings"],
      ["/exams", "exams"], [`/assignments/${seeded.assignmentId}`, "assignment detail"], ["/practice", "practice landing"],
      [`/practice/${seeded.assessmentId}`, "practice result"], ["/mastery/habits", "progress"], ["/more", "more"], ["/profile", "profile"],
      ["/integrations/canvas", "canvas"], ["/integrations/canvas-calendar", "canvas calendar"], ["/integrations/teams", "teams"],
      ["/upgrade", "upgrade"], ["/admin", "admin"],
    );
    for (const [path, name] of pages) {
      await page.goto(path);
      await page.waitForTimeout(1200);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of r.violations) results.push(`${colorScheme} ${name}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    // The multi-course picker in the Courses dialog.
    await page.goto("/courses");
    await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Add several at once" }).click();
    await page.getByRole("dialog").getByRole("combobox", { name: "Search courses" }).fill("bio");
    await page.waitForTimeout(400);
    await axe("courses-multi-picker");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
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
    expect(results).toEqual([]);
    await context.close();
  }
});
