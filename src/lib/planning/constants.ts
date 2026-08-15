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

/** Default planning horizon when the caller doesn't specify one. */
export const DEFAULT_HORIZON_DAYS = 7;

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
