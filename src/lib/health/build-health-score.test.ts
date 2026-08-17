import { describe, it, expect } from "vitest";
import { buildHealthScore } from "./build-health-score";
import type { SessionRecord } from "@/lib/insights/build-insights";

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

describe("buildHealthScore", () => {
  it("still computes a score for a brand new account from the always-on overdue component", () => {
    const result = buildHealthScore({
      sessions: [],
      recentAssignments: [],
      overdueCount: 0,
      openCount: 0,
    });
    // overdue is always computed (0/0 is meaningful — "nothing open"), so a
    // truly empty account gets exactly that one component, not a null score.
    expect(result.components.map((c) => c.key)).toEqual(["overdue"]);
    expect(result.score).toBe(100);
  });

  it("omits completion and accuracy below the minimum sample size", () => {
    const result = buildHealthScore({
      sessions: [session(), session()],
      recentAssignments: [],
      overdueCount: 0,
      openCount: 1,
    });
    expect(result.components.some((c) => c.key === "completion")).toBe(false);
    expect(result.components.some((c) => c.key === "accuracy")).toBe(false);
    expect(result.score).not.toBe(null);
  });

  it("computes completion rate correctly once there's enough data", () => {
    const sessions = [
      session({ status: "COMPLETED" }),
      session({ status: "COMPLETED" }),
      session({ status: "ABANDONED", actualMinutes: null }),
    ];
    const result = buildHealthScore({
      sessions,
      recentAssignments: [],
      overdueCount: 0,
      openCount: 0,
    });
    const completion = result.components.find((c) => c.key === "completion");
    expect(completion?.score).toBe(67);
  });

  it("scores estimate accuracy down as the average gap grows", () => {
    const sessions = [
      session({ plannedMinutes: 30, actualMinutes: 60 }),
      session({ plannedMinutes: 30, actualMinutes: 60 }),
      session({ plannedMinutes: 30, actualMinutes: 60 }),
    ];
    const result = buildHealthScore({
      sessions,
      recentAssignments: [],
      overdueCount: 0,
      openCount: 0,
    });
    const accuracy = result.components.find((c) => c.key === "accuracy");
    expect(accuracy?.score).toBe(0); // 100% over -> 100 - 100 = 0
    expect(accuracy?.detail).toMatch(/underestimate/i);
  });

  it("reports full marks when nothing is open", () => {
    const result = buildHealthScore({
      sessions: [],
      recentAssignments: [],
      overdueCount: 0,
      openCount: 0,
    });
    const overdue = result.components.find((c) => c.key === "overdue");
    expect(overdue?.score).toBe(100);
    expect(overdue?.detail).toMatch(/caught up/i);
  });

  it("penalizes overdue control proportionally to the open workload", () => {
    const result = buildHealthScore({
      sessions: [],
      recentAssignments: [],
      overdueCount: 2,
      openCount: 4,
    });
    const overdue = result.components.find((c) => c.key === "overdue");
    expect(overdue?.score).toBe(50);
  });

  it("renormalizes weights so partial data still averages to 100%", () => {
    const result = buildHealthScore({
      sessions: [],
      recentAssignments: [],
      overdueCount: 0,
      openCount: 0,
    });
    const totalWeight = result.components.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1);
  });

  it("computes follow-through only once there are enough recent assignments", () => {
    const result = buildHealthScore({
      sessions: [],
      recentAssignments: [
        { status: "COMPLETED" },
        { status: "COMPLETED" },
        { status: "NOT_STARTED" },
      ],
      overdueCount: 0,
      openCount: 0,
    });
    const followThrough = result.components.find((c) => c.key === "followThrough");
    expect(followThrough?.score).toBe(67);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      sessions: [session(), session(), session()],
      recentAssignments: [{ status: "COMPLETED" as const }, { status: "COMPLETED" as const }, { status: "NOT_STARTED" as const }],
      overdueCount: 1,
      openCount: 3,
    };
    expect(buildHealthScore(input)).toEqual(buildHealthScore(input));
  });
});
