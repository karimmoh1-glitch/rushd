import { describe, it, expect } from "vitest";
import { explainScore } from "./explain";
import { scoreItem } from "./score";
import type { WorkItem } from "./types";

const NOW = new Date("2026-08-15T12:00:00");

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    kind: "assignment",
    id: "a1",
    classId: "c1",
    title: "Test item",
    className: "Test Class",
    classColor: "#000000",
    priority: "MEDIUM",
    classPriority: "MEDIUM",
    dueAt: new Date("2026-08-20T12:00:00"),
    remainingMinutes: 30,
    rawEstimatedMinutes: 30,
    estimateAdjusted: false,
    ...overrides,
  };
}

describe("explainScore", () => {
  it("leads with overdue when the item is overdue", () => {
    const scored = scoreItem(makeItem({ dueAt: new Date("2026-08-10T12:00:00") }), NOW);
    const reasons = explainScore(scored, NOW);
    expect(reasons[0]).toMatch(/overdue/i);
  });

  it("says 'due today' for something due today, not overdue", () => {
    const scored = scoreItem(makeItem({ dueAt: NOW }), NOW);
    const reasons = explainScore(scored, NOW);
    expect(reasons[0]).toMatch(/due today/i);
  });

  it("says 'due tomorrow' for something due tomorrow", () => {
    const scored = scoreItem(
      makeItem({ dueAt: new Date("2026-08-16T12:00:00") }),
      NOW,
    );
    const reasons = explainScore(scored, NOW);
    expect(reasons[0]).toMatch(/tomorrow/i);
  });

  it("omits a due-date reason when the deadline is far out and not urgent", () => {
    const scored = scoreItem(
      makeItem({ dueAt: new Date("2026-09-15T12:00:00") }),
      NOW,
    );
    const reasons = explainScore(scored, NOW);
    expect(reasons.some((r) => /due|overdue/i.test(r))).toBe(false);
  });

  it("mentions exam proximity only for exams within the window", () => {
    const exam = scoreItem(
      makeItem({ kind: "exam", dueAt: new Date("2026-08-17T12:00:00") }),
      NOW,
    );
    const reasons = explainScore(exam, NOW);
    expect(reasons.some((r) => /exam/i.test(r))).toBe(true);
  });

  it("mentions the student's own high-priority flag", () => {
    const scored = scoreItem(makeItem({ priority: "HIGH" }), NOW);
    const reasons = explainScore(scored, NOW);
    expect(reasons.some((r) => /high priority/i.test(r))).toBe(true);
  });

  it("mentions class priority only when the item itself isn't already high priority", () => {
    const bothHigh = scoreItem(
      makeItem({ priority: "HIGH", classPriority: "HIGH" }),
      NOW,
    );
    const reasonsBoth = explainScore(bothHigh, NOW);
    // Should not redundantly state both "you marked this high priority"
    // and "this class is high priority" for the same item.
    expect(reasonsBoth.filter((r) => /high priority/i.test(r))).toHaveLength(1);

    const onlyClassHigh = scoreItem(
      makeItem({ priority: "LOW", classPriority: "HIGH", dueAt: new Date("2026-09-15T12:00:00") }),
      NOW,
    );
    const reasonsClass = explainScore(onlyClassHigh, NOW);
    expect(reasonsClass.some((r) => /high-priority class/i.test(r))).toBe(true);
  });

  it("never returns an empty list — falls back to a standard-workload reason", () => {
    const scored = scoreItem(
      makeItem({ dueAt: new Date("2026-09-15T12:00:00") }),
      NOW,
    );
    const reasons = explainScore(scored, NOW);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("is deterministic for identical inputs", () => {
    const item = makeItem();
    const scored = scoreItem(item, NOW);
    expect(explainScore(scored, NOW)).toEqual(explainScore(scored, NOW));
  });

  it("mentions needing more time only when meaningfully above the average of the rest", () => {
    const standout = scoreItem(makeItem({ id: "big", remainingMinutes: 120 }), NOW);
    const others = [
      scoreItem(makeItem({ id: "a", remainingMinutes: 30 }), NOW),
      scoreItem(makeItem({ id: "b", remainingMinutes: 30 }), NOW),
    ];
    const reasons = explainScore(standout, NOW, [standout, ...others]);
    expect(reasons.some((r) => /more time/i.test(r))).toBe(true);

    const notStandout = scoreItem(makeItem({ id: "typical", remainingMinutes: 35 }), NOW);
    const reasonsTypical = explainScore(notStandout, NOW, [notStandout, ...others]);
    expect(reasonsTypical.some((r) => /more time/i.test(r))).toBe(false);
  });

  it("does not flag effort standout below the floor, even at a high ratio", () => {
    const tiny = scoreItem(makeItem({ id: "tiny", remainingMinutes: 15 }), NOW);
    const others = [scoreItem(makeItem({ id: "tinier", remainingMinutes: 5 }), NOW)];
    const reasons = explainScore(tiny, NOW, [tiny, ...others]);
    expect(reasons.some((r) => /more time/i.test(r))).toBe(false);
  });
});
