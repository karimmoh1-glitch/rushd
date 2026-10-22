// Every number the scoring/scheduling engine uses lives here, named and
// commented, so "why did this rank above that" always has a one-line
// answer. See docs/PLANNING_ENGINE.md for the full walkthrough.

export const SCORING_WEIGHTS = {
  /** Points lost per full day until the deadline (floors at 0). */
  urgencyPerDay: 12,
  /** Ceiling on the urgency component. */
  urgencyMax: 100,
  /** Flat points added per item priority. */
  priorityWeight: { LOW: 5, MEDIUM: 15, HIGH: 30 } as Record<
    "LOW" | "MEDIUM" | "HIGH",
    number
  >,
  /** The owning class's priority counts, but at half weight of the item's own. */
  classPriorityMultiplier: 0.5,
  /** Flat bonus applied the moment something is overdue at all. */
  overdueBase: 40,
  /** Additional points per full day overdue. */
  overduePerDay: 2,
  /** Total overdue contribution (base + perDay) never exceeds this. */
  overdueCap: 60,
  /** Exams inside this many days get an escalating proximity bonus. */
  examProximityWindowDays: 7,
  /** Points per day closer, within the proximity window. */
  examProximityPerDay: 8,
  /** Small nudge toward shorter tasks when otherwise tied — never dominant. */
  effortTiebreakMax: 20,
  effortTiebreakDivisor: 10,
  effortTiebreakWeight: 0.3,
} as const;

/** No single scheduled block is longer than this — spreads large workloads
 * across multiple sessions/days instead of one unrealistic sitting. */
export const MAX_SESSION_MINUTES = 90;

/** Default planning horizon when the caller doesn't specify one. Also the
 * number of days the plan page shows. */
export const DEFAULT_HORIZON_DAYS = 7;

/** How far ahead the scheduler looks when checking whether deadlines are
 * actually achievable. Longer than the days shown, so a crunch three weeks
 * out is reported before it's an emergency. */
export const PLANNING_HORIZON_DAYS = 28;

/** Work is not scheduled earlier than this many days before it's due. A
 * semester of imported Canvas assignments would otherwise bury this week
 * under work that isn't due for a month. */
export const LEAD_WINDOW_DAYS = 14;

/** Smallest block worth scheduling (unless the whole task is shorter). */
export const MIN_BLOCK_MINUTES = 15;

/** Student-configurable defaults (Profile.preferredSessionMinutes etc.). */
export const DEFAULT_PREFERRED_SESSION_MINUTES = 60;
export const DEFAULT_MAX_DAILY_MINUTES = 240;
export const DEFAULT_BREAK_MINUTES = 10;
export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 90] as const;

export const REASON_LABELS: Record<
  import("./types").ReasonCode,
  string
> = {
  OVERDUE: "Overdue — do this first",
  EXAM_PROXIMITY: "Exam coming up soon",
  DUE_SOON: "Due soon",
  HIGH_PRIORITY: "Marked high priority",
  STANDARD: "Part of your regular workload",
};
