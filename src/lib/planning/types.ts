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
  /** Where the work came from. Optional so older callers/tests are unchanged;
   * "CANVAS" items are shown with their origin in the UI. */
  source?: "MANUAL" | "CANVAS" | "TEAMS" | "CALENDAR";
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

/** A study block the student placed or locked by hand. The scheduler treats
 * it as a fixed commitment: it reserves the time, counts toward the item's
 * remaining work, and is never moved or dropped by regeneration. */
export interface PinnedBlock {
  id: string;
  kind: "assignment" | "exam";
  itemId: string;
  date: string; // "YYYY-MM-DD" in the student's timezone
  startMinute: number; // minutes from local midnight
  durationMinutes: number;
}

export interface PlanPreferences {
  /** Target length of one study block. Defaults to MAX_SESSION_MINUTES. */
  preferredSessionMinutes?: number;
  /** Ceiling on total planned study per day. null/undefined = no ceiling. */
  maxDailyMinutes?: number | null;
  /** Gap left between back-to-back blocks. Defaults to 0. */
  breakMinutes?: number;
}

export interface ScheduledSession {
  item: WorkItem;
  scheduledDate: string; // "YYYY-MM-DD", the student's local calendar date
  scheduledMinutes: number;
  /** Minutes from local midnight. Always set by the engine. */
  startMinute?: number;
  endMinute?: number;
  score: number;
  reasonCode: ReasonCode;
  /** True for blocks the student pinned; they never move on regeneration. */
  pinned?: boolean;
  blockId?: string;
}

export interface PlanInput {
  workItems: WorkItem[];
  availability: AvailabilityWindow[];
  now: Date;
  horizonDays?: number;
  /** IANA zone the student lives in; days/times are read in it. Defaults to
   * the runtime's zone (kept for tests and older callers). */
  timeZone?: string | null;
  preferences?: PlanPreferences;
  pinnedBlocks?: PinnedBlock[];
}

export type DayStatus = "none" | "open" | "balanced" | "full";

export interface DayPlan {
  date: string;
  dayOfWeek: number;
  /** Minutes inside the student's availability windows that day (for today,
   * only what's still ahead of the clock). */
  availableMinutes: number;
  plannedMinutes: number;
  status: DayStatus;
}

export type PlanWarning =
  | { type: "NO_AVAILABILITY" }
  | {
      type: "DEADLINE_SHORTFALL";
      itemId: string;
      kind: "assignment" | "exam";
      title: string;
      className: string;
      dueAt: Date;
      overdue: boolean;
      /** Minutes of this item that cannot be placed before its deadline. */
      shortMinutes: number;
    }
  | {
      type: "OVERLOADED_DAY";
      /** Local date the shortfall lands on (the deadline day). */
      date: string;
      shortMinutes: number;
      availableMinutes: number;
      plannedMinutes: number;
    };

export interface PlanResult {
  scored: ScoredItem[];
  sessions: ScheduledSession[];
  /** Minutes per item id that cannot fit before the item's deadline within
   * the planning horizon (or, for overdue work, within the horizon at all).
   * Work that is simply too far out to plan yet is NOT listed here — see
   * deferredMinutesByItem. */
  unscheduledMinutesByItem: Record<string, number>;
  /** Minutes held back because the deadline is beyond the planning lead
   * window — not a problem, just not scheduled yet. */
  deferredMinutesByItem?: Record<string, number>;
  days?: DayPlan[];
  warnings?: PlanWarning[];
}
