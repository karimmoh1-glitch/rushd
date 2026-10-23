import { test, expect, type Page } from "@playwright/test";

// The Expo app (mobile/) driven through its web build at phone size, against
// this dev server's /api/v1. Not part of the default run: it needs the app
// exported and served first (see mobile/README.md):
//
//   cd mobile && EXPO_PUBLIC_API_URL=http://localhost:3104 npx expo export --platform web
//   node <static server with index.html fallback> mobile/dist 8104
//   MOBILE_APP_URL=http://localhost:8104 MOBILE_OUT=<dir> E2E_PORT=3104 npx playwright test e2e/mobile-app.spec.ts
//
// The student is created through the real web signup and onboarding (no
// seeded data); the app then signs in with that account. This is a web
// rendering of the React Native app, not an iPhone: it checks layout, flows,
// and the API contract, not native behavior.

const APP = process.env.MOBILE_APP_URL;
const OUT = process.env.MOBILE_OUT ?? "test-results/mobile-app";
const THEME = (process.env.MOBILE_THEME as "dark" | "light" | undefined) ?? "dark";

test.skip(!APP, "runs only with MOBILE_APP_URL (the exported Expo web build)");

async function shoot(page: Page, name: string) {
  await expect(page.getByLabel("Loading", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${THEME}-${name}.png`, fullPage: false });
}

async function createStudent(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Maya");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const picker = page.getByRole("combobox", { name: "Search courses" });
  await picker.pressSequentially("AP Chemistry");
  await picker.press("Enter");
  await page.getByRole("button", { name: "Continue" }).click(); // to the optional details
  await page.getByRole("button", { name: "Continue" }).click(); // to work
  await page.getByRole("button", { name: "Continue" }).click(); // to study time
  await page.getByText("Weekday evenings").click();
  await page.getByText("Weekend afternoons").click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);
  await page.getByLabel("Your assignments and tests this week, one per line").fill(
    "AP Chemistry: titration lab report in 2 days 2h\nPrecalc: problem set 5.3 tomorrow 45m\nAP Chemistry quiz in 4 days\nEnglish: Gatsby essay draft in 6 days 3h",
  );
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });

  // One course with a level, code, term, and weekly goal, through the web's course dialog.
  await page.goto("/courses");
  await page.locator("#main-content").getByRole("button", { name: "Add course" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Course" }).fill("calc ab");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByLabel("Course code (optional)").fill("MATH 210");
  await page.getByRole("dialog").getByRole("button", { name: "Add course" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Options for AP Calculus AB" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByText("Term and study time (optional)").click();
  await edit.getByLabel("Term starts").fill("2026-08-25");
  await edit.getByLabel("Term ends").fill("2026-12-18");
  await edit.getByLabel("Study time you want for this course").fill("4");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Scrolls the app's main scroll view (a div on web) and shoots what's below the fold. */
async function shootScrolled(page: Page, name: string, distance = 800) {
  await page.mouse.move(195, 420);
  await page.mouse.wheel(0, distance);
  await page.waitForTimeout(400);
  await shoot(page, name);
  await page.mouse.wheel(0, -5000);
}

test("mobile app at phone size", async ({ browser }) => {
  test.setTimeout(240_000);
  const email = `e2e-mobile-${Date.now()}@example.com`;

  const web = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.3" } });
  await createStudent(await web.newPage(), email);
  await web.close();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: THEME,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(APP!);
  await expect(page.getByText("Know what to do next.")).toBeVisible({ timeout: 30_000 });
  await shoot(page, "01-sign-in");

  // Wrong password: the server's generic message.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await shoot(page, "02-sign-in-error");

  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Next up", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await shoot(page, "03-today");
  await shootScrolled(page, "03-today-lower", 700);
  await shootScrolled(page, "03-today-bottom", 1600);

  // Assignments: ranked list, mark one done.
  await page.getByRole("tab", { name: /Assignments/ }).click();
  await expect(page.getByText("Ranked by Pulse", { exact: false })).toBeVisible();
  await shoot(page, "04-assignments");
  const check = page.getByRole("checkbox", { name: /Mark problem set 5.3 as done/i });
  await check.click();
  await expect(page.getByRole("checkbox", { name: /Mark problem set 5.3 as not done/i })).toBeVisible();
  await page.waitForTimeout(400);
  await shoot(page, "05-assignment-done");

  // Add an assignment.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Title")).toBeVisible();
  await page.getByLabel("Title").fill("Reading notes ch. 4");
  await shoot(page, "06-add-assignment");
  await page.getByRole("button", { name: "Add assignment" }).click();
  await expect(page.getByText("Reading notes ch. 4")).toBeVisible({ timeout: 15_000 });

  // Courses and one course.
  await page.getByRole("tab", { name: /Courses/ }).click();
  await expect(page.getByRole("button", { name: /AP Chemistry/ }).first()).toBeVisible();
  await expect(page.getByText("Week", { exact: false }).first()).toBeVisible();
  await shoot(page, "07-courses");
  await page.getByRole("button", { name: /AP Chemistry/ }).first().click();
  await expect(page.getByText("Open work")).toBeVisible();
  await shoot(page, "08-course");

  // Start a session from Today, then complete it.
  await page.goto(APP!);
  await expect(page.getByRole("button", { name: "Start session" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Finish session" })).toBeVisible({ timeout: 15_000 });
  await shoot(page, "09-session");
  await page.getByRole("button", { name: "Finish session" }).click();
  await page.getByLabel("Minutes you actually studied").fill("25");
  await page.getByRole("radio", { name: "Harder" }).click();
  await shoot(page, "10-session-complete-form");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByText("Session saved.")).toBeVisible();
  await shoot(page, "11-session-saved");

  // Abandon path.
  await page.goto(APP!);
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Stop without finishing" }).click();
  await page.getByRole("radio", { name: "Got distracted" }).click();
  await shoot(page, "12-session-abandon");
  await page.getByRole("button", { name: "Stop session" }).click();
  await expect(page.getByText("Session stopped")).toBeVisible();

  // Settings and sign out.
  await page.goto(APP!);
  await page.getByRole("tab", { name: /Settings/ }).click();
  await expect(page.getByText(email)).toBeVisible();
  await shoot(page, "13-settings");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page.getByText("Know what to do next.")).toBeVisible({ timeout: 15_000 });

  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("mobile app: new account, empty states, and lost connection", async ({ browser }) => {
  test.setTimeout(120_000);
  const email = `e2e-mobile-empty-${Date.now()}@example.com`;
  // A real account that only signed up (no onboarding, no courses, no work).
  const web = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "127.0.0.3" } });
  const webPage = await web.newPage();
  await webPage.goto("/signup");
  await webPage.getByLabel("Email").fill(email);
  await webPage.getByLabel("Password").fill("password123");
  await webPage.getByRole("checkbox", { name: /13 or older/ }).check();
  await webPage.getByRole("button", { name: "Create account" }).click();
  await webPage.waitForURL(/onboarding/);
  await web.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: THEME, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(APP!);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Finish setting up on the web")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nothing to plan yet")).toBeVisible();
  await shoot(page, "20-today-new-account");
  await page.getByRole("tab", { name: /Assignments/ }).click();
  await expect(page.getByText("Your workload starts here")).toBeVisible();
  await shoot(page, "21-assignments-empty");
  await page.getByRole("tab", { name: /Courses/ }).click();
  await expect(page.getByText("No courses yet")).toBeVisible();
  await shoot(page, "22-courses-empty");

  // The API becomes unreachable: a fresh load shows the error state, with a retry.
  const api = "**/api/v1/**";
  await page.route(api, (route) => route.abort("internetdisconnected"));
  await page.goto(APP!);
  await expect(page.getByText("You're offline", { exact: true })).toBeVisible({ timeout: 20_000 });
  await shoot(page, "23-today-offline");
  await page.unroute(api);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Finish setting up on the web")).toBeVisible({ timeout: 20_000 });
  await context.close();
});
