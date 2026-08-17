export type PriorityValue = "LOW" | "MEDIUM" | "HIGH";

export type ReasonCode =
  | "OVERDUE"
  | "EXAM_PROXIMITY"
  | "DUE_SOON"
  | "HIGH_PRIORITY"
  | "STANDARD";

export interface WorkItem {
  kind: "assignment" | "exam";
  id: string;
  classId: string;
  title: string;
  className: string;
  classColor: string;
  priority: PriorityValue;
  classPriority: PriorityValue;
  dueAt: Date;
  /** What the scheduler actually plans and scores against — the raw
   * estimate, personalized by the student's own StudySession history when
   * there's enough of it (see src/lib/estimation). Equal to
   * rawEstimatedMinutes when no personalization applies. */
  remainingMinutes: number;
  /** The un-adjusted number from Assignment.estimatedMinutes /
   * Exam.prepMinutes — the student's or import's own input, never silently
   * rewritten. Kept alongside remainingMinutes so the UI can show both. */
  rawEstimatedMinutes: number;
  estimateAdjusted: boolean;
}

export interface AvailabilityWindow {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startMinute: number;
  endMinute: number;
}

export interface ScoreBreakdown {
  urgency: number;
  importance: number;
  overdue: number;
  examProximity: number;
  effortTiebreak: number;
}

export interface ScoredItem {
  item: WorkItem;
  score: number;
  reasonCode: ReasonCode;
  breakdown: ScoreBreakdown;
}

export interface ScheduledSession {
  item: WorkItem;
  scheduledDate: string; // "YYYY-MM-DD", local calendar date
  scheduledMinutes: number;
  score: number;
  reasonCode: ReasonCode;
}

export interface PlanInput {
  workItems: WorkItem[];
  availability: AvailabilityWindow[];
  now: Date;
  horizonDays?: number;
}

export interface PlanResult {
  scored: ScoredItem[];
  sessions: ScheduledSession[];
  /** Minutes of remaining work per item id that didn't fit in the horizon. */
  unscheduledMinutesByItem: Record<string, number>;
}
