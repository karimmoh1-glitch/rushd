import { describe, it, expect } from "vitest";
import { buildEstimationProfile, adjustEstimate } from "./build-estimation-profile";
import type { SessionRecord } from "@/lib/insights/build-insights";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    className: "AP Chemistry",
    classColor: "#000000",
    status: "COMPLETED",
    plannedMinutes: 60,
    actualMinutes: 60,
    perceivedDifficulty: null,
    startedAt: new Date("2026-08-10T10:00:00"),
    ...overrides,
  };
}

describe("buildEstimationProfile", () => {
  it("returns a no-op profile (1.0 everywhere) with no data", () => {
    const profile = buildEstimationProfile([]);
    expect(profile.overallMultiplier).toBe(1.0);
    expect(profile.byClass).toEqual([]);
  });

  it("withholds a class multiplier below the minimum sample size", () => {
    const profile = buildEstimationProfile([
      session({ actualMinutes: 90 }),
      session({ actualMinutes: 90 }),
    ]);
    expect(profile.byClass).toEqual([]);
  });

  it("computes a class multiplier once there's enough consistent data", () => {
    const sessions = [
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
    ];
    const profile = buildEstimationProfile(sessions);
    expect(profile.byClass).toHaveLength(1);
    expect(profile.byClass[0].multiplier).toBeCloseTo(1.5);
    expect(profile.byClass[0].percentOff).toBe(50);
  });

  it("ignores deviations below the notable-pattern floor", () => {
    const sessions = [
      session({ plannedMinutes: 60, actualMinutes: 63 }),
      session({ plannedMinutes: 60, actualMinutes: 63 }),
      session({ plannedMinutes: 60, actualMinutes: 63 }),
    ];
    const profile = buildEstimationProfile(sessions);
    expect(profile.byClass).toEqual([]);
  });

  it("clamps an extreme ratio to the safety bounds", () => {
    const sessions = [
      session({ plannedMinutes: 30, actualMinutes: 300 }),
      session({ plannedMinutes: 30, actualMinutes: 300 }),
      session({ plannedMinutes: 30, actualMinutes: 300 }),
    ];
    const profile = buildEstimationProfile(sessions);
    expect(profile.byClass[0].multiplier).toBe(2.0);
  });

  it("falls back to an overall multiplier when a class has too few sessions of its own", () => {
    const sessions = [
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "US History", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "AP Biology", plannedMinutes: 60, actualMinutes: 90 }),
    ];
    const profile = buildEstimationProfile(sessions);
    expect(profile.byClass).toEqual([]); // no single class has 3 sessions
    expect(profile.overallMultiplier).toBeCloseTo(1.5);
  });

  it("excludes abandoned sessions (no actualMinutes) from the calculation", () => {
    const sessions = [
      session({ status: "ABANDONED", actualMinutes: null }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
    ];
    const profile = buildEstimationProfile(sessions);
    expect(profile.byClass[0].sampleSize).toBe(3);
  });
});

describe("adjustEstimate", () => {
  it("returns the raw estimate untouched when there's no signal at all", () => {
    const profile = buildEstimationProfile([]);
    const result = adjustEstimate(60, "AP Chemistry", profile);
    expect(result).toEqual({ minutes: 60, adjusted: false, multiplier: 1.0, source: "none", percentOff: 0 });
  });

  it("prefers a class-specific multiplier over the overall one", () => {
    const sessions = [
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "US History", plannedMinutes: 60, actualMinutes: 66 }),
      session({ className: "US History", plannedMinutes: 60, actualMinutes: 66 }),
      session({ className: "US History", plannedMinutes: 60, actualMinutes: 66 }),
    ];
    const profile = buildEstimationProfile(sessions);
    const result = adjustEstimate(40, "AP Chemistry", profile);
    expect(result.source).toBe("class");
    expect(result.minutes).toBe(60); // 40 * 1.5
  });

  it("falls back to the overall multiplier for a class with no history of its own", () => {
    const sessions = [
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
      session({ className: "AP Chemistry", plannedMinutes: 60, actualMinutes: 90 }),
    ];
    const profile = buildEstimationProfile(sessions);
    const result = adjustEstimate(40, "Never Studied Before", profile);
    expect(result.source).toBe("overall");
    expect(result.minutes).toBe(60);
  });

  it("never adjusts below a 5-minute floor", () => {
    const sessions = [
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
    ];
    // Force a below-1x scenario to check the floor logic path exists even
    // though this particular profile is above 1x — the floor guards the
    // multiply-and-round step generically.
    const profile = buildEstimationProfile(sessions);
    const result = adjustEstimate(1, "AP Chemistry", profile);
    expect(result.minutes).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic for identical inputs", () => {
    const sessions = [
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
      session({ plannedMinutes: 60, actualMinutes: 90 }),
    ];
    const profile = buildEstimationProfile(sessions);
    expect(adjustEstimate(45, "AP Chemistry", profile)).toEqual(
      adjustEstimate(45, "AP Chemistry", profile),
    );
  });
});
