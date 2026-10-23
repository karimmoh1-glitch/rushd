import "server-only";

// Starting, completing, and abandoning study sessions for one student. Shared
// by the web's server actions (src/server/actions/study-sessions.ts) and the
// native app's API (/api/v1/sessions). The caller supplies the signed-in
// user's id; every query here is scoped to it.
import { db } from "@/lib/db";
import { buildWorkItems } from "@/lib/planning/build-work-items";
import { scoreItem } from "@/lib/planning/score";
import type { WorkItem } from "@/lib/planning/types";
import { getEstimationProfileForUser } from "@/lib/estimation/get-estimation-profile-for-user";
import { logEvent } from "@/lib/analytics/log-event";

export type StudySessionSource = "PLANNED" | "MANUAL";

export type AbandonReasonValue =
  | "RAN_OUT_OF_TIME"
  | "HARDER_THAN_EXPECTED"
  | "GOT_DISTRACTED"
  | "NEED_HELP"
  | "SOMETHING_CAME_UP"
  | "OTHER";

export type PerceivedDifficultyValue = "EASIER" | "AS_EXPECTED" | "HARDER";

export interface ActiveSessionData {
  id: string;
  title: string;
  className: string;
  classColor: string;
  plannedMinutes: number;
  startedAt: string; // ISO — the client computes elapsed time from this
}

export interface CompletedSessionSummary {
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  perceivedDifficulty: PerceivedDifficultyValue | null;
}

export type StartResult = { error: string } | { success: true; session: ActiveSessionData };
export type CompleteResult = { error: string } | { success: true; summary: CompletedSessionSummary };
export type SimpleResult = { error: string } | { success: true };

export type SessionTarget = { assignmentId: string } | { examId: string };

/** Splits a target into its two id columns; a missing one is null. */
function targetIds(target: SessionTarget): { assignmentId: string | null; examId: string | null } {
  let assignmentId: string | null = null;
  let examId: string | null = null;
  if ("assignmentId" in target) {
    assignmentId = target.assignmentId;
  }
  if ("examId" in target) {
    examId = target.examId;
  }
  return { assignmentId, examId };
}

/**
 * Scores one assignment or exam the same way the live plan does, using the
 * student's own estimation profile. Never trusts a score from the client.
 * Returns null if the item doesn't exist or isn't this user's (on purpose,
 * the two cases look the same).
 */
async function predictForTarget(
  userId: string,
  target: SessionTarget,
  now: Date,
): Promise<{ workItem: WorkItem; score: number; reasonCode: string } | null> {
  if ("assignmentId" in target) {
    const [assignment, estimationProfile] = await Promise.all([
      db.assignment.findFirst({
        where: { id: target.assignmentId, userId, status: { not: "COMPLETED" } },
        select: {
          id: true,
          classId: true,
          title: true,
          dueAt: true,
          estimatedMinutes: true,
          priority: true,
          status: true,
          class: { select: { name: true, color: true, priority: true } },
        },
      }),
      getEstimationProfileForUser(userId),
    ]);
    if (!assignment) return null;
    const [workItem] = buildWorkItems([assignment], [], estimationProfile);
    const scored = scoreItem(workItem, now);
    return { workItem, score: scored.score, reasonCode: scored.reasonCode };
  }

  const [exam, estimationProfile] = await Promise.all([
    db.exam.findFirst({
      where: { id: target.examId, userId },
      select: {
        id: true,
        classId: true,
        title: true,
        examAt: true,
        prepMinutes: true,
        priority: true,
        class: { select: { name: true, color: true, priority: true } },
      },
    }),
    getEstimationProfileForUser(userId),
  ]);
  if (!exam) return null;
  const [workItem] = buildWorkItems([], [exam], estimationProfile);
  const scored = scoreItem(workItem, now);
  return { workItem, score: scored.score, reasonCode: scored.reasonCode };
}

function toActiveSessionData(session: {
  id: string;
  title: string;
  className: string;
  classColor: string;
  plannedMinutes: number;
  startedAt: Date;
}): ActiveSessionData {
  return {
    id: session.id,
    title: session.title,
    className: session.className,
    classColor: session.classColor,
    plannedMinutes: session.plannedMinutes,
    startedAt: session.startedAt.toISOString(),
  };
}

/** The student's in-progress session, if any. */
export async function getActiveStudySession(userId: string): Promise<ActiveSessionData | null> {
  const session = await db.studySession.findFirst({
    where: { userId, status: "IN_PROGRESS" },
    select: {
      id: true,
      title: true,
      className: true,
      classColor: true,
      plannedMinutes: true,
      startedAt: true,
    },
  });
  return session ? toActiveSessionData(session) : null;
}

