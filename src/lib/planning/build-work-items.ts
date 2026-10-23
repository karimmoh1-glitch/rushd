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

interface EstimateFields {
  remainingMinutes: number;
  rawEstimatedMinutes: number;
  estimateAdjusted: boolean;
}

/** The estimate fields of a WorkItem. Without a profile, the raw estimate is used as is. */
function estimateFields(
  rawMinutes: number,
  className: string,
  estimationProfile?: EstimationProfile,
): EstimateFields {
  if (!estimationProfile) {
    return { remainingMinutes: rawMinutes, rawEstimatedMinutes: rawMinutes, estimateAdjusted: false };
  }
  const adjusted = adjustEstimate(rawMinutes, className, estimationProfile);
  return {
    remainingMinutes: adjusted.minutes,
    rawEstimatedMinutes: rawMinutes,
    estimateAdjusted: adjusted.adjusted,
  };
}

/**
 * Builds the planning engine's WorkItem list from database rows. The caller
 * passes only open work; this function doesn't filter by status.
 * `estimationProfile`, when given, personalizes the minutes using the
 * student's study history (see src/lib/estimation).
 */
export function buildWorkItems(
  assignments: AssignmentRow[],
  exams: ExamRow[],
  estimationProfile?: EstimationProfile,
): WorkItem[] {
  const workItems: WorkItem[] = [];

  for (const assignment of assignments) {
    workItems.push({
      kind: "assignment",
      id: assignment.id,
      classId: assignment.classId,
      title: assignment.title,
      className: assignment.class.name,
      classColor: assignment.class.color,
      priority: assignment.priority,
      classPriority: assignment.class.priority,
      dueAt: assignment.dueAt,
      ...estimateFields(assignment.estimatedMinutes, assignment.class.name, estimationProfile),
    });
  }

  for (const exam of exams) {
    workItems.push({
      kind: "exam",
      id: exam.id,
      classId: exam.classId,
      title: exam.title,
      className: exam.class.name,
      classColor: exam.class.color,
      priority: exam.priority,
      classPriority: exam.class.priority,
      dueAt: exam.examAt,
      ...estimateFields(exam.prepMinutes, exam.class.name, estimationProfile),
    });
  }

  return workItems;
}
