// Composes One Thing's "personal coach" reasoning — the strongest
// explanation surface in the product, so it earns richer bullets than a
// regular Today list item. Deliberately kept out of src/lib/planning/
// explain.ts: that module explains the *scorer's* math (why this ranked
// where it did); estimation adjustments and behavioral patterns are a
// different kind of signal (what Rushd has learned about the student),
// composed here rather than blurring explain.ts's single responsibility.
// Every bullet is real, computed data — nothing here is filler.

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
): string[] {
  const reasons = explainScore(scored, now, allScored);

  if (estimateInfo.adjusted) {
    const direction = estimateInfo.percentOff > 0 ? "longer" : "faster";
    reasons.push(
      `Rushd predicts this will take ${formatDuration(scored.item.remainingMinutes)} — your ${scored.item.className} work usually runs ${Math.abs(estimateInfo.percentOff)}% ${direction} than estimated (you entered ${formatDuration(scored.item.rawEstimatedMinutes)}).`,
    );
  }

  const classPattern = patterns.find(
    (p) => p.key === "hardest-class" && p.statement.startsWith(scored.item.className),
  );
  const otherPattern = patterns.find((p) => p.key === "time-of-day" || p.key === "session-length");
  const chosenPattern = classPattern ?? otherPattern;
  if (chosenPattern) reasons.push(chosenPattern.statement);

  return reasons.slice(0, MAX_REASONS);
}
