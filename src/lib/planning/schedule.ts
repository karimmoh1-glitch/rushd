import { MAX_SESSION_MINUTES, DEFAULT_HORIZON_DAYS } from "./constants";
import { scoreAndRank } from "./score";
import type {
  PlanInput,
  PlanResult,
  AvailabilityWindow,
  ScheduledSession,
} from "./types";

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Expands recurring weekly availability into per-date minute totals for
 * every date in [start, start + horizonDays). */
function buildDailyCapacity(
  availability: AvailabilityWindow[],
  start: Date,
  horizonDays: number,
): Map<string, number> {
  const capacity = new Map<string, number>();
  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(start, i);
    const dow = date.getDay();
    const minutes = availability
      .filter((w) => w.dayOfWeek === dow)
      .reduce((sum, w) => sum + Math.max(0, w.endMinute - w.startMinute), 0);
    capacity.set(dateKey(date), minutes);
  }
  return capacity;
}

/**
 * Deterministic plan generation. See docs/PLANNING_ENGINE.md for the full
 * explanation of scoring and scheduling behavior.
 */
export function generatePlan(input: PlanInput): PlanResult {
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = startOfDay(input.now);
  const horizonEnd = addDays(today, horizonDays - 1);

  const scored = scoreAndRank(input.workItems, input.now);
  const dailyCapacity = buildDailyCapacity(input.availability, today, horizonDays);

  const sessions: ScheduledSession[] = [];
  const unscheduledMinutesByItem: Record<string, number> = {};

  for (const scoredItem of scored) {
    const { item } = scoredItem;
    let remaining = item.remainingMinutes;

    // Once something is overdue, keep offering it any open capacity in the
    // horizon (catching up is still useful). Otherwise, never schedule
    // study time for it after its own due date — that would be pointless.
    const dueDay = startOfDay(item.dueAt);
    const isOverdue = item.dueAt.getTime() < input.now.getTime();
    const cutoff = isOverdue ? horizonEnd : dueDay < horizonEnd ? dueDay : horizonEnd;

    for (
      let date = today;
      date <= cutoff && remaining > 0;
      date = addDays(date, 1)
    ) {
      const key = dateKey(date);
      const available = dailyCapacity.get(key) ?? 0;
      if (available <= 0) continue;

      const chunk = Math.min(remaining, available, MAX_SESSION_MINUTES);
      if (chunk <= 0) continue;

      sessions.push({
        item,
        scheduledDate: key,
        scheduledMinutes: chunk,
        score: scoredItem.score,
        reasonCode: scoredItem.reasonCode,
      });
      dailyCapacity.set(key, available - chunk);
      remaining -= chunk;
    }

    if (remaining > 0) {
      unscheduledMinutesByItem[item.id] = remaining;
    }
  }

  return { scored, sessions, unscheduledMinutesByItem };
}
