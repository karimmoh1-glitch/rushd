// Pure helpers for the student's plan overrides (src/server/actions/plan-overrides.ts).

import { addDaysToKey, dayOfWeekForKey } from "@/lib/time/zone";
import { formatDuration, formatDueDate } from "@/lib/format";
import type { PlanResult, WorkKind } from "./types";

/** The Monday after `today` ("YYYY-MM-DD"): "not this week" keeps work off until then. */
export function nextWeekStart(today: string): string {
  const dow = dayOfWeekForKey(today); // 0 Sunday .. 6 Saturday
  const daysToMonday = (8 - dow) % 7 || 7;
  return addDaysToKey(today, daysToMonday);
}

/** A sentence when the plan leaves this item short before its deadline, else undefined. */
export function overrideRisk(
  plan: Pick<PlanResult, "warnings">,
  target: { kind: WorkKind; itemId: string },
  timeZone: string,
  now: Date,
): string | undefined {
  for (const warning of plan.warnings ?? []) {
    if (warning.type !== "DEADLINE_SHORTFALL" || warning.itemId !== target.itemId || warning.kind !== target.kind) continue;
    const due = formatDueDate(warning.dueAt, timeZone, now);
    const when = warning.kind === "exam" ? `before the exam (${due})` : `before it's due (${due})`;
    return `Heads up: ${warning.title} is now ${formatDuration(warning.shortMinutes)} short ${when}.`;
  }
  return undefined;
}
