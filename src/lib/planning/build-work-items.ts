import "server-only";
import type { WorkItem } from "./types";
import { adjustEstimate, type EstimationProfile } from "@/lib/estimation/build-estimation-profile";

interface ClassFields {
  name: string;
  color: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  /** Local date keys for the course's term, when set (see outcomes.dateColumnKey). */
  termStart?: string | null;
  termEnd?: string | null;
}

interface AssignmentRow {
  id: string;
  classId: string;
  title: string;
  dueAt: Date;
  estimatedMinutes: number;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  /** Share of the grade in percent; null when unknown. Undefined = not loaded. */
  weightPercent?: number | null;
  class: ClassFields;
}

interface ExamRow {
  id: string;
  classId: string;
  title: string;
  examAt: Date;
  prepMinutes: number;
  priority: "LOW" | "MEDIUM" | "HIGH";
  weightPercent?: number | null;
  class: ClassFields;
}

type EstimateFields = Pick<WorkItem, "remainingMinutes" | "rawEstimatedMinutes" | "estimateAdjusted" | "estimateNote">;

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
  const fields: EstimateFields = {
    remainingMinutes: adjusted.minutes,
    rawEstimatedMinutes: rawMinutes,
    estimateAdjusted: adjusted.adjusted,
  };
  if (adjusted.adjusted && adjusted.source !== "none") {
    const sampleSize =
      adjusted.source === "class"
        ? (estimationProfile.byClass.find((c) => c.className === className)?.sampleSize ?? 0)
        : estimationProfile.overallSampleSize;
    fields.estimateNote = { percentOff: adjusted.percentOff, sampleSize, source: adjusted.source };
  }
  return fields;
}

function termOf(cls: ClassFields): WorkItem["term"] {
  if (cls.termStart === undefined && cls.termEnd === undefined) return undefined;
  return { start: cls.termStart ?? null, end: cls.termEnd ?? null };
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
    const item: WorkItem = {
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
    };
    if (assignment.weightPercent !== undefined) item.weightPercent = assignment.weightPercent;
    const term = termOf(assignment.class);
    if (term) item.term = term;
    workItems.push(item);
  }

  for (const exam of exams) {
    const item: WorkItem = {
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
    };
    if (exam.weightPercent !== undefined) item.weightPercent = exam.weightPercent;
    const term = termOf(exam.class);
    if (term) item.term = term;
    workItems.push(item);
  }

  return workItems;
}
