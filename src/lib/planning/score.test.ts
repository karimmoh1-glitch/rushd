import { describe, it, expect } from "vitest";
import { scoreItem, scoreAndRank } from "./score";
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
    ...overrides,
  };
}

describe("scoreItem", () => {
  it("gives maximum urgency to something due today", () => {
    const { breakdown } = scoreItem(makeItem({ dueAt: NOW }), NOW);
    expect(breakdown.urgency).toBe(100);
  });

  it("decays urgency linearly by day and floors at zero", () => {
    const dueIn5Days = new Date("2026-08-20T12:00:00");
    const dueIn10Days = new Date("2026-08-25T12:00:00");
    const near = scoreItem(makeItem({ dueAt: dueIn5Days }), NOW);
    const far = scoreItem(makeItem({ dueAt: dueIn10Days }), NOW);
    expect(near.breakdown.urgency).toBe(40); // 100 - 5*12
    expect(far.breakdown.urgency).toBe(0); // floored, not negative
  });

  it("applies the overdue bonus only once dueAt has actually passed", () => {
    const overdue = scoreItem(
      makeItem({ dueAt: new Date("2026-08-10T12:00:00") }),
      NOW,
    );
    const dueToday = scoreItem(makeItem({ dueAt: NOW }), NOW);
    expect(overdue.breakdown.overdue).toBeGreaterThan(0);
    expect(overdue.reasonCode).toBe("OVERDUE");
    expect(dueToday.breakdown.overdue).toBe(0);
  });

  it("caps the overdue bonus so a month-late item doesn't dwarf everything", () => {
    const veryOverdue = scoreItem(
      makeItem({ dueAt: new Date("2026-01-01T00:00:00") }),
      NOW,
    );
    expect(veryOverdue.breakdown.overdue).toBeLessThanOrEqual(60);
  });

  it("only gives exam proximity bonus to exams within the window", () => {
    const examSoon = scoreItem(
      makeItem({
        kind: "exam",
        dueAt: new Date("2026-08-17T12:00:00"), // 2 days out
      }),
      NOW,
    );
    const examFar = scoreItem(
      makeItem({
        kind: "exam",
        dueAt: new Date("2026-09-15T12:00:00"),
      }),
      NOW,
    );
    const assignmentSoon = scoreItem(
      makeItem({
        kind: "assignment",
        dueAt: new Date("2026-08-17T12:00:00"),
      }),
      NOW,
    );
    expect(examSoon.breakdown.examProximity).toBeGreaterThan(0);
    expect(examSoon.reasonCode).toBe("EXAM_PROXIMITY");
    expect(examFar.breakdown.examProximity).toBe(0);
    expect(assignmentSoon.breakdown.examProximity).toBe(0);
  });

  it("weights HIGH priority above LOW priority, all else equal", () => {
    const high = scoreItem(makeItem({ priority: "HIGH" }), NOW);
    const low = scoreItem(makeItem({ priority: "LOW" }), NOW);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("lets a HIGH-priority class nudge score up at half weight", () => {
    const highClass = scoreItem(makeItem({ classPriority: "HIGH" }), NOW);
    const lowClass = scoreItem(makeItem({ classPriority: "LOW" }), NOW);
    expect(highClass.score).toBeGreaterThan(lowClass.score);
    // Half weight: the class priority swing should be smaller than the
    // item's own priority swing (30 - 5 = 25 vs (30-5)*0.5 = 12.5).
    const ownSwing =
      scoreItem(makeItem({ priority: "HIGH" }), NOW).score -
      scoreItem(makeItem({ priority: "LOW" }), NOW).score;
    const classSwing = highClass.score - lowClass.score;
    expect(classSwing).toBeLessThan(ownSwing);
  });

  it("uses effort as only a minor tiebreak, never overriding urgency", () => {
    const shortLowUrgency = scoreItem(
      makeItem({ remainingMinutes: 10, dueAt: new Date("2026-08-25T12:00:00") }),
      NOW,
    );
    const longHighUrgency = scoreItem(
      makeItem({ remainingMinutes: 500, dueAt: NOW }),
      NOW,
    );
    expect(longHighUrgency.score).toBeGreaterThan(shortLowUrgency.score);
  });

  it("is deterministic for identical inputs", () => {
    const item = makeItem();
    const first = scoreItem(item, NOW);
    const second = scoreItem(item, NOW);
    expect(first.score).toBe(second.score);
    expect(first.reasonCode).toBe(second.reasonCode);
  });
});

describe("scoreAndRank", () => {
  it("sorts highest score first", () => {
    const items = [
      makeItem({ id: "low", priority: "LOW", dueAt: new Date("2026-09-01T12:00:00") }),
      makeItem({ id: "overdue", dueAt: new Date("2026-08-01T12:00:00") }),
      makeItem({ id: "high", priority: "HIGH", dueAt: NOW }),
    ];
    const ranked = scoreAndRank(items, NOW);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    expect(ranked.map((r) => r.item.id)).toContain("overdue");
  });

  it("returns an empty list for no items", () => {
    expect(scoreAndRank([], NOW)).toEqual([]);
  });
});
