import { describe, it, expect } from "vitest";
import { computeMastery, nextReview, topicKey, type EvidenceRow } from "./mastery";

const NOW = new Date("2026-10-22T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const row = (score: number, weight: number, ageDays: number, label = "Chain rule"): EvidenceRow => ({
  topicKey: topicKey(label),
  topicLabel: label,
  classId: null,
  score,
  weight,
  createdAt: days(ageDays),
});

describe("computeMastery", () => {
  it("keeps one small result uncertain, with a wide band", () => {
    const [t] = computeMastery([row(1, 1, 0)], NOW);
    expect(t.confidence).toBe("low");
    // One correct item: the band reaches far below the point estimate.
    expect(t.low).toBeLessThanOrEqual(70);
    expect(t.status).toBe("developing"); // perfect on one item isn't "strong"
    expect(t.trend).toBeNull();
  });

  it("weights recent evidence more and reports a trend", () => {
    const [t] = computeMastery([row(0.2, 4, 40), row(0.9, 4, 1)], NOW);
    expect(t.estimate).toBeGreaterThan(60);
    expect(t.trend).toBe("up");
    expect(t.evidenceCount).toBe(2);
  });

  it("needs repeated evidence for high confidence", () => {
    const [t] = computeMastery([row(0.9, 4, 2), row(0.85, 4, 1), row(0.95, 3, 0)], NOW);
    expect(t.confidence).toBe("high");
    expect(t.status).toBe("strong");
  });

  it("ignores malformed evidence and recommends the weakest topic", () => {
    const topics = computeMastery(
      [row(0.3, 3, 1, "Limits"), row(0.7, 3, 1, "Derivatives"), row(NaN, 3, 1, "Broken"), row(1, 0, 1, "Empty")],
      NOW,
    );
    expect(topics.map((t) => t.topicLabel)).toEqual(["Limits", "Derivatives"]);
    expect(nextReview(topics)?.topicLabel).toBe("Limits");
  });

  it("normalizes topic labels into stable keys", () => {
    expect(topicKey("  The Chain Rule!  ")).toBe("the-chain-rule");
    expect(topicKey("Énergie cinétique")).toBe("energie-cinetique");
  });
});
