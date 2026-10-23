import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Pool } from "@neondatabase/serverless";
import { configureNeon } from "./db";

// Course content browsing, rubric display, and the AI surfaces' unavailable
// states. Live Canvas can't run here, so after a real signup the test seeds
// mirrored content rows directly (what a content sync writes); the e2e
// teardown deletes the account and everything under it.

configureNeon();

async function seed(email: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    const userId = users[0].id as string;
    const { rows: classes } = await pool.query(`SELECT id FROM "Class" WHERE "userId" = $1 LIMIT 1`, [userId]);
    const classId = classes[0].id as string;
    const assignmentId = randomUUID();
    const moduleId = randomUUID();
    const now = new Date();
    await pool.query(
      `INSERT INTO "Assignment" (id, "userId", "classId", title, "dueAt", source, "canvasCourseId", "canvasAssignmentId", "updatedAt")
       VALUES ($1, $2, $3, 'Titration lab report', now() + interval '5 days', 'CANVAS', '1', '101', now())`,
      [assignmentId, userId, classId],
    );
    await pool.query(
      `INSERT INTO "CourseModule" (id, "userId", "classId", "canvasCourseId", "canvasModuleId", name, position, "syncedAt")
       VALUES ($1, $2, $3, '1', '11', 'Unit 3: Stoichiometry', 1, $4)`,
      [moduleId, userId, classId, now],
    );
    const material = (kind: string, canvasId: string, title: string, extra: Record<string, unknown> = {}) => ({
      id: randomUUID(), kind, canvasId, title, body: null, targetId: null, itemType: null, position: null, rubric: null, assignmentId: null, moduleId: null, ...extra,
    });
    const rubric = [
      { id: "_1", description: "Procedure", longDescription: "", points: 10, ratings: [{ id: "a", description: "Complete and reproducible", longDescription: "", points: 10 }] },
      { id: "_2", description: "Error analysis", longDescription: "", points: 5, ratings: [] },
    ];
    const rows = [
      material("MODULE_ITEM", "1102", "Mole concept notes", { moduleId, itemType: "Page", targetId: "mole-notes", position: 1 }),
      material("MODULE_ITEM", "1103", "Titration lab report", { moduleId, itemType: "Assignment", targetId: "101", position: 2 }),
      material("PAGE", "mole-notes", "Mole concept notes", { body: "A mole is 6.022e23 particles. Avogadro's number links grams to particles." }),
      material("ASSIGNMENT", "101", "Titration lab report", { body: "Write up the titration with a full error analysis.", rubric: JSON.stringify(rubric), assignmentId }),
      material("ANNOUNCEMENT", "9001", "Lab moved to Thursday", { body: "Bring goggles." }),
    ];
    for (const r of rows) {
      await pool.query(
        `INSERT INTO "CourseMaterial" (id, "userId", "classId", "canvasCourseId", kind, "canvasId", title, body, "targetId", "itemType", position, rubric, "assignmentId", "moduleId", "postedAt", "syncedAt")
         VALUES ($1, $2, $3, '1', $4::"CourseMaterialKind", $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $14)`,
        [r.id, userId, classId, r.kind, r.canvasId, r.title, r.body, r.targetId, r.itemType, r.position, r.rubric, r.assignmentId, r.moduleId, now],
      );
    }
    return { classId, assignmentId };
  } finally {
    await pool.end();
  }
}

test("course content: browse modules, search, read a page, see the real rubric", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to seed course content");
  const email = `e2e-course-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox", { name: /13 or older/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("What should we call you?").fill("Course Tester");
  await page.getByRole("radio", { name: "High school", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("e.g. AP Chemistry").fill("Playwright Chemistry");
  await page.getByPlaceholder("e.g. AP Chemistry").press("Enter");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Weekday afternoons").click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const { classId, assignmentId } = await seed(email);

  await page.goto(`/courses/${classId}`);
  await expect(page.getByRole("heading", { name: "Unit 3: Stoichiometry" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lab moved to Thursday" })).toBeVisible();
  await page.screenshot({ path: "test-results/course-page.png", fullPage: true });

  await page.getByLabel("Search this course").fill("avogadro grams");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  await page.getByRole("link", { name: "Mole concept notes" }).first().click();
  await expect(page.getByText("A mole is 6.022e23 particles.")).toBeVisible();

  await page.goto(`/assignments/${assignmentId}`);
  await expect(page.getByText("Write up the titration with a full error analysis.")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Procedure" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Error analysis" })).toBeVisible();
  await page.screenshot({ path: "test-results/assignment-page.png", fullPage: true });

  await page.goto(`/tutor?assignmentId=${assignmentId}`);
  await expect(page.getByRole("heading", { name: "Tutor", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/tutor-page.png", fullPage: true });
});
