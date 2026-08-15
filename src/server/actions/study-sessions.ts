"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/lib/auth/dal";
import { buildWorkItems } from "@/lib/planning/build-work-items";
import { scoreItem } from "@/lib/planning/score";
import type { WorkItem } from "@/lib/planning/types";
import { logEvent } from "@/lib/analytics/log-event";

export type StudySessionSource = "PLANNED" | "MANUAL";

export type AbandonReasonValue =
  | "RAN_OUT_OF_TIME"
  | "HARDER_THAN_EXPECTED"
  | "GOT_DISTRACTED"
  | "NEED_HELP"
  | "SOMETHING_CAME_UP"
  | "OTHER";

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
}

type StartResult = { error: string } | { success: true; session: ActiveSessionData };
type CompleteResult = { error: string } | { success: true; summary: CompletedSessionSummary };
type SimpleResult = { error: string } | { success: true };

type SessionTarget = { assignmentId: string } | { examId: string };

/**
 * Re-derives what the deterministic engine would predict for a single
 * assignment/exam right now, by building the exact same WorkItem the live
 * plan would and running it through the same scoreItem() the plan uses —
 * never trusts a client-supplied score. Returns null if the item doesn't
 * exist or isn't owned by this user (ownership + ordinary "not found" are
 * indistinguishable on purpose, matching every other action in this app).
 */
async function predictForTarget(
  userId: string,
  target: SessionTarget,
  now: Date,
): Promise<{ workItem: WorkItem; score: number; reasonCode: string } | null> {
  if ("assignmentId" in target) {
    const assignment = await db.assignment.findFirst({
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
    });
    if (!assignment) return null;
    const [workItem] = buildWorkItems([assignment], []);
    const scored = scoreItem(workItem, now);
    return { workItem, score: scored.score, reasonCode: scored.reasonCode };
  }

  const exam = await db.exam.findFirst({
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
  });
  if (!exam) return null;
  const [workItem] = buildWorkItems([], [exam]);
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

/** Fetches the current user's in-progress session, if any. Used by the app
 * layout to render the persistent active-session bar on every page. */
export async function getActiveSession(): Promise<ActiveSessionData | null> {
  const user = await requireUserOrThrow();
  const session = await db.studySession.findFirst({
    where: { userId: user.id, status: "IN_PROGRESS" },
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

/**
 * Starts a study session for exactly one assignment or exam. Rushd allows
 * at most one IN_PROGRESS session per student at a time — the active-session
 * bar is a single persistent surface, not a list, so a second concurrent
 * session would have nowhere honest to be shown.
 */
export async function startSession(
  target: SessionTarget,
  source: StudySessionSource,
): Promise<StartResult> {
  const user = await requireUserOrThrow();

  const existingActive = await db.studySession.findFirst({
    where: { userId: user.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (existingActive) {
    return {
      error: "You already have an active study session. Finish or abandon it first.",
    };
  }

  const now = new Date();
  const prediction = await predictForTarget(user.id, target, now);
  if (!prediction) {
    return { error: "assignmentId" in target ? "Assignment not found." : "Exam not found." };
  }
  const { workItem, score, reasonCode } = prediction;

  const created = await db.studySession.create({
    data: {
      userId: user.id,
      assignmentId: "assignmentId" in target ? target.assignmentId : null,
      examId: "examId" in target ? target.examId : null,
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

  // Starting real work on a NOT_STARTED assignment is a real, deterministic
  // signal — bump it to IN_PROGRESS. This doesn't change engine scoring
  // (both statuses count as "open"), so no plan regeneration is needed;
  // it just keeps the assignment's own status honest with reality.
  if ("assignmentId" in target) {
    await db.assignment.updateMany({
      where: { id: target.assignmentId, userId: user.id, status: "NOT_STARTED" },
      data: { status: "IN_PROGRESS" },
    });
  }

  await logEvent(user.id, "study_session_started", {
    sessionId: created.id,
    kind: "assignmentId" in target ? "assignment" : "exam",
    source,
    plannedMinutes: workItem.remainingMinutes,
    reasonCode,
  });

  revalidatePath("/", "layout");

  return { success: true, session: toActiveSessionData(created) };
}

/**
 * Completes a session with a *confirmed* actual-minutes figure — never the
 * raw browser-elapsed time. The client pre-fills elapsed time as a
 * suggestion, but the student can edit it, because time the tab was open
 * isn't necessarily time spent focused (see docs/PLANNING_ENGINE.md).
 */
export async function completeSession(
  sessionId: string,
  actualMinutes: number,
): Promise<CompleteResult> {
  const user = await requireUserOrThrow();

  if (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 1000) {
    return { error: "Enter a valid number of minutes (1-1000)." };
  }

  const session = await db.studySession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true, status: true, title: true, plannedMinutes: true, assignmentId: true },
  });
  if (!session) return { error: "Study session not found." };
  if (session.status !== "IN_PROGRESS") {
    return { error: "This session was already finished." };
  }

  const now = new Date();
  await db.studySession.update({
    where: { id: session.id },
    data: { status: "COMPLETED", endedAt: now, actualMinutes },
  });

  await logEvent(user.id, "study_session_completed", {
    sessionId: session.id,
    plannedMinutes: session.plannedMinutes,
    actualMinutes,
  });

  revalidatePath("/", "layout");

  return {
    success: true,
    summary: {
      title: session.title,
      plannedMinutes: session.plannedMinutes,
      actualMinutes,
    },
  };
}

/** Abandons a session. The reason is optional, structured, and never
 * required — see docs/PRODUCT.md's "don't force students to explain
 * themselves" note in the audit that scoped this feature. */
export async function abandonSession(
  sessionId: string,
  reason?: AbandonReasonValue,
): Promise<SimpleResult> {
  const user = await requireUserOrThrow();

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

  revalidatePath("/", "layout");

  return { success: true };
}
