import { calendarDaysUntil } from "./score";
import type { ScoredItem } from "./types";

/** How much more effort an item needs, relative to the rest of the open
 * workload, before it's worth mentioning as "more work than the others."
 * 1.3 means "at least 30% above the average of everything else open." */
const EFFORT_STANDOUT_RATIO = 1.3;
/** Below this, an item's own effort is trivial enough that comparing it to
 * the average would be noise (e.g. a 10-minute reading vs a 12-minute one). */
const EFFORT_STANDOUT_FLOOR_MINUTES = 20;

/** True if `item` requires meaningfully more time than the rest of the
 * currently-open workload — computed from the same remainingMinutes the
 * scheduler actually uses, not a guess. */
function isEffortStandout(scored: ScoredItem, allScored: ScoredItem[]): boolean {
  const others = allScored.filter((s) => s.item.id !== scored.item.id);
  if (others.length === 0) return false;
  const avg = others.reduce((sum, s) => sum + s.item.remainingMinutes, 0) / others.length;
  return (
    scored.item.remainingMinutes >= EFFORT_STANDOUT_FLOOR_MINUTES &&
    scored.item.remainingMinutes >= avg * EFFORT_STANDOUT_RATIO
  );
}

/**
 * Turns a scored item's actual breakdown into plain-language reasons —
 * not an AI-generated rationalization. The real reason the deterministic
 * scorer ranked something where it did is already known exactly (it's
 * arithmetic), so this reads the math instead of asking a model to guess
 * at its own explanation. See docs/PLANNING_ENGINE.md and the "Why?"
 * requirement: every important recommendation should be explainable, and
 * the most trustworthy explanation is the true one.
 *
 * `allScored`, when provided, unlocks one additional reason: whether this
 * item needs meaningfully more time than the rest of the open workload —
 * a real comparison, computed from the same numbers the scheduler used.
 */
export function explainScore(scored: ScoredItem, now: Date, allScored?: ScoredItem[]): string[] {
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

  if (allScored && isEffortStandout(scored, allScored)) {
    reasons.push("It needs more time than most of your other open work.");
  }

  if (reasons.length === 0) {
    reasons.push("Part of your regular workload — nothing urgent, but worth doing.");
  }

  return reasons;
}

/**
 * Composes one natural sentence explaining why an item is ranked where it
 * is — used where a single confident statement reads better than a bullet
 * list (One Thing's headline explanation, e.g. "Prioritized because it's
 * due in 2 days and it needs more time than most of your other open
 * work."). Built from the same breakdown as explainScore(), with each
 * clause hand-composed for sentence flow rather than mechanically joining
 * the bullet strings (which don't share one grammatical shape).
 */
export function explainScoreSentence(scored: ScoredItem, now: Date, allScored?: ScoredItem[]): string {
  const { item, breakdown } = scored;
  const daysUntil = calendarDaysUntil(item.dueAt, now);
  const isExam = item.kind === "exam";

  let primary: string;
  if (breakdown.overdue > 0) {
    const daysLate = Math.max(0, -daysUntil);
    primary = daysLate <= 0 ? "it's overdue" : `it's overdue by ${daysLate} day${daysLate === 1 ? "" : "s"}`;
  } else if (daysUntil <= 0) {
    primary = isExam ? "the exam is today" : "it's due today";
  } else if (daysUntil === 1) {
    primary = isExam ? "the exam is tomorrow" : "it's due tomorrow";
  } else if (daysUntil <= 7) {
    primary = isExam ? `the exam is in ${daysUntil} days` : `it's due in ${daysUntil} days`;
  } else if (item.priority === "HIGH") {
    primary = "you marked it high priority";
  } else {
    primary = "it's next up in your regular workload";
  }

  const secondary: string[] = [];
  if (allScored && isEffortStandout(scored, allScored)) {
    secondary.push("it needs more time than most of your other open work");
  }
  if (item.priority === "HIGH" && !primary.includes("high priority")) {
    secondary.push("you marked it high priority");
  } else if (
    item.classPriority === "HIGH" &&
    item.priority !== "HIGH" &&
    secondary.length === 0
  ) {
    secondary.push(`${item.className} is a class you've marked high priority`);
  }

  const clause = secondary.length > 0 ? `${primary} and ${secondary[0]}` : primary;
  return `Prioritized because ${clause}.`;
}
