import { describe, it, expect } from "vitest";
import { reconcileReview } from "./draft-review";
import type { RubricCriterion } from "@/lib/canvas/content";

const rubric: RubricCriterion[] = [
  { id: "thesis", description: "Thesis", longDescription: "", points: 4, ratings: [] },
  { id: "evidence", description: "Evidence", longDescription: "", points: 6, ratings: [] },
];
const draft = "The Industrial Revolution reshaped cities.  Factory towns grew   faster than housing could keep up.";

describe("reconcileReview", () => {
  it("keeps only real criteria, clamps ranges, and verifies quotes", () => {
    const result = reconcileReview(
      {
        criteria: [
          { criterion_id: "thesis", low: 5, high: 3, evidence: ["the industrial revolution reshaped cities", "A quote that is not there"], working: "w", to_improve: "i" },
          { criterion_id: "invented", low: 1, high: 2, evidence: [], working: "", to_improve: "" },
        ],
        summary: "s",
        next_steps: ["a", "b", "c", "d", "e"],
      },
      rubric,
      draft,
      "claude-opus-5-5",
    );
    expect(result.criteria.map((c) => c.id)).toEqual(["thesis", "evidence"]);
    expect(result.criteria[0]).toMatchObject({ assessed: true, low: 3, high: 4 });
    expect(result.criteria[0].evidence).toEqual(["the industrial revolution reshaped cities"]);
    expect(result.droppedQuotes).toBe(1);
    // A criterion the model skipped is shown as unassessed with the full range, not guessed.
    expect(result.criteria[1]).toMatchObject({ assessed: false, low: 0, high: 6, evidence: [] });
    expect(result).toMatchObject({ totalPoints: 10, estimateLow: 3, estimateHigh: 10 });
    expect(result.nextSteps).toHaveLength(4);
  });

  it("matches quotes across whitespace and curly-quote differences", () => {
    const result = reconcileReview(
      { criteria: [{ criterion_id: "evidence", low: 2, high: 4, evidence: ["Factory towns grew faster than housing"], working: "", to_improve: "" }], summary: "", next_steps: [] },
      rubric,
      draft,
      "m",
    );
    expect(result.criteria[1].evidence).toHaveLength(1);
    expect(result.droppedQuotes).toBe(0);
  });
});
