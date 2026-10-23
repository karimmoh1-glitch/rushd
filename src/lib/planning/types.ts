export type PriorityValue = "LOW" | "MEDIUM" | "HIGH";

export type ReasonCode =
  | "OVERDUE"
  | "REVIEW_DUE"
  | "EXAM_PROXIMITY"
  | "DUE_SOON"
  | "HIGH_PRIORITY"
  | "HIGH_WEIGHT"
  | "STANDARD";

export type WorkKind = "assignment" | "exam" | "review";

/** How a course's confirmed topics stand, from the mastery estimator. */
export interface MasterySummary {
  total: number;
  secure: number;
  developing: number;
  needsReview: number;
  /** Topics with too little evidence to say (including never practiced). */
  unknown: number;
}

/** One topic inside a review block. */
export interface ReviewTopic {
  topicId: string;
  title: string;
  status: "secure" | "developing" | "needs_review" | "not_enough_evidence";
  /** Whole days since the last clean recall; null if never recalled cleanly. */
  daysSinceRecall: number | null;
  /** Days past its review date (0 when due today). */
  overdueDays: number;
  /** The review interval it was on, in days. */
  intervalDays: number;
}

/** Why an exam's prep time differs from the student's own number. */
export interface PrepAdjustment {
  baseMinutes: number;
  factor: number;
  mastery: MasterySummary;
}

export interface WorkItem {
  kind: WorkKind;
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

  // Optional planner inputs. Every one of them is opt-in: when a caller leaves
  // a field undefined (the public demo tools do), scoring is exactly as before.

  /** Share of the course grade in percent. null = the student doesn't know
   * (exams then get the default exam weight); undefined = not modeled. */
  weightPercent?: number | null;
  /** The course's mastery picture (exams only, when the course has topics). */
  mastery?: MasterySummary;
  /** Set when exam prep minutes were scaled by mastery. */
  prep?: PrepAdjustment;
  /** Review blocks: the due topics, most urgent first. */
  review?: { topics: ReviewTopic[]; examDaysAway: number | null };
  /** Observed pace for this course, when the estimate was adjusted. */
  estimateNote?: { percentOff: number; sampleSize: number; source: "class" | "overall" };
  /** The course's term, as local date keys. No work is planned outside it. */
  term?: { start: string | null; end: string | null };
  /** Soft work (reviews): no catch-up packing, and no deadline warning when it doesn't fit. */
  soft?: boolean;
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
  /** Grade weight when known; the default exam weight when it isn't. */
  assessmentWeight: number;
  /** Exams: how much of the course's topic map is weak, scaled by closeness. */
  masteryGap: number;
  /** Review blocks: how overdue, how weak, and whether an exam is near. */
  reviewUrgency: number;
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

/** A student's "not now": keep this item off one day, or before a day. */
export interface PlanExclusion {
  kind: WorkKind;
  itemId: string;
  /** "skip": not on `date`. "not_this_week": not before `date`. */
  type: "skip" | "not_this_week";
  date: string;
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
  exclusions?: PlanExclusion[];
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
      kind: WorkKind;
      title: string;
      className: string;
      dueAt: Date;
      overdue: boolean;
      /** Minutes of this item that cannot be placed before its deadline. */
      shortMinutes: number;
      /** Set when the student's own override is what took the time away. */
      override?: "skip" | "not_this_week";
    }
  | {
      /** The work falls outside its course's term dates, so it isn't planned. */
      type: "OUTSIDE_TERM";
      itemId: string;
      kind: WorkKind;
      title: string;
      className: string;
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
