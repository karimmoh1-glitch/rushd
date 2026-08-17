import { describe, it, expect } from "vitest";
import { buildPatterns } from "./build-patterns";
import type { SessionRecord } from "@/lib/insights/build-insights";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    className: "Test Class",
    classColor: "#000000",
    status: "COMPLETED",
    plannedMinutes: 30,
    actualMinutes: 30,
    perceivedDifficulty: null,
    startedAt: new Date("2026-08-10T10:00:00"), // a Monday
    ...overrides,
  };
}

describe("buildPatterns", () => {
  it("returns no patterns with no data", () => {
    expect(buildPatterns([])).toEqual([]);
  });

  it("detects a session-length abandonment pattern once there's enough data on both sides", () => {
    const long = Array.from({ length: 6 }, (_, i) =>
      session({ plannedMinutes: 150, status: i < 4 ? "ABANDONED" : "COMPLETED" }),
    );
    const short = Array.from({ length: 6 }, () => session({ plannedMinutes: 45, status: "COMPLETED" }));
    const patterns = buildPatterns([...long, ...short]);
    const lengthPattern = patterns.find((p) => p.key === "session-length");
    expect(lengthPattern).toBeDefined();
    expect(lengthPattern?.statement).toMatch(/abandon sessions longer than 2 hours/);
  });

  it("omits the session-length pattern when both groups abandon at the same rate", () => {
    const long = Array.from({ length: 6 }, (_, i) =>
      session({ plannedMinutes: 150, status: i === 0 ? "ABANDONED" : "COMPLETED" }),
    );
    const short = Array.from({ length: 6 }, (_, i) =>
      session({ plannedMinutes: 45, status: i === 0 ? "ABANDONED" : "COMPLETED" }),
    );
    const patterns = buildPatterns([...long, ...short]);
    expect(patterns.find((p) => p.key === "session-length")).toBeUndefined();
  });

  it("flags a hardest class only once it's actually the majority pattern", () => {
    const sessions = [
      session({ className: "AP Chemistry", perceivedDifficulty: "HARDER" }),
      session({ className: "AP Chemistry", perceivedDifficulty: "HARDER" }),
      session({ className: "AP Chemistry", perceivedDifficulty: "AS_EXPECTED" }),
    ];
    const patterns = buildPatterns(sessions);
    const hardest = patterns.find((p) => p.key === "hardest-class");
    expect(hardest?.statement).toMatch(/AP Chemistry/);
  });

  it("flags a busiest day only when it holds a real share of sessions", () => {
    const monday = Array.from({ length: 5 }, () =>
      session({ startedAt: new Date("2026-08-10T10:00:00") }),
    );
    const other = Array.from({ length: 3 }, (_, i) =>
      session({ startedAt: new Date(`2026-08-1${1 + i}T10:00:00`) }),
    );
    const patterns = buildPatterns([...monday, ...other]);
    const busiest = patterns.find((p) => p.key === "busiest-day");
    expect(busiest?.statement).toMatch(/Monday/);
  });

  it("every returned pattern reports a confidence level and a real sample size", () => {
    const sessions = Array.from({ length: 12 }, () =>
      session({ startedAt: new Date("2026-08-10T10:00:00") }),
    );
    const patterns = buildPatterns(sessions);
    for (const p of patterns) {
      expect(["high", "medium"]).toContain(p.confidence);
      expect(p.sampleSize).toBeGreaterThan(0);
    }
  });

  it("is deterministic for identical inputs", () => {
    const sessions = [
      session({ className: "AP Chemistry", perceivedDifficulty: "HARDER" }),
      session({ className: "AP Chemistry", perceivedDifficulty: "HARDER" }),
    ];
    expect(buildPatterns(sessions)).toEqual(buildPatterns(sessions));
  });
});
