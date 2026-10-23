import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { exportChunks } from "./export";
import { USER_DATA } from "./user-data";
import { deleteUserAccount } from "./delete-account";

/** Puts at least one row in every user-owned table for this user. */
async function seedEverything(userId: string, otherUserId: string) {
  const cls = await db.class.create({ data: { userId, name: "Chemistry" } });
  const assignment = await db.assignment.create({ data: { userId, classId: cls.id, title: "Lab report", dueAt: new Date(Date.now() + 86_400_000) } });
  await db.exam.create({ data: { userId, classId: cls.id, title: "Unit 3 test", examAt: new Date(Date.now() + 5 * 86_400_000) } });
  const plan = await db.plan.create({ data: { userId } });
  const planItem = await db.planItem.create({
    data: { planId: plan.id, userId, assignmentId: assignment.id, scheduledDate: new Date(), scheduledMinutes: 30, score: 1, reasonCode: "DUE_SOON" },
  });
  await db.studySession.create({
    data: { userId, assignmentId: assignment.id, planItemId: planItem.id, title: "Lab report", plannedMinutes: 30, predictedScore: 1, reasonCode: "DUE_SOON", className: "Chemistry", classColor: "#000000", source: "PLANNED" },
  });
  await db.studyAvailability.create({ data: { userId, dayOfWeek: 1, startMinute: 900, endMinute: 1020 } });
  await db.scheduleBlock.create({ data: { userId, assignmentId: assignment.id, localDate: "2026-11-02", startMinute: 900, durationMinutes: 30 } });
  await db.notification.create({ data: { userId, type: "OVERDUE_WORK", title: "Due soon", body: "Lab report" } });
  await db.feedback.create({ data: { userId, context: "plan", rating: 5, message: "useful" } });
  await db.event.create({ data: { userId, name: "signup" } });
  const canvas = await db.canvasConnection.create({ data: { userId, baseUrl: "https://school.instructure.com", encryptedToken: "v1.SECRET-CANVAS-CIPHERTEXT" } });
  await db.canvasCourse.create({ data: { connectionId: canvas.id, canvasCourseId: "101", name: "Chem", classId: cls.id } });
  const teams = await db.teamsConnection.create({ data: { userId, encryptedRefreshToken: "v1.SECRET-TEAMS-CIPHERTEXT" } });
  await db.teamsClass.create({ data: { connectionId: teams.id, teamsClassId: "t-1", name: "Chem (Teams)" } });
  await db.calendarFeed.create({ data: { userId, encryptedUrl: "v1.SECRET-FEED-CIPHERTEXT", host: "school.instructure.com" } });
  await db.courseModule.create({ data: { userId, classId: cls.id, canvasCourseId: "101", canvasModuleId: "m1", name: "Week 1", position: 1, syncedAt: new Date() } });
  await db.courseMaterial.create({ data: { userId, classId: cls.id, canvasCourseId: "101", canvasId: "page-1", kind: "PAGE", title: "Syllabus", syncedAt: new Date() } });
  const conversation = await db.tutorConversation.create({ data: { userId, classId: cls.id, title: "Moles" } });
  await db.tutorMessage.create({ data: { conversationId: conversation.id, role: "user", content: "What is a mole?" } });
  await db.draftReview.create({ data: { userId, assignmentId: assignment.id, label: "Draft 1", draftText: "My draft", result: {} } });
  await db.subscription.create({ data: { userId, plan: "PLUS", status: "active", stripeCustomerId: `cus_test_${userId}` } });
  await db.aiUsage.create({ data: { userId, feature: "tutor_message", model: "m", status: "completed", estimatedCostMicros: 1 } });
  await db.aiRejection.create({ data: { userId, feature: "tutor_message", reason: "daily_limit" } });
  const assessment = await db.assessment.create({
    data: { userId, classId: cls.id, source: "text", subject: "Chemistry", topic: "Moles", topicKey: "chem:moles", itemsAssessed: 2, estimateLow: 40, estimateHigh: 60, confidence: "low", result: {} },
  });
  await db.masteryEvidence.create({ data: { userId, assessmentId: assessment.id, topicKey: "chem:moles", topicLabel: "Moles", score: 0.5, weight: 1, source: "assessment" } });
  const topic = await db.courseTopic.create({ data: { userId, classId: cls.id, title: "Moles", key: "moles" } });
  const subtopic = await db.courseTopic.create({ data: { userId, classId: cls.id, title: "Molar mass", key: "molar-mass", parentId: topic.id } });
  await db.topicPrerequisite.create({ data: { userId, classId: cls.id, topicId: subtopic.id, prerequisiteId: topic.id } });
  const question = await db.practiceQuestion.create({ data: { userId, classId: cls.id, topicId: topic.id, prompt: "Define a mole.", answer: "6.022e23 particles" } });
  await db.practiceSession.create({ data: { userId, classId: cls.id, topicId: topic.id, questionIds: [question.id] } });
  await db.questionReport.create({ data: { userId, questionId: question.id, reason: "unclear" } });
  await db.mobileRefreshToken.create({
    data: { userId, tokenHash: `SECRET-REFRESH-HASH-${userId}`, familyId: "f1", sessionVersion: 0, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  await db.passwordResetToken.create({ data: { userId, tokenHash: `${userId}`.padEnd(64, "0").slice(0, 64), expiresAt: new Date(Date.now() + 3_600_000) } });
  await db.referral.create({ data: { referrerId: userId, referredId: otherUserId } });
  return { conversationId: conversation.id, canvasId: canvas.id, teamsId: teams.id };
}

async function exportJson(userId: string) {
  let text = "";
  for await (const chunk of exportChunks(userId)) text += chunk;
  return { text, data: JSON.parse(text) as Record<string, unknown> };
}

/** Rows in any table whose user columns still point at this id. */
async function rowsReferencing(userId: string): Promise<Record<string, number>> {
  const columns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name::text AS table_name, column_name::text AS column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name IN ('userId', 'referrerId', 'referredId')`;
  const found: Record<string, number> = {};
  for (const { table_name, column_name } of columns) {
    const rows = await db.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS n FROM ${Prisma.raw(`"${table_name}"`)} WHERE ${Prisma.raw(`"${column_name}"`)} = ${userId}`,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) found[`${table_name}.${column_name}`] = n;
  }
  return found;
}

describe("data rights (integration)", { timeout: 60_000 }, () => {
  const userIds: string[] = [];
  afterEach(async () => {
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  it("exports every section, the student's rows only, and no secrets", async () => {
    const user = await createTestUser({ displayName: "Exporter" });
    const other = await createTestUser({ displayName: "Someone Else" });
    userIds.push(user.id, other.id);
    await seedEverything(user.id, other.id);
    await db.class.create({ data: { userId: other.id, name: "Other student's class" } });

    const { text, data } = await exportJson(user.id);
    expect(data.format).toBe("rushd-export/1");
    expect((data.account as { email: string }).email).toBe(user.email);
    for (const source of USER_DATA) {
      expect(Array.isArray(data[source.key]), source.key).toBe(true);
    }
    // Every seeded section has the student's row (invitedBy is the one seeded empty).
    for (const source of USER_DATA.filter((s) => s.key !== "invitedBy")) {
      expect((data[source.key] as unknown[]).length, source.key).toBeGreaterThan(0);
    }
    expect((data.tutorMessages as { content: string }[])[0].content).toBe("What is a mole?");

    for (const secret of ["passwordHash", "sessionVersion", "SECRET-CANVAS", "SECRET-TEAMS", "SECRET-FEED", "SECRET-REFRESH", "tokenHash", "encryptedToken", "encryptedUrl"]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).not.toContain(other.email);
    expect(text).not.toContain("Other student's class");
    expect(text).not.toContain(other.id);
  });

  it("deleting the account leaves no row pointing at the student and cancels billing", async () => {
    const user = await createTestUser({ displayName: "Leaver" });
    const other = await createTestUser({ displayName: "Stays" });
    userIds.push(user.id, other.id);
    const ids = await seedEverything(user.id, other.id);
    const deleteCustomer = vi.fn(async () => {});

    expect(await deleteUserAccount(user.id, { billingOn: true, deleteCustomer })).toEqual({ ok: true });

    expect(deleteCustomer).toHaveBeenCalledWith(`cus_test_${user.id}`);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await rowsReferencing(user.id)).toEqual({});
    // Children owned through a parent row are gone too.
    expect(await db.tutorMessage.count({ where: { conversationId: ids.conversationId } })).toBe(0);
    expect(await db.canvasCourse.count({ where: { connectionId: ids.canvasId } })).toBe(0);
    expect(await db.teamsClass.count({ where: { connectionId: ids.teamsId } })).toBe(0);
    // Spend accounting survives without the link to the person.
    expect(await db.aiUsage.count({ where: { userId: null, model: "m", estimatedCostMicros: 1 } })).toBeGreaterThan(0);
    // The other student is untouched.
    expect(await db.user.findUnique({ where: { id: other.id } })).not.toBeNull();
  });

  it("keeps the account when the subscription can't be cancelled", async () => {
    const user = await createTestUser({ displayName: "Paying" });
    userIds.push(user.id);
    await db.subscription.create({ data: { userId: user.id, plan: "PLUS", status: "active", stripeCustomerId: `cus_fail_${user.id}` } });

    const failing = vi.fn(async () => {
      throw Object.assign(new Error("Stripe is down"), { code: "api_connection_error" });
    });
    const result = await deleteUserAccount(user.id, { billingOn: true, deleteCustomer: failing });
    expect(result.ok).toBe(false);
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();

    // Billing keys removed while a plan is live: refuse rather than orphan a paying subscription.
    expect((await deleteUserAccount(user.id, { billingOn: false })).ok).toBe(false);

    // Stripe already deleted the customer: nothing to cancel, deletion goes ahead.
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("No such customer"), { code: "resource_missing" });
    });
    expect(await deleteUserAccount(user.id, { billingOn: true, deleteCustomer: missing })).toEqual({ ok: true });
  });
});
