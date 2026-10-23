import { diffDateKeys } from "@/lib/time/zone";
import { isExamType, isUncertain, type AssessmentType, type Confidence, type DraftAssessment, type SyllabusDraft } from "./types";

// Review rules shared by the preview screen and the confirm action, so both
// agree on what counts as a duplicate and what starts excluded.

export interface ExistingWork {
  title: string;
  /** YYYY-MM-DD in the student's calendar. */
  date: string;
  kind: "assignment" | "exam";
}

export function workKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The existing item this one would duplicate: same title, due within a day of it (or no date to compare). */
export function findDuplicate(item: { title: string; date: string | null }, existing: ExistingWork[]): ExistingWork | null {
  const key = workKey(item.title);
  if (!key) return null;
  for (const work of existing) {
    if (workKey(work.title) !== key) continue;
    if (item.date === null || Math.abs(diffDateKeys(work.date, item.date)) <= 1) return work;
  }
  return null;
}

/** Starts included only when Rushd is sure and it isn't already in the student's work. */
export function includedByDefault(item: DraftAssessment, duplicate: boolean): boolean {
  return !duplicate && !isUncertain(item);
}

/** Rushd's starting study-time estimate for an imported item (the student can change it later). */
export function defaultMinutes(type: AssessmentType): number {
  switch (type) {
    case "quiz":
      return 60;
    case "midterm":
      return 240;
    case "final":
      return 360;
    case "exam":
      return 180;
    case "lab":
      return 90;
    case "paper":
      return 180;
    case "project":
      return 240;
    case "presentation":
      return 120;
    default:
      return 60;
  }
}

export function savedAs(type: AssessmentType): "assignment" | "exam" {
  return isExamType(type) ? "exam" : "assignment";
}

export type ConfidenceCounts = Record<Confidence, number>;

function count(items: { confidence: Confidence }[]): ConfidenceCounts {
  const counts: ConfidenceCounts = { high: 0, medium: 0, low: 0 };
  for (const item of items) counts[item.confidence] += 1;
  return counts;
}

/** Counts only, for the analytics event: never titles, dates, or text. */
export function previewCounts(draft: SyllabusDraft, duplicates: number) {
  return {
    method: draft.method,
    assessments: count(draft.assessments),
    topics: count(draft.topics),
    objectives: draft.objectives.length,
    uncertain: draft.assessments.filter((a) => isUncertain(a)).length,
    duplicates,
  };
}
