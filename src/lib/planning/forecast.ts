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
const TOP_ITEMS_PER_WEEK = 3;

/** Exported so the what-if simulator classifies risk the same way the forecast does. */
export function riskFor(estimated: number, available: number): RiskLevel {
  if (available <= 0) return "unknown";
  const ratio = estimated / available;
  if (ratio > 1) return "high";
  if (ratio > 0.75) return "medium";
  return "low";
}

/**
 * Groups scored work by the week its deadline falls in and compares it to
 * the student's weekly study time. Availability is the same every week, so
 * each week gets the same `weeklyAvailableMinutes`. Overdue work counts
 * toward "This week"; work due after three weeks isn't counted.
 */
export function buildForecast(
  scored: ScoredItem[],
  weeklyAvailableMinutes: number,
  now: Date,
  timeZone?: string | null,
): WeekForecast[] {
  const weeks: WeekForecast[] = [];
  for (let i = 0; i < WEEK_COUNT; i++) {
    weeks.push({
      label: WEEK_LABELS[i],
      startDaysFromNow: i * DAYS_PER_WEEK,
      estimatedMinutes: 0,
      availableMinutes: weeklyAvailableMinutes,
      risk: "unknown",
      topItems: [],
    });
  }

  // `scored` is already in rank order, so the first items added are the top ones.
  for (const scoredItem of scored) {
    const daysUntilDue = calendarDaysUntil(scoredItem.item.dueAt, now, timeZone);
    if (daysUntilDue >= WEEK_COUNT * DAYS_PER_WEEK) continue;

    let weekIndex = 0;
    if (daysUntilDue > 0) {
      weekIndex = Math.floor(daysUntilDue / DAYS_PER_WEEK);
    }

    const week = weeks[weekIndex];
    week.estimatedMinutes += scoredItem.item.remainingMinutes;
    if (week.topItems.length < TOP_ITEMS_PER_WEEK) {
      week.topItems.push({
        id: scoredItem.item.id,
        title: scoredItem.item.title,
        className: scoredItem.item.className,
        classColor: scoredItem.item.classColor,
      });
    }
  }

  for (const week of weeks) {
    week.risk = riskFor(week.estimatedMinutes, week.availableMinutes);
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
