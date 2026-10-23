import { describe, it, expect } from "vitest";
import { DAY_MS, estimateTopic, type Observation } from "./estimator";

const NOW = new Date("2026-10-22T18:00:00Z");

function ago(days: number, hours = 0): Date {
  return new Date(NOW.getTime() - days * DAY_MS - hours * 3_600_000);
}

let n = 0;
function obs(daysAgo: number, score: number, extra: Partial<Observation> = {}): Observation {
  n += 1;
  return { at: ago(daysAgo), score, items: 1, sessionKey: `s-${daysAgo}`, questionId: `q-${n}`, ...extra };
}

describe("estimateTopic", () => {
  it("has nothing to say without evidence", () => {
    const e = estimateTopic([], NOW);
    expect(e.status).toBe("not_enough_evidence");
    expect(e.estimate).toBeNull();
    expect(e.nextReviewAt).toBeNull();
    expect(e.explanation).toMatch(/No practice yet/);
  });

  it("never calls one correct answer secure", () => {
    const e = estimateTopic([obs(0, 1)], NOW);
    expect(e.status).toBe("not_enough_evidence");
    expect(e.confidence).toBe("low");
  });

  it("massed repetition in one sitting is not secure, however many answers", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...obs(0, 1), at: new Date(ago(0).getTime() - i * 60_000), sessionKey: "one" }));
    const e = estimateTopic(many, NOW);
    expect(e.estimate).toBe(100);
    expect(e.sessions).toBe(1);
    expect(e.status).toBe("developing");
    expect(e.confidence).toBe("low");
    expect(e.explanation).toMatch(/one more correct answer/);
  });

  it("success across separate sessions makes it secure", () => {
    const e = estimateTopic([obs(12, 1), obs(12, 1, { sessionKey: "s-12" }), obs(9, 1), obs(1, 1)], NOW);
    expect(e.sessions).toBe(3);
    expect(e.successSessions).toBe(3);
    expect(e.status).toBe("secure");
    expect(e.due).toBe(false);
  });

  it("sessions on the same afternoon count as one occasion", () => {
    const e = estimateTopic(
      [
        { ...obs(0, 1), at: ago(0, 3), sessionKey: "a" },
        { ...obs(0, 1), at: ago(0, 1), sessionKey: "b" },
      ],
      NOW,
    );
    expect(e.sessions).toBe(1);
    expect(e.status).not.toBe("secure");
  });

  it("explains the evidence in plain language", () => {
    // 3 correct across 2 sessions, last 9 days ago.
    const e = estimateTopic([obs(12, 1), obs(12, 1, { sessionKey: "s-12" }), obs(9, 1)], NOW);
    expect(e.explanation).toMatch(/^3 of 3 answers correct across 2 sessions, last correct 9 days ago/);
    expect(e.improve.length).toBeGreaterThan(0);
  });

  it("weights harder questions more", () => {
    const hardRight = estimateTopic([obs(1, 1, { difficulty: 3 }), obs(2, 0, { difficulty: 1 })], NOW);
    const easyRight = estimateTopic([obs(1, 1, { difficulty: 1 }), obs(2, 0, { difficulty: 3 })], NOW);
    expect(hardRight.estimate!).toBeGreaterThan(easyRight.estimate!);
  });

  it("penalizes heavy hint use and never counts it as a clean recall", () => {
    const clean = estimateTopic([obs(10, 1), obs(5, 1), obs(1, 1)], NOW);
    const hinted = estimateTopic([obs(10, 1, { hintsUsed: 3 }), obs(5, 1, { hintsUsed: 2 }), obs(1, 1, { hintsUsed: 2 })], NOW);
    expect(hinted.estimate!).toBeLessThan(clean.estimate!);
    expect(hinted.successSessions).toBe(0);
    expect(hinted.status).not.toBe("secure");
    expect(hinted.heavyHints).toBe(true);
    expect(hinted.improve.join(" ")).toMatch(/without hints/);
  });

  it("decays: a topic not recalled for a long time comes due, then needs review", () => {
    const history = [obs(40, 1), obs(37, 1), obs(30, 1)];
    const e = estimateTopic(history, NOW);
    expect(e.due).toBe(true);
    expect(e.status).toBe("needs_review");
    expect(e.explanation).toMatch(/slipping/);
  });

  it("failures shorten the next interval", () => {
    const good = estimateTopic([obs(20, 1), obs(16, 1), obs(9, 1)], NOW);
    const lapse = estimateTopic([obs(20, 1), obs(16, 1), obs(9, 0)], NOW);
    expect(lapse.intervalDays!).toBeLessThan(good.intervalDays!);
  });

  it("expanding intervals: each spaced success lengthens the next gap", () => {
    const a = estimateTopic([obs(30, 1), obs(28, 1)], new Date(NOW.getTime() - 27 * DAY_MS));
    const b = estimateTopic([obs(30, 1), obs(28, 1), obs(24, 1)], new Date(NOW.getTime() - 23 * DAY_MS));
    const c = estimateTopic([obs(30, 1), obs(28, 1), obs(24, 1), obs(16, 1)], new Date(NOW.getTime() - 15 * DAY_MS));
    expect(a.intervalDays).toBe(3);
    expect(b.intervalDays).toBe(7);
    expect(c.intervalDays).toBe(14);
  });

  it("counts repeated mistakes on the same question", () => {
    const e = estimateTopic(
      [obs(6, 1), obs(5, 0, { questionId: "q-x" }), obs(3, 1), obs(1, 1), obs(0, 0, { questionId: "q-x" })],
      NOW,
    );
    expect(e.repeatedMistakes).toBe(1);
    expect(e.status).toBe("needs_review");
  });

  it("flags overconfidence: sure, but wrong", () => {
    const e = estimateTopic([obs(5, 0, { confidence: 3 }), obs(3, 1, { confidence: 3 }), obs(1, 0, { confidence: 3 })], NOW);
    expect(e.calibration).toBe("overconfident");
    expect(e.improve.join(" ")).toMatch(/sure/);
  });

  it("flags underconfidence: unsure, but right", () => {
    const e = estimateTopic([obs(5, 1, { confidence: 1 }), obs(3, 1, { confidence: 1 }), obs(1, 1, { confidence: 1 })], NOW);
    expect(e.calibration).toBe("underconfident");
  });

  it("mostly wrong answers need review", () => {
    const e = estimateTopic([obs(3, 0), obs(2, 0.5), obs(1, 0)], NOW);
    expect(e.status).toBe("needs_review");
    expect(e.estimate!).toBeLessThan(60);
  });

  it("a single photo check with many items is developing at best", () => {
    const e = estimateTopic([{ at: ago(1), score: 0.95, items: 8, sessionKey: "assessment:a" }], NOW);
    expect(e.status).toBe("developing");
    expect(e.answers).toBe(8);
  });

  it("the range is wide with little evidence and narrows with more", () => {
    const thin = estimateTopic([obs(3, 1), obs(1, 0)], NOW);
    const thick = estimateTopic(
      [obs(20, 1), obs(16, 0), obs(12, 1), obs(9, 1), obs(6, 0), obs(3, 1), obs(1, 1), obs(1, 1, { sessionKey: "s-1" })],
      NOW,
    );
    expect(thin.high! - thin.low!).toBeGreaterThan(thick.high! - thick.low!);
  });

  it("is deterministic", () => {
    const history = [obs(10, 1), obs(5, 0.5, { hintsUsed: 1 }), obs(1, 1, { confidence: 2 })];
    expect(estimateTopic(history, NOW)).toEqual(estimateTopic([...history].reverse(), NOW));
  });

  it("ignores evidence from the future and broken rows", () => {
    const e = estimateTopic([obs(-2, 1), { ...obs(1, NaN) }, { ...obs(1, 1), items: 0 }], NOW);
    expect(e.answers).toBe(0);
  });
});
