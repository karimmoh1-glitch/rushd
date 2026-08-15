import { calendarDaysUntil } from "./score";
import type { ScoredItem } from "./types";

/**
 * Turns a scored item's actual breakdown into plain-language reasons —
 * not an AI-generated rationalization. The real reason the deterministic
 * scorer ranked something where it did is already known exactly (it's
 * arithmetic), so this reads the math instead of asking a model to guess
 * at its own explanation. See docs/PLANNING_ENGINE.md and the "Why?"
 * requirement: every important recommendation should be explainable, and
 * the most trustworthy explanation is the true one.
 */
export function explainScore(scored: ScoredItem, now: Date): string[] {
  const { item, breakdown } = scored;
  const daysUntil = calendarDaysUntil(item.dueAt, now);
  const reasons: string[] = [];

  if (breakdown.overdue > 0) {
    const daysLate = Math.max(0, -daysUntil);
    reasons.push(
      daysLate <= 0
        ? "Overdue."
        : `Overdue by ${daysLate} day${daysLate === 1 ? "" : "s"}.`,
    );
  } else if (daysUntil <= 0) {
    reasons.push(item.kind === "exam" ? "Exam is today." : "Due today.");
  } else if (daysUntil === 1) {
    reasons.push(item.kind === "exam" ? "Exam is tomorrow." : "Due tomorrow.");
  } else if (daysUntil <= 7) {
    reasons.push(
      item.kind === "exam" ? `Exam in ${daysUntil} days.` : `Due in ${daysUntil} days.`,
    );
  }

  if (breakdown.examProximity > 0) {
    reasons.push("The exam is close enough that prep time matters now.");
  }

  if (item.priority === "HIGH") {
    reasons.push("You marked this high priority.");
  }
  if (item.classPriority === "HIGH" && item.priority !== "HIGH") {
    reasons.push(`${item.className} is a high-priority class for you.`);
  }

  if (reasons.length === 0) {
    reasons.push("Part of your regular workload — nothing urgent, but worth doing.");
  }

  return reasons;
}
