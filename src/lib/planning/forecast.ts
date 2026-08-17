import { calendarDaysUntil } from "./score";
import type { ScoredItem } from "./types";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface WeekForecast {
  label: string;
  startDaysFromNow: number;
  estimatedMinutes: number;
  availableMinutes: number;
  risk: RiskLevel;
  /** Highest-scored items due in this window — what's driving the pressure. */
  topItems: { id: string; title: string; className: string; classColor: string }[];
}

const WEEK_LABELS = ["This week", "Next week", "The week after"];
const WEEK_COUNT = 3;
const DAYS_PER_WEEK = 7;

/** Exported so callers simulating a hypothetical change (e.g. the what-if
 * "what happens if I skip today" comparison) can classify risk exactly the
 * way the real forecast does, instead of re-deriving the same thresholds. */
export function riskFor(estimated: number, available: number): RiskLevel {
  if (available <= 0) return "unknown";
  const ratio = estimated / available;
  if (ratio > 1) return "high";
  if (ratio > 0.75) return "medium";
  return "low";
}

/**
 * Buckets already-scored work by which week its deadline falls in, and
 * compares it to available study time. Deliberately deterministic — no AI
 * call — reusing weeklyAvailableMinutes (the recurring StudyAvailability
 * pattern) for every bucket, since availability doesn't vary week to week
 * in the current data model (no one-off exceptions yet, see
 * docs/PLANNING_ENGINE.md limitations).
 *
 * Items overdue or due today fall into the "This week" bucket — the
 * pressure is now, not in some future week. Items due beyond the
 * 3-week window aren't counted; this is a near-term forecast, not a
 * semester-long one.
 */
export function buildForecast(
  scored: ScoredItem[],
  weeklyAvailableMinutes: number,
  now: Date,
): WeekForecast[] {
  const weeks: WeekForecast[] = Array.from({ length: WEEK_COUNT }, (_, i) => ({
    label: WEEK_LABELS[i],
    startDaysFromNow: i * DAYS_PER_WEEK,
    estimatedMinutes: 0,
    availableMinutes: weeklyAvailableMinutes,
    risk: "unknown",
    topItems: [],
  }));

  const byWeek: ScoredItem[][] = Array.from({ length: WEEK_COUNT }, () => []);

  for (const s of scored) {
    const daysUntil = calendarDaysUntil(s.item.dueAt, now);
    const weekIndex = daysUntil <= 0 ? 0 : Math.min(WEEK_COUNT - 1, Math.floor(daysUntil / DAYS_PER_WEEK));
    if (daysUntil < WEEK_COUNT * DAYS_PER_WEEK || daysUntil <= 0) {
      weeks[weekIndex].estimatedMinutes += s.item.remainingMinutes;
      byWeek[weekIndex].push(s);
    }
  }

  for (let i = 0; i < WEEK_COUNT; i++) {
    weeks[i].risk = riskFor(weeks[i].estimatedMinutes, weeks[i].availableMinutes);
    weeks[i].topItems = byWeek[i]
      .slice(0, 3)
      .map((s) => ({
        id: s.item.id,
        title: s.item.title,
        className: s.item.className,
        classColor: s.item.classColor,
      }));
  }

  return weeks;
}

export const RISK_SUGGESTIONS: Record<RiskLevel, string[]> = {
  high: [
    "Start the highest-priority items now instead of waiting",
    "Add more study availability if you have any flexibility this week",
    "Talk to a teacher about flexibility on lower-priority work",
  ],
  medium: [
    "Keep an eye on this week — a little more time now avoids a crunch later",
  ],
  low: [],
  unknown: ["Set your study availability in Settings to get a real forecast"],
};
