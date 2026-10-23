import { test, expect, type Page } from "@playwright/test";

// UI-freeze check, run on demand: VISUAL=1 npx playwright test e2e/visual.spec.ts
// Public pages are compared pixel for pixel (the browser clock is frozen so
// the client-side planners give the same output). Signed-in pages are
// compared by structure: every element's tag, classes, and labels, in order.
// Their content depends on the time of day (what's left of today's study
// time, which blocks are already past), so the signed-in run freezes BOTH
// clocks at the same instant: the browser's (page.clock) and the server's,
// through the test-only rushd-test-now cookie (src/lib/time/now.ts; honored
// only by a non-production server started with RUSHD_TEST_CLOCK=1, which
// playwright.config.ts does).

test.skip(!process.env.VISUAL, "visual checks run only with VISUAL=1");

const FROZEN = new Date("2026-10-22T15:30:00");
const STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

async function prepare(page: Page) {
  await page.clock.setFixedTime(FROZEN);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
}

const PUBLIC = ["/", "/tools", "/tools/rank-my-week", "/tools/exam-study-planner", "/pricing", "/how-it-works", "/privacy", "/terms", "/changelog", "/founder", "/schools", "/download", "/signup", "/login", "/forgot-password"];

for (const width of [1280, 390]) {
  for (const path of PUBLIC) {
    test(`public ${width}px ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await prepare(page);
      await page.goto(path);
      await page.addStyleTag({ content: STILL });
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${width}${path.replace(/\//g, "_") || "_home"}.png`, { fullPage: true, maxDiffPixels: 0 });
    });
  }
}

test("public interactions: ranked week and exam plan", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page);
  await page.goto("/tools/rank-my-week");
  await page.addStyleTag({ content: STILL });
  await page.getByLabel("Your assignments and tests this week, one per line").fill("Chem: lab report Thursday 2h\nCalc quiz Friday\nEnglish essay draft next week 3h");
  await page.getByRole("button", { name: "Rank it" }).click();
  await page.getByRole("button", { name: /Show why/ }).nth(1).click();
  await expect(page).toHaveScreenshot("interaction_ranked.png", { fullPage: true, maxDiffPixels: 0 });
  await page.goto("/tools/exam-study-planner");
  await page.addStyleTag({ content: STILL });
  await page.getByRole("button", { name: "Make my plan" }).click();
  await expect(page).toHaveScreenshot("interaction_exam_plan.png", { fullPage: true, maxDiffPixels: 0 });
});

/** Tag, classes, and accessible attributes of every element in <body>, in order; no text. */
async function structure(page: Page): Promise<string> {
  // Wait for real content, not a loading skeleton (its timing depends on the database).
  await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, { timeout: 15_000 });
  return page.evaluate(() => {
    const out: string[] = [];
    const walk = (el: Element, depth: number) => {
      const attrs = ["role", "aria-label", "aria-current", "aria-pressed", "aria-checked", "type", "href", "name", "placeholder"]
        .map((a) => (el.hasAttribute(a) ? `${a}=${(el.getAttribute(a) ?? "").replace(/\/c[a-z0-9]{15,}/g, "/:id").replace(/\d+/g, "#")}` : ""))
        .filter(Boolean)
        .join(" ");
      out.push(`${"  ".repeat(depth)}${el.tagName.toLowerCase()} .${(el.getAttribute("class") ?? "").trim()} ${attrs}`);
      for (const c of Array.from(el.children)) if (!["SCRIPT", "NEXT-ROUTE-ANNOUNCER", "NEXTJS-PORTAL"].includes(c.tagName)) walk(c, depth + 1);
    };
    walk(document.querySelector("main") ?? document.body, 0);
    return out.join("\n");
  });
}

test("signed-in pages keep the same structure", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": "127.0.0.2" } });
  await context.clock.setFixedTime(FROZEN);
  const port = Number(process.env.E2E_PORT ?? 3000);
  await context.addCookies([{ name: "rushd-test-now", value: FROZEN.toISOString(), url: `http://localhost:${port}` }]);
  const page = await context.newPage();
  await page.goto("/signup");
  await expect(await structure(page)).toMatchSnapshot("struct_signup.txt");
  await page.getByLabel("Email").fill(`e2e-visual-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Visual Tester");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  expect(await structure(page)).toMatchSnapshot("struct_onboarding_1.txt");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Search courses" }).fill("Biology");
  await page.getByRole("combobox", { name: "Search courses" }).press("Enter");
  expect(await structure(page)).toMatchSnapshot("struct_onboarding_2.txt");
  await page.getByRole("button", { name: "Continue" }).click();
  expect(await structure(page)).toMatchSnapshot("struct_onboarding_3.txt");
  await page.getByRole("button", { name: "Continue" }).click();
  expect(await structure(page)).toMatchSnapshot("struct_onboarding_4.txt");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday evenings").click();
  expect(await structure(page)).toMatchSnapshot("struct_onboarding_5.txt");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);
  // The server must be on the frozen clock too, or the comparison below means nothing.
  await expect(
    page.getByText(FROZEN.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), { exact: true }),
    "Start the dev server with RUSHD_TEST_CLOCK=1 (playwright.config.ts does this when it starts the server)",
  ).toBeVisible();
  expect(await structure(page)).toMatchSnapshot("struct_today_empty.txt");
  await page.getByLabel("Your assignments and tests this week, one per line").fill("Biology: lab report in 2 days 2h\nBiology quiz in 4 days");
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByText("Lab report").first()).toBeVisible();
  for (const path of ["/dashboard", "/assignments", "/exams", "/plan", "/courses", "/settings", "/integrations/canvas", "/integrations/canvas-calendar", "/integrations/teams", "/more", "/mastery", "/practice", "/tutor"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await structure(page)).toMatchSnapshot(`struct${path.replace(/\//g, "_")}.txt`);
  }
  await context.close();
});
