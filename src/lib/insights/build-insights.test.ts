import { describe, it, expect } from "vitest";
import { buildInsights, type SessionRecord } from "./build-insights";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    className: "Test Class",
    classColor: "#000000",
    status: "COMPLETED",
    plannedMinutes: 30,
    actualMinutes: 30,
    perceivedDifficulty: null,
    startedAt: new Date("2026-08-10T10:00:00"),
    ...overrides,
  };
}

describe("buildInsights", () => {
  it("returns empty-but-valid shape for no sessions", () => {
    const result = buildInsights([]);
    expect(result.totalSessions).toBe(0);
    expect(result.estimateAccuracy).toEqual([]);
    expect(result.timeOfDay).toBeNull();
    expect(result.busiestDay).toBeNull();
    expect(result.overallCompletionRate).toBeNull();
  });

  it("withholds estimate accuracy for a class below the minimum sample size", () => {
    const sessions = [session({ className: "Chemistry", actualMinutes: 45 })];
    const result = buildInsights(sessions);
    expect(result.estimateAccuracy).toEqual([]);
  });

  it("computes estimate accuracy once a class has enough sessions", () => {
    const sessions = [
      session({ className: "Chemistry", plannedMinutes: 30, actualMinutes: 45 }),
      session({ className: "Chemistry", plannedMinutes: 60, actualMinutes: 75 }),
    ];
    const result = buildInsights(sessions);
    expect(result.estimateAccuracy).toHaveLength(1);
    // (45/30 + 75/60) / 2 = (1.5 + 1.25) / 2 = 1.375 -> +38% (rounded)
    expect(result.estimateAccuracy[0].percentOff).toBe(38);
    expect(result.estimateAccuracy[0].sessionCount).toBe(2);
  });

  it("withholds time-of-day insight without enough sessions on both sides", () => {
    const sessions = [
      session({ startedAt: new Date("2026-08-10T10:00:00") }),
      session({ startedAt: new Date("2026-08-11T20:00:00") }),
    ];
    expect(buildInsights(sessions).timeOfDay).toBeNull();
  });

  it("computes time-of-day completion rates once both buckets have enough sessions", () => {
    const morning = Array.from({ length: 3 }, () =>
      session({ startedAt: new Date("2026-08-10T09:00:00"), status: "COMPLETED" }),
    );
    const evening = [
      session({ startedAt: new Date("2026-08-10T20:00:00"), status: "COMPLETED" }),
      session({ startedAt: new Date("2026-08-11T21:00:00"), status: "ABANDONED", actualMinutes: null }),
      session({ startedAt: new Date("2026-08-12T22:00:00"), status: "ABANDONED", actualMinutes: null }),
    ];
    const result = buildInsights([...morning, ...evening]);
    expect(result.timeOfDay).not.toBeNull();
    expect(result.timeOfDay?.beforeRate).toBe(1);
    expect(result.timeOfDay?.afterRate).toBeCloseTo(1 / 3);
  });

  it("identifies the busiest day only with enough total sessions", () => {
    const sessions = Array.from({ length: 4 }, () =>
      session({ startedAt: new Date("2026-08-10T10:00:00") }), // a Monday
    );
    const result = buildInsights(sessions);
    expect(result.busiestDay?.dayLabel).toBe("Monday");
    expect(result.busiestDay?.sessionCount).toBe(4);
  });

  it("computes perceived-difficulty share per class once rated enough times", () => {
    const sessions = [
      session({ className: "Chemistry", perceivedDifficulty: "HARDER" }),
      session({ className: "Chemistry", perceivedDifficulty: "HARDER" }),
      session({ className: "Chemistry", perceivedDifficulty: "AS_EXPECTED" }),
    ];
    const result = buildInsights(sessions);
    expect(result.difficulty).toHaveLength(1);
    expect(result.difficulty[0].harderShare).toBeCloseTo(2 / 3);
    expect(result.difficulty[0].ratedCount).toBe(3);
  });

  it("sums total focused minutes only from completed sessions with a recorded actual time", () => {
    const sessions = [
      session({ status: "COMPLETED", actualMinutes: 40 }),
      session({ status: "ABANDONED", actualMinutes: null }),
    ];
    expect(buildInsights(sessions).totalFocusedMinutes).toBe(40);
  });
});
