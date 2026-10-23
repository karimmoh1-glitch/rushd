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
  /** The minutes the scheduler plans and scores with: the raw estimate,
   * adjusted by the student's study history when there's enough of it. */
  remainingMinutes: number;
  /** The student's own estimate, never rewritten. Kept so the UI can show both. */
  rawEstimatedMinutes: number;
  estimateAdjusted: boolean;
  /** Where the work came from. Optional so older callers and tests still work. */
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

/** A study block the student placed or locked by hand. The scheduler never
 * moves it; it reserves the time and counts toward the item's work. */
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
  /** The student's IANA timezone. Defaults to the runtime's zone. */
  timeZone?: string | null;
  preferences?: PlanPreferences;
  pinnedBlocks?: PinnedBlock[];
}

export type DayStatus = "none" | "open" | "balanced" | "full";

export interface DayPlan {
  date: string;
  dayOfWeek: number;
  /** Minutes inside the availability windows that day (for today, only what's still ahead). */
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
  /** Minutes per item id that can't fit before the deadline (or, for overdue
   * work, anywhere in the horizon). Work that's just too far out is in
   * deferredMinutesByItem instead. */
  unscheduledMinutesByItem: Record<string, number>;
  /** Minutes not planned yet because the deadline is past the horizon. Not a problem. */
  deferredMinutesByItem?: Record<string, number>;
  days?: DayPlan[];
  warnings?: PlanWarning[];
}
