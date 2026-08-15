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
  remainingMinutes: number;
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
