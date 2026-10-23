import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { configureNeon } from "./db";

// What the UI can't create locally, seeded for a real signed-up account the
// way course-content.spec.ts does: a Canvas assignment with its rubric and a
// saved draft review, a practice check, finished study sessions, and the
// admin flag. The e2e teardown deletes the account and everything under it.
export async function seedReviewData(email: string) {
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

