import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { topicKey } from "@/lib/practice/mastery";
import { localDateKey, addDaysToKey } from "@/lib/time/zone";
import { generatePlanForUser } from "./generate-for-user";
import { latestChangeNote, recordPlanSnapshot, rollPlanForward } from "./snapshots";
import type { PlanSnapshot } from "./diff";

// The planner against real rows: topics and evidence from learning-core,
// exams, term dates, overrides, and the stored plan history.

const DAY = 24 * 60 * 60 * 1000;
// A fixed "now" keeps the test independent of the time of day it runs:
// Thursday Oct 22 2026, 9:00 in Los Angeles (the test user's zone).
const NOW = new Date("2026-10-22T16:00:00Z");
const TZ = "America/Los_Angeles";
const TODAY = localDateKey(NOW, TZ);

describe("planner inputs (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function student() {
    const user = await createTestUser();
    users.push(user.id);
    // 10:00-14:00 every day.
    await db.studyAvailability.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ userId: user.id, dayOfWeek, startMinute: 600, endMinute: 840 })),
    });
    return user.id;
  }

  async function course(userId: string, name: string, extra: { termStart?: Date; termEnd?: Date } = {}) {
    return db.class.create({ data: { userId, name, color: "#2563eb", ...extra } });
  }

  async function topicWithEvidence(userId: string, classId: string, title: string, answers: [daysAgo: number, correct: boolean][]) {
    const topic = await db.courseTopic.create({ data: { userId, classId, title, key: topicKey(title) } });
    for (const [daysAgo, correct] of answers) {
      await db.masteryEvidence.create({
        data: {
          userId,
          classId,
          topicId: topic.id,
          topicKey: topic.key,
          topicLabel: title,
          score: correct ? 1 : 0,
          weight: 1,
          source: "practice",
          result: correct ? "CORRECT" : "INCORRECT",
          createdAt: new Date(NOW.getTime() - daysAgo * DAY),
        },
      });
    }
    return topic;
  }

  it("turns due reviews into a review block and scales exam prep by mastery", async () => {
    const userId = await student();
    const chem = await course(userId, "Chemistry");
    await topicWithEvidence(userId, chem.id, "Gas laws", [[10, false], [6, true], [5, false], [4, false]]); // needs review, due
    await topicWithEvidence(userId, chem.id, "Stoichiometry", [[20, true], [16, true], [9, true]]); // developing, due
    await db.courseTopic.create({ data: { userId, classId: chem.id, title: "Equilibrium", key: topicKey("Equilibrium") } }); // no evidence
    await db.exam.create({ data: { userId, classId: chem.id, title: "Unit 3 test", examAt: new Date(NOW.getTime() + 5 * DAY), prepMinutes: 120 } });

    const plan = await generatePlanForUser(userId, NOW);
    const exam = plan.scored.find((s) => s.item.kind === "exam")!;
    // 1 needs review, 1 developing, 1 unknown of 3: 1 + (0.5 + 0.25 + 0.25)/3 = 1.33 -> 160 min.
    expect(exam.item.prep?.factor).toBe(1.33);
    expect(exam.item.remainingMinutes).toBe(160);
    expect(exam.item.mastery).toEqual({ total: 3, secure: 0, developing: 1, needsReview: 1, unknown: 1 });

    const review = plan.scored.find((s) => s.item.kind === "review");
    expect(review?.item.id).toBe(chem.id);
    expect(review?.item.review?.topics.map((t) => t.title).sort()).toEqual(["Gas laws", "Stoichiometry"]);
    expect(review?.item.review?.examDaysAway).toBe(5);
    expect(plan.sessions.some((s) => s.item.kind === "review")).toBe(true);
    expect(plan.masteryByClass.get(chem.id)?.total).toBe(3);
  });

  it("doesn't plan a course outside its term, or review topics from an archived course", async () => {
    const userId = await student();
    const ended = await course(userId, "Old course", { termStart: new Date("2026-08-20T00:00:00Z"), termEnd: new Date("2026-10-15T00:00:00Z") });
    await db.assignment.create({ data: { userId, classId: ended.id, title: "Late essay", dueAt: new Date(NOW.getTime() + 2 * DAY), estimatedMinutes: 60 } });
    const archived = await db.class.create({ data: { userId, name: "Archived", color: "#000000", archived: true } });
    await topicWithEvidence(userId, archived.id, "Old topic", [[30, true], [20, true]]);

    const plan = await generatePlanForUser(userId, NOW);
    expect(plan.sessions).toEqual([]);
    expect(plan.warnings).toContainEqual(expect.objectContaining({ type: "OUTSIDE_TERM", title: "Late essay" }));
    expect(plan.scored.some((s) => s.item.kind === "review")).toBe(false);
  });

  it("respects the student's overrides, and only their own", async () => {
    const userId = await student();
    const other = await student();
    const chem = await course(userId, "Chemistry");
    const lab = await db.assignment.create({ data: { userId, classId: chem.id, title: "Lab report", dueAt: new Date(NOW.getTime() + 4 * DAY), estimatedMinutes: 60 } });
    // Someone else's override for the same id must not count.
    await db.planOverride.create({ data: { userId: other, kind: "NOT_THIS_WEEK", assignmentId: lab.id, localDate: addDaysToKey(TODAY, 30) } });

    const before = await generatePlanForUser(userId, NOW);
    expect(before.sessions[0].scheduledDate).toBe(TODAY);

    await db.planOverride.create({ data: { userId, kind: "SKIP_DAY", assignmentId: lab.id, localDate: TODAY } });
    const after = await generatePlanForUser(userId, NOW);
    expect(after.sessions.map((s) => s.scheduledDate)).toEqual([addDaysToKey(TODAY, 1)]);
  });

  it("records snapshots, diffs them, and detects a missed block on a new day", async () => {
    const userId = await student();
    const chem = await course(userId, "Chemistry");
    const lab = await db.assignment.create({ data: { userId, classId: chem.id, title: "Lab report", dueAt: new Date(NOW.getTime() + 4 * DAY), estimatedMinutes: 120 } });

    // Yesterday's plan had a block yesterday that never happened.
    const yesterday = addDaysToKey(TODAY, -1);
    const old: PlanSnapshot = {
      v: 1,
      today: yesterday,
      items: [{ kind: "assignment", id: lab.id, title: "Lab report", className: "Chemistry", blocks: [{ date: yesterday, start: 600, minutes: 60 }, { date: addDaysToKey(TODAY, 2), start: 600, minutes: 60 }] }],
    };
    await db.plan.create({ data: { userId, generatedAt: new Date(NOW.getTime() - DAY), trigger: "other", snapshot: old as never, changes: [] } });

    const plan = await generatePlanForUser(userId, NOW);
    await rollPlanForward(userId, plan, NOW);
    const latest = await db.plan.findFirst({ where: { userId }, orderBy: { generatedAt: "desc" } });
    expect(latest?.trigger).toBe("missed_session");
    const note = await latestChangeNote(userId, NOW, TZ, true);
    expect(note?.sentences[0]).toBe("Moved Lab report to today because you missed yesterday's block.");
    const shown = await db.event.count({ where: { userId, name: "plan_change_shown" } });
    expect(shown).toBe(1);
    await latestChangeNote(userId, NOW, TZ, true);
    expect(await db.event.count({ where: { userId, name: "plan_change_shown" } })).toBe(1);

    // Rolling forward again the same day writes nothing.
    await rollPlanForward(userId, plan, NOW);
    expect(await db.plan.count({ where: { userId } })).toBe(2);

    // A skip regenerates with its own reason and PlanItems on the right calendar day.
    await db.planOverride.create({ data: { userId, kind: "SKIP_DAY", assignmentId: lab.id, localDate: TODAY } });
    const recorded = await recordPlanSnapshot(userId, "block_skipped", { now: NOW });
    expect(recorded.changes[0]).toMatchObject({ itemId: lab.id, cause: "skipped" });
    const items = await db.planItem.findMany({ where: { planId: recorded.planId } });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.scheduledDate.toISOString().slice(0, 10) > TODAY)).toBe(true);
    const event = await db.event.findFirst({ where: { userId, name: "plan_regenerated" }, orderBy: { createdAt: "desc" } });
    expect(event?.properties).toMatchObject({ reason: "block_skipped" });
  });

  it("reads only the student's own plan history", async () => {
    const owner = await student();
    const other = await student();
    await db.plan.create({
      data: { userId: owner, generatedAt: NOW, trigger: "block_skipped", snapshot: { v: 1, today: TODAY, items: [] }, changes: [{ type: "removed", kind: "assignment", itemId: "x", title: "Secret", className: "C", fromDate: TODAY, toDate: null, minutesBefore: 30, minutesAfter: 0, cause: "completed" }] },
    });
    expect(await latestChangeNote(other, NOW, TZ, false)).toBeNull();
    expect((await latestChangeNote(owner, NOW, TZ, false))?.sentences).toEqual(["Took Secret off your plan. It's done."]);
    const dismissed = await db.plan.updateMany({ where: { userId: other }, data: { changesDismissedAt: NOW } });
    expect(dismissed.count).toBe(0);
  });
});
