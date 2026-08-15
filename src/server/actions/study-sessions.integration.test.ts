import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { createTestUser, deleteTestUser } from "@/test/helpers";
import { logEvent } from "@/lib/analytics/log-event";

// StudySession's server actions (start/complete/abandon in study-sessions.ts)
// all read the current user from the request-scoped session cookie via
// requireUserOrThrow(), which isn't available outside a real Next request —
// same constraint documented in ownership.integration.test.ts. So this file
// tests the exact query patterns those actions rely on directly against
// Postgres: ownership scoping, the single-active-session rule, and
// state-transition safety. The full cookie-backed flow (start -> persist
// across navigation -> complete -> summary) is covered by
// e2e/golden-path.spec.ts instead.
describe("StudySession ownership and state-transition guarantees (integration)", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    await Promise.all(userIds.splice(0).map(deleteTestUser));
  });

  async function ownerWithAssignment() {
    const owner = await createTestUser({ displayName: "Owner" });
    const attacker = await createTestUser({ displayName: "Attacker" });
    userIds.push(owner.id, attacker.id);

    const cls = await db.class.create({
      data: { userId: owner.id, name: "Owner's class", color: "#2563eb" },
    });
    const assignment = await db.assignment.create({
      data: {
        userId: owner.id,
        classId: cls.id,
        title: "Lab report",
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        estimatedMinutes: 45,
      },
    });
    return { owner, attacker, cls, assignment };
  }

  interface SessionRowOverrides {
    status?: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
    actualMinutes?: number;
    endedAt?: Date;
    abandonReason?: "RAN_OUT_OF_TIME" | "HARDER_THAN_EXPECTED" | "GOT_DISTRACTED" | "NEED_HELP" | "SOMETHING_CAME_UP" | "OTHER";
  }

  async function createSessionRow(
    userId: string,
    assignmentId: string,
    overrides: SessionRowOverrides = {},
  ) {
    return db.studySession.create({
      data: {
        userId,
        assignmentId,
        source: "MANUAL",
        title: "Lab report",
        plannedMinutes: 45,
        predictedScore: 50,
        reasonCode: "STANDARD",
        className: "Owner's class",
        classColor: "#2563eb",
        ...overrides,
      },
    });
  }

  it("starting a session for another user's assignment is impossible (the assignment lookup startSession() uses is scoped to userId)", async () => {
    const { attacker, assignment } = await ownerWithAssignment();

    const found = await db.assignment.findFirst({
      where: { id: assignment.id, userId: attacker.id, status: { not: "COMPLETED" } },
    });

    expect(found).toBeNull();
  });

  it("the same-owner assignment lookup succeeds (sanity check the pattern isn't just broken)", async () => {
    const { owner, assignment } = await ownerWithAssignment();

    const found = await db.assignment.findFirst({
      where: { id: assignment.id, userId: owner.id, status: { not: "COMPLETED" } },
    });

    expect(found?.id).toBe(assignment.id);
  });

  it("cannot complete another user's session — cross-owner findFirst returns null", async () => {
    const { owner, attacker, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id);

    const found = await db.studySession.findFirst({
      where: { id: session.id, userId: attacker.id },
    });

    expect(found).toBeNull();
  });

  it("cannot abandon another user's session — cross-owner update affects zero rows", async () => {
    const { owner, attacker, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id);

    const result = await db.studySession.updateMany({
      where: { id: session.id, userId: attacker.id },
      data: { status: "ABANDONED", endedAt: new Date() },
    });

    expect(result.count).toBe(0);
    const unchanged = await db.studySession.findUnique({ where: { id: session.id } });
    expect(unchanged?.status).toBe("IN_PROGRESS");
  });

  it("completing own session succeeds when scoped to the real owner", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id);

    const result = await db.studySession.updateMany({
      where: { id: session.id, userId: owner.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", endedAt: new Date(), actualMinutes: 58 },
    });

    expect(result.count).toBe(1);
    const updated = await db.studySession.findUnique({ where: { id: session.id } });
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.actualMinutes).toBe(58);
  });

  it("an already-completed session cannot be completed again (invalid state transition)", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id, {
      status: "COMPLETED",
      actualMinutes: 40,
      endedAt: new Date(),
    });

    // Mirrors completeSession()'s guard: it only proceeds when the row is
    // still IN_PROGRESS, exactly like a status-scoped updateMany would.
    const result = await db.studySession.updateMany({
      where: { id: session.id, userId: owner.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", endedAt: new Date(), actualMinutes: 999 },
    });

    expect(result.count).toBe(0);
    const unchanged = await db.studySession.findUnique({ where: { id: session.id } });
    expect(unchanged?.actualMinutes).toBe(40); // untouched, not overwritten to 999
  });

  it("an already-abandoned session cannot be completed (invalid state transition)", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id, {
      status: "ABANDONED",
      endedAt: new Date(),
      abandonReason: "GOT_DISTRACTED",
    });

    const result = await db.studySession.updateMany({
      where: { id: session.id, userId: owner.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", endedAt: new Date(), actualMinutes: 30 },
    });

    expect(result.count).toBe(0);
  });

  it("a user can have at most one IN_PROGRESS session — the query startSession() uses to enforce it finds the existing one", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    await createSessionRow(owner.id, assignment.id);

    const existingActive = await db.studySession.findFirst({
      where: { userId: owner.id, status: "IN_PROGRESS" },
    });

    expect(existingActive).not.toBeNull();
  });

  it("a completed or abandoned session does not count as an active one", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    await createSessionRow(owner.id, assignment.id, {
      status: "COMPLETED",
      actualMinutes: 20,
      endedAt: new Date(),
    });

    const existingActive = await db.studySession.findFirst({
      where: { userId: owner.id, status: "IN_PROGRESS" },
    });

    expect(existingActive).toBeNull();
  });

  it("looking up a nonexistent session id returns null, not a throw", async () => {
    const { owner } = await ownerWithAssignment();

    const found = await db.studySession.findFirst({
      where: { id: "does-not-exist", userId: owner.id },
    });

    expect(found).toBeNull();
  });

  it("starting work bumps a NOT_STARTED assignment to IN_PROGRESS, scoped to the real owner", async () => {
    const { owner, attacker, assignment } = await ownerWithAssignment();

    const attackerAttempt = await db.assignment.updateMany({
      where: { id: assignment.id, userId: attacker.id, status: "NOT_STARTED" },
      data: { status: "IN_PROGRESS" },
    });
    expect(attackerAttempt.count).toBe(0);

    const ownerAttempt = await db.assignment.updateMany({
      where: { id: assignment.id, userId: owner.id, status: "NOT_STARTED" },
      data: { status: "IN_PROGRESS" },
    });
    expect(ownerAttempt.count).toBe(1);

    const updated = await db.assignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.status).toBe("IN_PROGRESS");
  });

  it("logs a study_session_started event with useful, non-sensitive metadata", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id);

    await logEvent(owner.id, "study_session_started", {
      sessionId: session.id,
      kind: "assignment",
      source: "MANUAL",
      plannedMinutes: 45,
      reasonCode: "STANDARD",
    });

    const event = await db.event.findFirst({
      where: { userId: owner.id, name: "study_session_started" },
    });
    expect(event).not.toBeNull();
    expect((event?.properties as Record<string, unknown>)?.sessionId).toBe(session.id);
  });

  it("logs a study_session_completed event carrying planned vs. actual minutes", async () => {
    const { owner, assignment } = await ownerWithAssignment();
    const session = await createSessionRow(owner.id, assignment.id);

    await logEvent(owner.id, "study_session_completed", {
      sessionId: session.id,
      plannedMinutes: session.plannedMinutes,
      actualMinutes: 58,
    });

    const event = await db.event.findFirst({
      where: { userId: owner.id, name: "study_session_completed" },
    });
    expect(event).not.toBeNull();
    const props = event?.properties as Record<string, unknown>;
    expect(props.plannedMinutes).toBe(45);
    expect(props.actualMinutes).toBe(58);
  });
});
