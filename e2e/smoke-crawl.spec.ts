import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

// Visits every public and signed-in page as a real new student and fails on
// anything a student would hit as "broken": console errors (including CSP
// violations and hydration mismatches), uncaught page errors, server errors,
// and links on those pages that lead to a 404 or 500.

const PUBLIC_PAGES = [
  "/", "/how-it-works", "/pricing", "/download", "/founder", "/schools", "/tools", "/tools/rank-my-week",
  "/tools/exam-study-planner", "/changelog", "/privacy", "/terms", "/contact", "/login", "/signup",
  "/forgot-password", "/reset-password",
];
const APP_PAGES = [
  "/dashboard", "/plan", "/courses", "/assignments", "/exams", "/practice", "/mastery", "/mastery/habits",
  "/tutor", "/settings", "/integrations/canvas", "/integrations/teams", "/integrations/canvas-calendar",
  "/import", "/profile", "/how-rushd-thinks", "/more", "/upgrade",
];
const FILES = ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/icon.svg", "/apple-icon", "/opengraph-image", "/api/health"];

// Dev-only noise that isn't a defect in the app.
const IGNORED = [/Download the React DevTools/, /\[HMR\]/, /\[Fast Refresh\]/];

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error" && !/Content Security Policy|hydrat/i.test(msg.text())) return;
    if (IGNORED.some((re) => re.test(msg.text()))) return;
    problems.push(`console ${msg.type()} on ${page.url()}: ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => problems.push(`page error on ${page.url()}: ${error.message.slice(0, 300)}`));
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.origin === new URL(page.url() || "http://x").origin && res.status() >= 500) {
      problems.push(`HTTP ${res.status()} for ${url.pathname}`);
    }
  });
  return problems;
}

async function visit(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function sameOriginLinks(page: Page): Promise<string[]> {
  return page.$$eval("a[href]", (as) =>
    as
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((href) => href.startsWith(location.origin))
      .map((href) => new URL(href).pathname),
  );
}

test("every page loads without console errors, CSP violations or broken links", async ({ browser, request }) => {
  test.setTimeout(420_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.3" } });
  const page = await context.newPage();
  const problems = watch(page);
  const links = new Set<string>();

  for (const path of PUBLIC_PAGES) {
    await visit(page, path);
    for (const link of await sameOriginLinks(page)) links.add(link);
  }

  // A real signup and onboarding, then a little real data so detail pages exist.
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-crawl-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Crawler");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday evenings").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("e.g. AP Chemistry").fill("AP Chemistry");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("button", { name: "Go to my plan" }).click();
  await page.waitForURL(/dashboard/);
  await page.getByLabel("Your assignments and tests this week, one per line").fill(
    "AP Chemistry: titration lab report in 2 days 2h\nAP Chemistry quiz in 4 days",
  );
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });

  for (const path of APP_PAGES) {
    await visit(page, path);
    for (const link of await sameOriginLinks(page)) links.add(link);
  }

  // Non-admins are sent away from admin pages, not shown an error.
  for (const path of ["/admin", "/admin/ai", "/admin/growth"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard/);
  }

  for (const path of FILES) {
    const res = await request.get(path);
    expect(res.status(), path).toBeLessThan(400);
  }

  // Every same-origin link seen on those pages resolves (as this student).
  const skip = /^\/(api\/|r\/|s\/)|\/logout/;
  for (const link of [...links].filter((l) => !skip.test(l))) {
    const res = await page.request.get(link, { maxRedirects: 5 });
    if (res.status() >= 400) problems.push(`link ${link} → HTTP ${res.status()}`);
  }

  expect(problems, problems.join("\n")).toEqual([]);
  await context.close();
});