/** Starts a study session for one assignment or exam. Only one session can be
 * IN_PROGRESS at a time, because the active-session bar shows just one. */
export async function startStudySession(
  userId: string,
  target: SessionTarget,
  source: StudySessionSource,
): Promise<StartResult> {
  const user = { id: userId };

  const existingActive = await db.studySession.findFirst({
    where: { userId: user.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (existingActive) {
    return {
      error: "You already have an active study session. Finish or abandon it first.",
    };
  }

  const isAssignment = "assignmentId" in target;
  const { assignmentId, examId } = targetIds(target);

  const now = new Date();
  const prediction = await predictForTarget(user.id, target, now);
  if (!prediction) {
    if (isAssignment) {
      return { error: "Assignment not found." };
    }
    return { error: "Exam not found." };
  }
  const { workItem, score, reasonCode } = prediction;

  const created = await db.studySession.create({
    data: {
      userId: user.id,
      assignmentId,
      examId,
      source,
      title: workItem.title,
      plannedMinutes: workItem.remainingMinutes,
      predictedScore: score,
      reasonCode,
      className: workItem.className,
      classColor: workItem.classColor,
    },
    select: {
      id: true,
      title: true,
      className: true,
      classColor: true,
      plannedMinutes: true,
      startedAt: true,
    },
  });

  // Starting work moves a NOT_STARTED assignment to IN_PROGRESS. Both count as
  // "open" to the planner, so the plan doesn't need regenerating.
  if ("assignmentId" in target) {
    await db.assignment.updateMany({
      where: { id: target.assignmentId, userId: user.id, status: "NOT_STARTED" },
      data: { status: "IN_PROGRESS" },
    });
  }

  let kind = "exam";
  if (isAssignment) {
    kind = "assignment";
  }
  await logEvent(user.id, "study_session_started", {
    sessionId: created.id,
    kind,
    source,
    plannedMinutes: workItem.remainingMinutes,
    reasonCode,
  });

  return { success: true, session: toActiveSessionData(created) };
}

/** Completes a session with the minutes the student confirmed. The browser's
 * elapsed time is only a suggestion: an open tab isn't focused time. */
export async function completeStudySession(
  userId: string,
  sessionId: string,
  actualMinutes: number,
  perceivedDifficulty?: PerceivedDifficultyValue,
): Promise<CompleteResult> {
  const user = { id: userId };

  if (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 1000) {
    return { error: "Enter a valid number of minutes (1-1000)." };
  }

  const session = await db.studySession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true, status: true, title: true, plannedMinutes: true, assignmentId: true, startedAt: true },
  });
  if (!session) return { error: "Study session not found." };
  if (session.status !== "IN_PROGRESS") {
    return { error: "This session was already finished." };
  }

  const now = new Date();
  await db.studySession.update({
    where: { id: session.id },
    data: {
      status: "COMPLETED",
      endedAt: now,
      actualMinutes,
      perceivedDifficulty: perceivedDifficulty ?? null,
    },
  });

  await logEvent(user.id, "study_session_completed", {
    sessionId: session.id,
    plannedMinutes: session.plannedMinutes,
    actualMinutes,
    // Wall-clock time the session was open, measured by the server.
    elapsedMinutes: Math.floor((now.getTime() - session.startedAt.getTime()) / 60_000),
    perceivedDifficulty: perceivedDifficulty ?? null,
  });

  return {
    success: true,
    summary: {
      title: session.title,
      plannedMinutes: session.plannedMinutes,
      actualMinutes,
      perceivedDifficulty: perceivedDifficulty ?? null,
    },
  };
}

/** Abandons a session. The reason is optional: students never have to explain. */
export async function abandonStudySession(
  userId: string,
  sessionId: string,
  reason?: AbandonReasonValue,
): Promise<SimpleResult> {
  const user = { id: userId };

  const session = await db.studySession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true, status: true },
  });
  if (!session) return { error: "Study session not found." };
  if (session.status !== "IN_PROGRESS") {
    return { error: "This session was already finished." };
  }

  await db.studySession.update({
    where: { id: session.id },
    data: { status: "ABANDONED", endedAt: new Date(), abandonReason: reason ?? null },
  });

  await logEvent(user.id, "study_session_abandoned", {
    sessionId: session.id,
    reason: reason ?? null,
  });

  return { success: true };
}
