import { test, expect } from "@playwright/test";

// The homepage promises "Nothing you type leaves your browser." Test the
// behavior, not the copy: record every request while a visitor types, ranks,
// shares, and saves a week, and fail if any URL or body contains what they typed.

const SECRET_LINES = ["Zyxwv chemistry lab tomorrow 2h", "Qrstu calculus quiz friday"];

test("Rank my week never sends what the visitor typed", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const sent: string[] = [];
  page.on("request", (r) => sent.push(`${r.method()} ${r.url()} ${r.postData() ?? ""}`));

  await page.goto("/");
  await page.getByLabel("Your assignments and tests this week, one per line").fill(SECRET_LINES.join("\n"));
  await page.getByRole("button", { name: "Rank it" }).click();
  await expect(page.getByRole("list", { name: "Your week ranked by Pulse" })).toBeVisible();
  await page.getByRole("button", { name: /Share this ranking|Link copied/ }).click();
  await page.getByRole("button", { name: "Save my week, free" }).click();
  await expect(page).toHaveURL(/\/signup/);

  const leaked = sent.filter((line) => /zyxwv|qrstu/i.test(decodeURIComponent(line)));
  expect(leaked, leaked.join("\n")).toEqual([]);
  // Only a step name is ever sent to the counter.
  for (const line of sent.filter((l) => l.includes("/api/pv"))) {
    expect(line).toMatch(/\/api\/pv (?:\/|#)[a-z/#-]*$/);
  }
  await context.close();
});

test("the exam planner never sends what the visitor typed", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => sent.push(`${r.url()} ${r.postData() ?? ""}`));
  await page.goto("/tools/exam-study-planner");
  await page.getByLabel(/Your tests and big assignments/).fill("Zyxwv final in 9 days 4h");
  await page.getByRole("button", { name: "Make my plan" }).click();
  await expect(page.getByText("Zyxwv final").first()).toBeVisible();
  expect(sent.filter((l) => /zyxwv/i.test(decodeURIComponent(l)))).toEqual([]);
});
