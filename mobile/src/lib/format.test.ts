import { describe, it, expect } from "vitest";
import { elapsedMinutes, formatClock, formatDuration } from "./format";
import { tint } from "./theme-math";

describe("format", () => {
  it("formats durations like the web", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
  });

  it("formats the session clock", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(725)).toBe("12:05");
    expect(formatClock(3729)).toBe("1:02:09");
  });

  it("suggests at least one minute", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(elapsedMinutes("2026-10-22T11:59:50Z", now)).toBe(1);
    expect(elapsedMinutes("2026-10-22T11:15:00Z", now)).toBe(45);
  });

  it("tints a card with a course color", () => {
    expect(tint("#ff0000", "#000000", 0.5)).toBe("#800000");
    expect(tint("not-a-color", "#101010")).toBe("#101010");
  });
});
