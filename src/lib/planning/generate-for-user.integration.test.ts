import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { generatePlanForUser } from "./generate-for-user";

describe("generatePlanForUser (integration)", () => {
  let userId: string;
  let classId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const cls = await db.class.create({
      data: { userId, name: "AP Chemistry", color: "#2563eb", priority: "MEDIUM" },
    });
    classId = cls.id;

    await db.studyAvailability.create({
      data: { userId, dayOfWeek: new Date().getDay(), startMinute: 0, endMinute: 600 },
    });
  });

  afterEach(async () => {
    await deleteTestUser(userId);
  });

  it("includes an open assignment and schedules it", async () => {
    await db.assignment.create({
      data: {
        userId,
        classId,
        title: "Lab report",
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        estimatedMinutes: 45,
        status: "NOT_STARTED",
      },
    });

    const result = await generatePlanForUser(userId);
    expect(result.scored).toHaveLength(1);
    expect(result.scored[0].item.title).toBe("Lab report");
    expect(result.sessions.length).toBeGreaterThan(0);
  });

  it("excludes a completed assignment", async () => {
    await db.assignment.create({
      data: {
        userId,
        classId,
        title: "Finished worksheet",
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        estimatedMinutes: 30,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    const result = await generatePlanForUser(userId);
    expect(result.scored).toHaveLength(0);
  });

  it("excludes assignments and exams belonging to an archived class", async () => {
    await db.assignment.create({
      data: {
        userId,
        classId,
        title: "Old class work",
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        estimatedMinutes: 30,
        status: "NOT_STARTED",
      },
    });
    await db.class.update({ where: { id: classId }, data: { archived: true } });

    const result = await generatePlanForUser(userId);
    expect(result.scored).toHaveLength(0);
  });

  it("excludes exams that have already happened", async () => {
    await db.exam.create({
      data: {
        userId,
        classId,
        title: "Last week's quiz",
        examAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        prepMinutes: 60,
      },
    });

    const result = await generatePlanForUser(userId);
    expect(result.scored).toHaveLength(0);
  });

  it("reflects a completed assignment on the next call (adaptive)", async () => {
    const assignment = await db.assignment.create({
      data: {
        userId,
        classId,
        title: "Reading response",
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        estimatedMinutes: 30,
        status: "NOT_STARTED",
      },
    });

    const before = await generatePlanForUser(userId);
    expect(before.scored).toHaveLength(1);

    await db.assignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const after = await generatePlanForUser(userId);
    expect(after.scored).toHaveLength(0);
  });

  it("ranks an overdue assignment above a far-out one", async () => {
    await db.assignment.create({
      data: {
        userId,
        classId,
        title: "Overdue",
        dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        estimatedMinutes: 30,
        status: "NOT_STARTED",
      },
    });
    await db.assignment.create({
      data: {
        userId,
        classId,
        title: "Not urgent",
        dueAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        estimatedMinutes: 30,
        status: "NOT_STARTED",
      },
    });

    const result = await generatePlanForUser(userId);
    expect(result.scored[0].item.title).toBe("Overdue");
    expect(result.scored[0].reasonCode).toBe("OVERDUE");
  });
});
