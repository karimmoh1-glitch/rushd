import { describe, it, expect } from "vitest";
import { buildOneThingReasons } from "./one-thing-reasons";
import { scoreItem } from "@/lib/planning/score";
import type { WorkItem } from "@/lib/planning/types";
import type { AdjustedEstimate } from "@/lib/estimation/build-estimation-profile";
import type { Pattern } from "@/lib/patterns/build-patterns";

const NOW = new Date("2026-08-15T12:00:00");

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    kind: "assignment",
    id: "a1",
    classId: "c1",
    title: "Lab report",
    className: "AP Chemistry",
    classColor: "#000000",
    priority: "MEDIUM",
    classPriority: "MEDIUM",
    dueAt: new Date("2026-08-17T12:00:00"),
    remainingMinutes: 90,
    rawEstimatedMinutes: 60,
    estimateAdjusted: true,
    ...overrides,
  };
}

const NO_ADJUSTMENT: AdjustedEstimate = {
  minutes: 60,
  adjusted: false,
  multiplier: 1,
  source: "none",
  percentOff: 0,
};

describe("buildOneThingReasons", () => {
  it("includes the base scoring reasons even with no estimate or pattern signal", () => {
    const scored = scoreItem(makeItem({ estimateAdjusted: false, remainingMinutes: 60 }), NOW);
    const reasons = buildOneThingReasons(scored, NOW, [scored], NO_ADJUSTMENT, []);
    expect(reasons.some((r) => /due in \d+ days/i.test(r))).toBe(true);
  });

  it("adds an estimation-adjustment bullet with real numbers when adjusted", () => {
    const scored = scoreItem(makeItem(), NOW);
    const estimate: AdjustedEstimate = {
      minutes: 90,
      adjusted: true,
      multiplier: 1.5,
      source: "class",
      percentOff: 50,
    };
    const reasons = buildOneThingReasons(scored, NOW, [scored], estimate, []);
    const bullet = reasons.find((r) => r.includes("Rushd predicts"));
    expect(bullet).toBeDefined();
    expect(bullet).toContain("AP Chemistry");
    expect(bullet).toContain("50%");
    expect(bullet).toContain("longer");
  });

  it("omits the estimation bullet when nothing was adjusted", () => {
    const scored = scoreItem(makeItem({ estimateAdjusted: false, remainingMinutes: 60 }), NOW);
    const reasons = buildOneThingReasons(scored, NOW, [scored], NO_ADJUSTMENT, []);
    expect(reasons.some((r) => r.includes("Rushd predicts"))).toBe(false);
  });

  it("prefers a class-specific pattern that matches this item's class", () => {
    const scored = scoreItem(makeItem(), NOW);
    const patterns: Pattern[] = [
      { key: "hardest-class", statement: "AP Chemistry is your toughest class.", confidence: "high", sampleSize: 10 },
      { key: "time-of-day", statement: "You do better before 6 PM.", confidence: "high", sampleSize: 10 },
    ];
    const reasons = buildOneThingReasons(scored, NOW, [scored], NO_ADJUSTMENT, patterns);
    expect(reasons).toContain("AP Chemistry is your toughest class.");
  });

  it("falls back to a general pattern when no class-specific one matches", () => {
    const scored = scoreItem(makeItem({ className: "US History" }), NOW);
    const patterns: Pattern[] = [
      { key: "hardest-class", statement: "AP Chemistry is your toughest class.", confidence: "high", sampleSize: 10 },
      { key: "time-of-day", statement: "You do better before 6 PM.", confidence: "high", sampleSize: 10 },
    ];
    const reasons = buildOneThingReasons(scored, NOW, [scored], NO_ADJUSTMENT, patterns);
    expect(reasons).toContain("You do better before 6 PM.");
    expect(reasons).not.toContain("AP Chemistry is your toughest class.");
  });

  it("never returns more than 4 reasons", () => {
    const scored = scoreItem(
      makeItem({ dueAt: new Date("2026-08-10T12:00:00"), priority: "HIGH", classPriority: "HIGH" }),
      NOW,
    );
    const estimate: AdjustedEstimate = { minutes: 90, adjusted: true, multiplier: 1.5, source: "class", percentOff: 50 };
    const patterns: Pattern[] = [
      { key: "time-of-day", statement: "You do better before 6 PM.", confidence: "high", sampleSize: 10 },
    ];
    const reasons = buildOneThingReasons(scored, NOW, [scored], estimate, patterns);
    expect(reasons.length).toBeLessThanOrEqual(4);
  });
});
