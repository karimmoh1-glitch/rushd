// The "why this first" bullets on the Next up card: the scorer's reasons plus
// what Rushd has learned about the student (kept out of planning/explain.ts,
// which only explains the scoring math). Every bullet comes from real data.

import { explainScore } from "@/lib/planning";
import type { ScoredItem } from "@/lib/planning/types";
import type { AdjustedEstimate } from "@/lib/estimation/build-estimation-profile";
import type { Pattern } from "@/lib/patterns/build-patterns";
import { formatDuration } from "@/lib/format";

const MAX_REASONS = 4;

export function buildOneThingReasons(
  scored: ScoredItem,
  now: Date,
  allScored: ScoredItem[],
  estimateInfo: AdjustedEstimate,
  patterns: Pattern[],
  timeZone?: string | null,
): string[] {
  const reasons = explainScore(scored, now, allScored, timeZone);

  // explainScore already states the pace adjustment when the planner made one;
  // review blocks are sized from topics, not estimates.
  if (estimateInfo.adjusted && !scored.item.estimateNote && scored.item.kind !== "review") {
    const direction = estimateInfo.percentOff > 0 ? "longer" : "faster";
    reasons.push(
      `Rushd predicts this will take ${formatDuration(scored.item.remainingMinutes)} — your ${scored.item.className} work usually runs ${Math.abs(estimateInfo.percentOff)}% ${direction} than estimated (you entered ${formatDuration(scored.item.rawEstimatedMinutes)}).`,
    );
  }

  // Prefer a pattern about this item's class; otherwise use a general study-habit one.
  const classPattern = patterns.find(
    (pattern) => pattern.key === "hardest-class" && pattern.statement.startsWith(scored.item.className),
  );
  const otherPattern = patterns.find((pattern) => pattern.key === "time-of-day" || pattern.key === "session-length");
  const chosenPattern = classPattern ?? otherPattern;
  if (chosenPattern) reasons.push(chosenPattern.statement);

  return reasons.slice(0, MAX_REASONS);
}
