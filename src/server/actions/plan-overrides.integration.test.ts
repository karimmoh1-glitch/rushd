import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";

// The override server actions, called directly against a real database. The
// session is replaced by a fixed user (the actions read it through
// requireUserOrThrow), and revalidatePath is a no-op outside Next.
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/dal", () => ({
  requireUserOrThrow: async () => ({ id: session.userId }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { changeEstimate, clearOverrides, dismissArchiveSuggestion, dismissPlanChange, notThisWeek, skipForToday } from "./plan-overrides";

const DAY = 24 * 60 * 60 * 1000;

describe("plan override actions (real DB)", { timeout: 60_000 }, () => {
  const users: string[] = [];
  afterEach(async () => {
    await Promise.all(users.splice(0).map(deleteTestUser));
  });

  async function setup() {
    const owner = await createTestUser({ displayName: "Owner" });
    const attacker = await createTestUser({ displayName: "Attacker" });
    users.push(owner.id, attacker.id);
    await db.studyAvailability.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ userId: owner.id, dayOfWeek, startMinute: 0, endMinute: 1440 })),
    });
    const cls = await db.class.create({ data: { userId: owner.id, name: "Chemistry", color: "#2563eb" } });
    const assignment = await db.assignment.create({
      data: { userId: owner.id, classId: cls.id, title: "Lab report", dueAt: new Date(Date.now() + 5 * DAY), estimatedMinutes: 60 },
    });
    const exam = await db.exam.create({ data: { userId: owner.id, classId: cls.id, title: "Unit test", examAt: new Date(Date.now() + 6 * DAY) } });
    return { owner, attacker, cls, assignment, exam };
  }

  it("skip for today: the owner's override is stored and the plan regenerated with that reason", async () => {
    const { owner, assignment } = await setup();
    session.userId = owner.id;
    const result = await skipForToday({ kind: "assignment", itemId: assignment.id });
    expect(result).toMatchObject({ success: true });
    expect(await db.planOverride.count({ where: { userId: owner.id, kind: "SKIP_DAY", assignmentId: assignment.id } })).toBe(1);
    // Twice is still one override.
    await skipForToday({ kind: "assignment", itemId: assignment.id });
    expect(await db.planOverride.count({ where: { userId: owner.id, kind: "SKIP_DAY" } })).toBe(1);
    const plan = await db.plan.findFirst({ where: { userId: owner.id }, orderBy: { generatedAt: "desc" } });
    expect(plan?.trigger).toBe("block_skipped");
    expect(await db.event.count({ where: { userId: owner.id, name: "block_skipped" } })).toBe(2);
  });

  it("another student can't skip, defer, re-estimate or undo the owner's work", async () => {
    const { owner, attacker, assignment, exam, cls } = await setup();
    session.userId = owner.id;
    await notThisWeek({ kind: "assignment", itemId: assignment.id });

    session.userId = attacker.id;
    expect(await skipForToday({ kind: "assignment", itemId: assignment.id })).toEqual({ error: "That item isn't on your plan any more." });
    expect(await notThisWeek({ kind: "exam", itemId: exam.id })).toEqual({ error: "That item isn't on your plan any more." });
    expect(await skipForToday({ kind: "review", itemId: cls.id })).toEqual({ error: "That item isn't on your plan any more." });
    expect(await changeEstimate({ kind: "assignment", itemId: assignment.id, minutes: 600 })).toEqual({ error: "That item isn't on your plan any more." });
    expect(await changeEstimate({ kind: "exam", itemId: exam.id, minutes: 600 })).toEqual({ error: "That item isn't on your plan any more." });
    expect(await clearOverrides({ kind: "assignment", itemId: assignment.id })).toEqual({ error: "Nothing to undo." });

    expect(await db.planOverride.count({ where: { userId: attacker.id } })).toBe(0);
    expect(await db.planOverride.count({ where: { userId: owner.id } })).toBe(1);
    expect((await db.assignment.findUnique({ where: { id: assignment.id } }))?.estimatedMinutes).toBe(60);
    expect((await db.exam.findUnique({ where: { id: exam.id } }))?.prepMinutes).toBe(120);
  });

  it("not this week resumes next Monday; undo clears it", async () => {
    const { owner, assignment } = await setup();
    session.userId = owner.id;
    const result = await notThisWeek({ kind: "assignment", itemId: assignment.id });
    expect(result).toMatchObject({ success: true, message: expect.stringMatching(/^Off this week\. Back on your plan from Monday/) });
    const override = await db.planOverride.findFirst({ where: { userId: owner.id, kind: "NOT_THIS_WEEK" } });
    expect(new Date(`${override!.localDate}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(await clearOverrides({ kind: "assignment", itemId: assignment.id })).toEqual({ success: true });
    expect(await db.planOverride.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("change estimate updates the owner's number and stops Rushd's own default", async () => {
    const { owner, assignment, exam } = await setup();
    await db.assignment.update({ where: { id: assignment.id }, data: { estimatedByRushd: true } });
    session.userId = owner.id;
    expect(await changeEstimate({ kind: "assignment", itemId: assignment.id, minutes: 90 })).toMatchObject({ success: true });
    const updated = await db.assignment.findUnique({ where: { id: assignment.id } });
    expect(updated).toMatchObject({ estimatedMinutes: 90, estimatedByRushd: false });
    expect(await changeEstimate({ kind: "exam", itemId: exam.id, minutes: 10 })).toEqual({ error: "Exam prep is at least 15 minutes." });
    expect(await changeEstimate({ kind: "exam", itemId: exam.id, minutes: 180 })).toMatchObject({ success: true });
    expect((await db.exam.findUnique({ where: { id: exam.id } }))?.prepMinutes).toBe(180);
    const event = await db.event.findFirst({ where: { userId: owner.id, name: "override_applied" }, orderBy: { createdAt: "desc" } });
    expect(event?.properties).toEqual({ type: "estimate", kind: "exam", itemId: exam.id });
  });

  it("says when an override leaves a deadline short", async () => {
    const { owner, cls } = await setup();
    // Due before the end of tomorrow with more work than tomorrow can hold.
    const tight = await db.assignment.create({
      data: { userId: owner.id, classId: cls.id, title: "Big project", dueAt: new Date(Date.now() + 1.2 * DAY), estimatedMinutes: 1000 },
    });
    session.userId = owner.id;
    const result = await skipForToday({ kind: "assignment", itemId: tight.id });
    expect(result).toMatchObject({ success: true, risk: expect.stringMatching(/^Heads up: Big project is now .+ short before it's due/) });
  });

  it("dismissals are scoped to the owner", async () => {
    const { owner, attacker, cls } = await setup();
    const plan = await db.plan.create({ data: { userId: owner.id, trigger: "block_skipped", changes: [] } });
    session.userId = attacker.id;
    expect(await dismissPlanChange(plan.id)).toEqual({ error: "Plan not found." });
    expect(await dismissArchiveSuggestion(cls.id)).toEqual({ error: "Course not found." });
    session.userId = owner.id;
    expect(await dismissPlanChange(plan.id)).toEqual({ success: true });
    expect(await dismissArchiveSuggestion(cls.id)).toEqual({ success: true });
    expect((await db.class.findUnique({ where: { id: cls.id } }))?.archiveSuggestionDismissedAt).not.toBeNull();
    expect((await db.class.findUnique({ where: { id: cls.id } }))?.archived).toBe(false);
  });
});
