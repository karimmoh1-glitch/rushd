"use server";

import { revalidatePath } from "next/cache";
import { requireUserOrThrow } from "@/lib/auth/dal";
import {
  abandonStudySession,
  completeStudySession,
  getActiveStudySession,
  startStudySession,
  type AbandonReasonValue,
  type ActiveSessionData,
  type CompleteResult,
  type PerceivedDifficultyValue,
  type SessionTarget,
  type SimpleResult,
  type StartResult,
  type StudySessionSource,
} from "@/lib/study-sessions/service";

// The logic lives in src/lib/study-sessions/service.ts, shared with the
// native app's API. These actions add the cookie session and revalidation.

export type {
  AbandonReasonValue,
  ActiveSessionData,
  CompletedSessionSummary,
  PerceivedDifficultyValue,
  StudySessionSource,
} from "@/lib/study-sessions/service";

/** Fetches the current user's in-progress session, if any. Used by the app
 * layout to render the persistent active-session bar on every page. */
export async function getActiveSession(): Promise<ActiveSessionData | null> {
  const user = await requireUserOrThrow();
  return getActiveStudySession(user.id);
}

/** Starts a study session for one assignment or exam. Only one session can be
 * IN_PROGRESS at a time, because the active-session bar shows just one. */
export async function startSession(
  target: SessionTarget,
  source: StudySessionSource,
): Promise<StartResult> {
  const user = await requireUserOrThrow();
  const result = await startStudySession(user.id, target, source);
  if ("success" in result) revalidatePath("/", "layout");
  return result;
}

/** Completes a session with the minutes the student confirmed. The browser's
 * elapsed time is only a suggestion: an open tab isn't focused time. */
export async function completeSession(
  sessionId: string,
  actualMinutes: number,
  perceivedDifficulty?: PerceivedDifficultyValue,
): Promise<CompleteResult> {
  const user = await requireUserOrThrow();
  const result = await completeStudySession(user.id, sessionId, actualMinutes, perceivedDifficulty);
  if ("success" in result) revalidatePath("/", "layout");
  return result;
}

/** Abandons a session. The reason is optional: students never have to explain. */
export async function abandonSession(
  sessionId: string,
  reason?: AbandonReasonValue,
): Promise<SimpleResult> {
  const user = await requireUserOrThrow();
  const result = await abandonStudySession(user.id, sessionId, reason);
  if ("success" in result) revalidatePath("/", "layout");
  return result;
}
