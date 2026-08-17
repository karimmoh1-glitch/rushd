import "server-only";
import type { WorkItem } from "./types";
import { adjustEstimate, type EstimationProfile } from "@/lib/estimation/build-estimation-profile";

interface AssignmentRow {
  id: string;
  classId: string;
  title: string;
  dueAt: Date;
  estimatedMinutes: number;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  class: { name: string; color: string; priority: "LOW" | "MEDIUM" | "HIGH" };
}

interface ExamRow {
  id: string;
  classId: string;
  title: string;
  examAt: Date;
  prepMinutes: number;
  priority: "LOW" | "MEDIUM" | "HIGH";
  class: { name: string; color: string; priority: "LOW" | "MEDIUM" | "HIGH" };
}

/** Builds the planning engine's WorkItem list from raw DB rows. Only
 * incomplete assignments and exams should be passed in — this function
 * doesn't filter by status itself, so the caller's query is the single
 * source of truth for "what counts as open work."
 *
 * `estimationProfile`, when provided, personalizes remainingMinutes using
 * the student's real StudySession history (see src/lib/estimation) — the
 * "measurement -> better prediction" half of the loop. Omitting it (as
 * existing tests do) falls back to the raw, un-personalized estimate
 * exactly as before; this keeps the function's default behavior unchanged
 * for every caller that hasn't opted in yet. */
export function buildWorkItems(
  assignments: AssignmentRow[],
  exams: ExamRow[],
  estimationProfile?: EstimationProfile,
): WorkItem[] {
  const withEstimate = (rawMinutes: number, className: string) => {
    if (!estimationProfile) {
      return { remainingMinutes: rawMinutes, rawEstimatedMinutes: rawMinutes, estimateAdjusted: false };
    }
    const adjusted = adjustEstimate(rawMinutes, className, estimationProfile);
    return {
      remainingMinutes: adjusted.minutes,
      rawEstimatedMinutes: rawMinutes,
      estimateAdjusted: adjusted.adjusted,
    };
  };

  const fromAssignments: WorkItem[] = assignments.map((a) => ({
    kind: "assignment",
    id: a.id,
    classId: a.classId,
    title: a.title,
    className: a.class.name,
    classColor: a.class.color,
    priority: a.priority,
    classPriority: a.class.priority,
    dueAt: a.dueAt,
    ...withEstimate(a.estimatedMinutes, a.class.name),
  }));

  const fromExams: WorkItem[] = exams.map((e) => ({
    kind: "exam",
    id: e.id,
    classId: e.classId,
    title: e.title,
    className: e.class.name,
    classColor: e.class.color,
    priority: e.priority,
    classPriority: e.class.priority,
    dueAt: e.examAt,
    ...withEstimate(e.prepMinutes, e.class.name),
  }));

  return [...fromAssignments, ...fromExams];
}
