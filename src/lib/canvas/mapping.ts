import type { CanvasAssignment } from "./client";

// Turns Canvas API objects into the fields Rushd stores. No network or
// database here, so every rule is tested directly in mapping.test.ts.

/** Whether Canvas says the student is done. Excused, submitted, graded and
 * awaiting review all count; "unsubmitted" does not. */
export function isCompleteInCanvas(assignment: CanvasAssignment): boolean {
  const submission = assignment.submission;
  if (!submission) {
    return false;
  }
  if (submission.excused) {
    return true;
  }
  const state = submission.workflow_state;
  if (state === "submitted" || state === "graded" || state === "pending_review") {
    return true;
  }
  return Boolean(submission.submitted_at);
}

/**
 * A marker for "the completion Canvas reported". Rushd only applies a Canvas
 * completion when this marker changes, so a student who reopens work in Rushd
 * isn't overridden on every sync. Work with no submission time (e.g. excused)
 * gets a fixed placeholder date instead.
 */
export function completionMarker(assignment: CanvasAssignment): Date | null {
  if (!isCompleteInCanvas(assignment)) {
    return null;
  }
  const submittedAt = assignment.submission?.submitted_at;
  if (submittedAt) {
    const date = new Date(submittedAt);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date(Date.UTC(1970, 0, 1, 0, 0, 1));
}

/** Reads Canvas's due_at (Canvas already applies the student's own override).
 * Returns null when it's missing or unreadable; we never invent a date. */
export function parseDueAt(assignment: CanvasAssignment): Date | null {
  if (!assignment.due_at) {
    return null;
  }
  // Require a time zone offset. Without one, the date would be read in the server's zone.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(assignment.due_at)) {
    return null;
  }
  const date = new Date(assignment.due_at);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/**
 * Rushd's starting time estimate in minutes (students can edit it):
 *  - quizzes and discussions: 30 min
 *  - nothing to submit (reading, attendance): 20 min
 *  - everything else: 45 min, scaled by points compared to a 10-point homework (30 to 180 min)
 */
export function estimateMinutes(assignment: CanvasAssignment): number {
  const types = assignment.submission_types ?? [];
  if (types.includes("online_quiz")) {
    return 30;
  }
  if (types.includes("discussion_topic")) {
    return 30;
  }
  const nothingToSubmit = types.length > 0 && types.every((type) => type === "none" || type === "not_graded");
  if (nothingToSubmit) {
    return 20;
  }

  const points = assignment.points_possible;
  const hasPoints = typeof points === "number" && points > 0;
  if (!hasPoints) {
    return 45;
  }
  const scaled = 45 * Math.sqrt(points / 10);
  const roundedTo15 = Math.round(scaled / 15) * 15;
  return Math.max(30, Math.min(180, roundedTo15));
}

/** Only keeps https links on the connected Canvas site, so Canvas data can't
 * make us show a link to somewhere else. */
export function safeCanvasUrl(baseUrl: string, htmlUrl: string | undefined): string | null {
  if (!htmlUrl) {
    return null;
  }
  try {
    const url = new URL(htmlUrl);
    if (url.origin === baseUrl && url.protocol === "https:") {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export interface MappedAssignment {
  canvasAssignmentId: string;
  canvasCourseId: string;
  title: string;
  dueAt: Date;
  pointsPossible: number | null;
  canvasUrl: string | null;
  complete: boolean;
  completionMarker: Date | null;
  defaultEstimate: number;
}

export type SkipReason = "NO_DUE_DATE" | "UNPUBLISHED";

export function mapAssignment(
  baseUrl: string,
  courseId: string,
  assignment: CanvasAssignment,
): { ok: true; value: MappedAssignment } | { ok: false; reason: SkipReason } {
  const state = assignment.workflow_state;
  if (assignment.published === false || state === "unpublished" || state === "deleted") {
    return { ok: false, reason: "UNPUBLISHED" };
  }

  const dueAt = parseDueAt(assignment);
  if (!dueAt) {
    return { ok: false, reason: "NO_DUE_DATE" };
  }

  const title = assignment.name.trim().slice(0, 160) || "Untitled assignment";
  const pointsPossible = typeof assignment.points_possible === "number" ? assignment.points_possible : null;

  return {
    ok: true,
    value: {
      canvasAssignmentId: String(assignment.id),
      canvasCourseId: courseId,
      title,
      dueAt,
      pointsPossible,
      canvasUrl: safeCanvasUrl(baseUrl, assignment.html_url),
      complete: isCompleteInCanvas(assignment),
      completionMarker: completionMarker(assignment),
      defaultEstimate: estimateMinutes(assignment),
    },
  };
}
