import type { CanvasAssignment } from "./client";

// Pure translation from Canvas API objects to the fields Rushd stores. No I/O,
// so every rule here is unit-tested directly (mapping.test.ts).

/** Whether Canvas says the student is done with this assignment. Excused,
 * submitted, graded and awaiting-review all count; "unsubmitted" (including
 * missing/late flags) does not. */
export function isCompleteInCanvas(a: CanvasAssignment): boolean {
  const s = a.submission;
  if (!s) return false;
  if (s.excused) return true;
  if (s.workflow_state === "submitted" || s.workflow_state === "graded" || s.workflow_state === "pending_review") {
    return true;
  }
  return Boolean(s.submitted_at);
}

/**
 * A marker for "the completion Canvas reported." Rushd only applies a Canvas
 * completion when this marker is new, so a student who deliberately reopens
 * an assignment in Rushd isn't overridden by every subsequent sync — only by
 * a genuinely new submission. Excused/graded-without-submission work has no
 * timestamp, so it gets a fixed sentinel (applied once, then stable).
 */
export function completionMarker(a: CanvasAssignment): Date | null {
  if (!isCompleteInCanvas(a)) return null;
  const at = a.submission?.submitted_at;
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.UTC(1970, 0, 1, 0, 0, 1));
}

/** Parses Canvas's due_at (ISO 8601 with offset, typically UTC "Z"). Canvas
 * already applies the student's section/individual override to due_at for
 * the requesting user. Returns null when absent or unparseable — such work
 * can't be scheduled and is reported, never given an invented date. */
export function parseDueAt(a: CanvasAssignment): Date | null {
  if (!a.due_at) return null;
  // Require an explicit offset so the instant is unambiguous; a bare
  // "2026-10-23T23:59:00" would be read in the server's zone.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(a.due_at)) return null;
  const d = new Date(a.due_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Rushd's starting estimate for an imported assignment, in minutes. Canvas
 * has no notion of effort, so this is a transparent heuristic — shown as an
 * estimate the student can edit, never presented as fact:
 *
 *   quizzes / discussion posts .............. 30 min
 *   no submission (reading, attendance) ..... 20 min
 *   everything else: 45 min, scaled up by points possible relative to a
 *   typical 10-point homework (capped at 180 min).
 */
export function estimateMinutes(a: CanvasAssignment): number {
  const types = a.submission_types ?? [];
  if (types.includes("online_quiz")) return 30;
  if (types.includes("discussion_topic")) return 30;
  if (types.length > 0 && types.every((t) => t === "none" || t === "not_graded")) return 20;

  const points = typeof a.points_possible === "number" && a.points_possible > 0 ? a.points_possible : null;
  if (points === null) return 45;
  const scaled = 45 * Math.sqrt(points / 10);
  return Math.max(30, Math.min(180, Math.round(scaled / 15) * 15));
}

/** Only https links on the connected Canvas origin are kept — never render a
 * link Canvas data could point elsewhere. */
export function safeCanvasUrl(baseUrl: string, htmlUrl: string | undefined): string | null {
  if (!htmlUrl) return null;
  try {
    const u = new URL(htmlUrl);
    return u.origin === baseUrl && u.protocol === "https:" ? u.toString() : null;
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
  a: CanvasAssignment,
): { ok: true; value: MappedAssignment } | { ok: false; reason: SkipReason } {
  if (a.published === false || a.workflow_state === "unpublished" || a.workflow_state === "deleted") {
    return { ok: false, reason: "UNPUBLISHED" };
  }
  const dueAt = parseDueAt(a);
  if (!dueAt) return { ok: false, reason: "NO_DUE_DATE" };
  return {
    ok: true,
    value: {
      canvasAssignmentId: String(a.id),
      canvasCourseId: courseId,
      title: a.name.trim().slice(0, 160) || "Untitled assignment",
      dueAt,
      pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
      canvasUrl: safeCanvasUrl(baseUrl, a.html_url),
      complete: isCompleteInCanvas(a),
      completionMarker: completionMarker(a),
      defaultEstimate: estimateMinutes(a),
    },
  };
}
