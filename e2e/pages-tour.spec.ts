import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "@neondatabase/serverless";
import { configureNeon } from "./db";

// Design review screenshots for the pages outside the main tour, on demand:
//   TOUR=1 TOUR_OUT=/some/dir [TOUR_THEME=light] npx playwright test e2e/pages-tour.spec.ts
// A real signup builds the student. What the UI can't create locally (a Canvas
// assignment with its rubric, a saved draft review, a practice check, finished
// study sessions, the admin flag) is seeded the way course-content.spec.ts does;
// the e2e teardown deletes the account and everything under it.

test.skip(!process.env.TOUR, "design tour runs only with TOUR=1");

const OUT = process.env.TOUR_OUT ?? "test-results/pages-tour";

async function shoot(page: Page, name: string) {
  await expect(page.locator('[aria-label^="Loading"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.log(`OVERFLOW ${name}: ${overflow}px`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

const PUBLIC = [
  "/how-it-works", "/pricing", "/tools", "/tools/rank-my-week", "/tools/exam-study-planner", "/schools", "/founder",
  "/changelog", "/download", "/privacy", "/terms", "/contact", "/login", "/signup", "/forgot-password", "/reset-password",
];

async function seed(email: string) {
  configureNeon();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    const userId = users[0].id as string;
    await pool.query(`UPDATE "User" SET "isAdmin" = true WHERE id = $1`, [userId]);
    const { rows: classes } = await pool.query(`SELECT id, name, color FROM "Class" WHERE "userId" = $1 ORDER BY "createdAt" LIMIT 1`, [userId]);
    const course = classes[0] as { id: string; name: string; color: string };
    const assignmentId = randomUUID();
    await pool.query(
      `INSERT INTO "Assignment" (id, "userId", "classId", title, "dueAt", source, "canvasCourseId", "canvasAssignmentId", "estimatedMinutes", "updatedAt")
       VALUES ($1, $2, $3, 'Titration lab report (Canvas)', now() + interval '5 days', 'CANVAS', '1', '101', 120, now())`,
      [assignmentId, userId, course.id],
    );
    const rubric = [
      { id: "_1", description: "Procedure", longDescription: "Steps are complete and someone else could repeat them", points: 10, ratings: [{ id: "a", description: "Complete and reproducible", longDescription: "", points: 10 }, { id: "b", description: "Missing steps", longDescription: "", points: 5 }] },
      { id: "_2", description: "Error analysis", longDescription: "", points: 5, ratings: [] },
    ];
    await pool.query(
      `INSERT INTO "CourseMaterial" (id, "userId", "classId", "canvasCourseId", kind, "canvasId", title, body, rubric, "assignmentId", "postedAt", "syncedAt")
       VALUES ($1, $2, $3, '1', 'ASSIGNMENT', '101', 'Titration lab report', $4, $5::jsonb, $6, now(), now())`,
      [randomUUID(), userId, course.id, "Write up the titration with a full error analysis.\n\nInclude your raw burette readings and one paragraph on sources of error.", JSON.stringify(rubric), assignmentId],
    );
    const review = {
      criteria: [
        { id: "_1", description: "Procedure", points: 10, assessed: true, low: 7, high: 9, evidence: ["We added NaOH until the solution turned pink"], working: "The steps are in order.", toImprove: "Say how fast you added the titrant near the endpoint." },
        { id: "_2", description: "Error analysis", points: 5, assessed: true, low: 2, high: 3, evidence: ["There might be some error"], working: "You name that error exists.", toImprove: "Name a specific source and which way it moves the result." },
      ],
      totalPoints: 15, estimateLow: 9, estimateHigh: 12, summary: "The procedure is clear; the error analysis is thin.", nextSteps: ["Name one systematic error"], droppedQuotes: 0, model: "tour",
    };
    await pool.query(
      `INSERT INTO "DraftReview" (id, "userId", "assignmentId", label, "draftText", result) VALUES ($1, $2, $3, 'Draft 1', 'draft', $4::jsonb)`,
      [randomUUID(), userId, assignmentId, JSON.stringify(review)],
    );
    const assessmentId = randomUUID();
    const result = {
      subject: "Chemistry", topic: "Stoichiometry", gradable: 4, estimate: 62, low: 50, high: 75, confidence: "medium",
      items: [
        { label: "1", verdict: "correct", difficulty: "basic", note: "Moles from grams, done right." },
        { label: "2", verdict: "partially_correct", difficulty: "standard", note: "Right ratio, but the units were dropped." },
        { label: "3", verdict: "incorrect", difficulty: "standard", note: "Used the mass ratio instead of the mole ratio." },
        { label: "4", verdict: "correct", difficulty: "challenging", note: "Limiting reagent found." },
      ],
      summary: "Solid on converting grams to moles; mole ratios from the balanced equation need work.",
      strongestSkill: "Converting grams to moles",
      gaps: [{ concept: "Mole ratios", prerequisite: "Balancing equations", evidence: "Problem 3 used 2:1 by mass" }],
      nextActions: ["Redo problem 3 with the mole ratio", "Balance three equations before your next check"],
      practice: [{ question: "How many moles of O2 react with 4 mol of H2?", concept: "Mole ratios" }],
      searchPhrases: ["mole ratio stoichiometry"], model: "tour", resources: [],
    };
    await pool.query(
      `INSERT INTO "Assessment" (id, "userId", "classId", source, subject, topic, "topicKey", "itemsAssessed", "estimateLow", "estimateHigh", confidence, result)
       VALUES ($1, $2, $3, 'text', 'Chemistry', 'Stoichiometry', 'chemistry:stoichiometry', 4, 50, 75, 'medium', $4::jsonb)`,
      [assessmentId, userId, course.id, JSON.stringify(result)],
    );
    // Finished study sessions over the last two weeks, for Progress.
    const sessions: [number, number, number, string, string][] = [
      [13, 60, 75, "COMPLETED", "HARDER"], [11, 45, 40, "COMPLETED", "AS_EXPECTED"], [9, 30, 35, "COMPLETED", "AS_EXPECTED"],
      [6, 60, 80, "COMPLETED", "HARDER"], [4, 45, 30, "ABANDONED", "AS_EXPECTED"], [2, 30, 30, "COMPLETED", "EASIER"], [1, 60, 70, "COMPLETED", "AS_EXPECTED"],
    ];
    for (const [daysAgo, planned, actual, status, difficulty] of sessions) {
      await pool.query(
        `INSERT INTO "StudySession" (id, "userId", source, title, "plannedMinutes", "predictedScore", "reasonCode", "className", "classColor", "startedAt", "endedAt", "actualMinutes", status, "perceivedDifficulty")
         VALUES ($1, $2, 'MANUAL', 'Study', $3, 0.5, 'tour', $4, $5, now() - ($6 || ' days')::interval - interval '5 hours', now() - ($6 || ' days')::interval - interval '4 hours', $7, $8::"StudySessionStatus", $9::"PerceivedDifficulty")`,
        [randomUUID(), userId, planned, course.name, course.color, String(daysAgo), actual, status, difficulty],
      );
    }
    const { rows: manual } = await pool.query(`SELECT id FROM "Assignment" WHERE "userId" = $1 AND source <> 'CANVAS' ORDER BY "dueAt" LIMIT 1`, [userId]);
    return { assignmentId, assessmentId, manualAssignmentId: manual[0]?.id as string | undefined };
  } finally {
    await pool.end();
  }
}

test("pages tour", async ({ browser }) => {
  test.setTimeout(600_000);
  const theme = process.env.TOUR_THEME ?? "dark";
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: theme === "light" ? "light" : "dark", extraHTTPHeaders: { "x-forwarded-for": "127.0.0.5" } });
  await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
  const page = await context.newPage();

  for (const [width, prefix] of [[1360, "d"], [390, "m"]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of PUBLIC) {
      await page.goto(path);
      await shoot(page, `${prefix}-public${path.replace(/\//g, "-")}`);
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });

  const email = `e2e-pages-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("What should we call you?").fill("Maya");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  const picker = page.getByRole("combobox", { name: "Search courses" });
  for (const course of ["AP Chem", "AP Calculus AB", "AP U.S. History"]) {
    await picker.pressSequentially(course);
    await picker.press("Enter");
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday evenings").click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/dashboard/);

  // Empty states first.
  const empty = ["/assignments", "/exams", "/practice", "/mastery/habits", "/courses"];
  for (const [width, prefix] of [[1360, "d"], [390, "m"]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of empty) {
      await page.goto(path);
      await shoot(page, `${prefix}-empty${path.replace(/\//g, "-")}`);
    }
  }
  await page.setViewportSize({ width: 1360, height: 900 });

  await page.goto("/dashboard");
  await page.getByLabel("Your assignments and tests this week, one per line").fill(
    "AP Chemistry: titration lab report in 2 days 2h\nAP Calculus AB: problem set 5.3 tomorrow 45m\nAP Chemistry quiz in 4 days\nAP U.S. History: DBQ outline in 3 days 1h\nAP Calculus AB unit test in 9 days\nAP U.S. History: reading notes yesterday 30m",
  );
  await page.getByRole("button", { name: "Add and rank" }).click();
  await expect(page.getByRole("heading", { name: "What's due this week?" })).toBeHidden({ timeout: 15_000 });
  const ids = await seed(email);

  const screens: [string, string][] = [
    ["/assignments", "assignments"],
    [`/assignments/${ids.assignmentId}`, "assignment-canvas"],
    ...(ids.manualAssignmentId ? [[`/assignments/${ids.manualAssignmentId}`, "assignment-manual"] as [string, string]] : []),
    ["/exams", "exams"],
    ["/mastery/habits", "habits"],
    ["/practice", "practice"],
    [`/practice/${ids.assessmentId}`, "practice-result"],
    ["/courses", "courses"],
    ["/settings", "settings"],
    ["/more", "more"],
    ["/profile", "profile"],
    ["/integrations/canvas", "integrations-canvas"],
    ["/integrations/canvas-calendar", "integrations-canvas-calendar"],
    ["/integrations/teams", "integrations-teams"],
    ["/upgrade", "upgrade"],
    ["/admin", "admin"],
    ["/admin/ai", "admin-ai"],
    ["/admin/growth", "admin-growth"],
  ];
  for (const [width, prefix] of [[1360, "d"], [390, "m"]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [path, name] of screens) {
      await page.goto(path);
      await shoot(page, `${prefix}-${name}`);
    }
  }

  // A running session: the other Start buttons are disabled.
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto("/assignments");
  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await page.waitForTimeout(800);
  await shoot(page, "d-assignments-session-running");
  await page.goto("/exams");
  await shoot(page, "d-exams-session-running");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/assignments");
  await shoot(page, "m-assignments-session-running");
  await context.close();
});
