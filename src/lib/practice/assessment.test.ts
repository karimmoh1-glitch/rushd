import { describe, it, expect } from "vitest";
import { reconcileAssessment } from "./assessment";

const base = {
  legible: true,
  legibility_issue: "",
  subject: "Calculus",
  topic: "Chain rule",
  strongest_skill: "Power rule",
  gaps: [{ concept: "Chain rule with trig", prerequisite: "Derivatives of sin and cos", evidence: "Q3 dropped the inner derivative" }],
  summary: "Solid on power rule; chain rule breaks with trig.",
  next_actions: ["Redo Q3", "Practice 5 chain-rule problems", "Review trig derivatives", "extra"],
  practice_questions: [{ question: "Differentiate sin(3x^2)", concept: "Chain rule" }],
  search_phrases: ["chain rule trig functions"],
};

describe("reconcileAssessment", () => {
  it("computes the estimate from verdicts, weighting difficulty", () => {
    const r = reconcileAssessment(
      {
        ...base,
        items: [
          { label: "Q1", verdict: "correct", difficulty: "basic", note: "" },
          { label: "Q2", verdict: "correct", difficulty: "standard", note: "" },
          { label: "Q3", verdict: "incorrect", difficulty: "challenging", note: "" },
          { label: "Q4", verdict: "partially_correct", difficulty: "standard", note: "" },
          { label: "Q5", verdict: "unclear", difficulty: "standard", note: "" },
        ],
      },
      "claude-opus-5-5",
    );
    if (!r.ok) throw new Error(r.reason);
    // (0.75 + 1 + 0 + 0.5) / (0.75 + 1 + 1.25 + 1) = 2.25 / 4 = 0.5625
    expect(r.result.estimate).toBe(56);
    expect(r.result.gradable).toBe(4);
    expect(r.result.confidence).toBe("medium");
    expect(r.result.low).toBeLessThan(56);
    expect(r.result.high).toBeGreaterThan(56);
    expect(r.result.nextActions).toHaveLength(3);
    expect(r.topicKey).toBe("chain-rule");
    expect(r.evidenceWeight).toBe(4);
  });

  it("asks for a clearer image instead of guessing", () => {
    const r = reconcileAssessment({ ...base, legible: false, legibility_issue: "The bottom half is cut off.", items: [] }, "m");
    expect(r).toEqual({ ok: false, reason: "illegible", message: "The bottom half is cut off." });
  });

  it("refuses to score when nothing could be judged", () => {
    const r = reconcileAssessment({ ...base, items: [{ label: "Q1", verdict: "unclear", difficulty: "basic", note: "" }] }, "m");
    expect(r).toMatchObject({ ok: false, reason: "nothing_to_grade" });
  });

  it("keeps a one-question check low-confidence with a wide range", () => {
    const r = reconcileAssessment({ ...base, items: [{ label: "Q1", verdict: "correct", difficulty: "standard", note: "" }] }, "m");
    if (!r.ok) throw new Error(r.reason);
    expect(r.result.confidence).toBe("low");
    expect(r.result.low).toBeLessThanOrEqual(65);
  });
});
