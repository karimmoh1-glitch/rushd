import "server-only";
import type { WorkItem } from "./types";

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
 * source of truth for "what counts as open work." */
export function buildWorkItems(
  assignments: AssignmentRow[],
  exams: ExamRow[],
): WorkItem[] {
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
    remainingMinutes: a.estimatedMinutes,
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
    remainingMinutes: e.prepMinutes,
  }));

  return [...fromAssignments, ...fromExams];
}
