import { describe, it, expect } from "vitest";
import {
  localDateKey,
  localMinuteOfDay,
  addDaysToKey,
  diffDateKeys,
  dayOfWeekForKey,
  calendarDaysBetween,
  zonedTimeToUtc,
  isValidTimeZone,
  formatMinuteOfDay,
} from "./zone";

const PT = "America/Los_Angeles";

describe("localDateKey", () => {
  it("puts a Pacific 11:59 PM deadline on the Pacific day, not the UTC day", () => {
    // Fri Oct 23 11:59 PM PDT == Sat Oct 24 06:59 UTC. Bucketing by the
    // server's (UTC) clock would call this Saturday — the bug being fixed.
    const due = new Date("2026-10-24T06:59:00Z");
    expect(localDateKey(due, PT)).toBe("2026-10-23");
    expect(localDateKey(due, "UTC")).toBe("2026-10-24");
  });

  it("reads the same instant differently per zone", () => {
    const instant = new Date("2026-03-01T03:30:00Z");
    expect(localDateKey(instant, "Asia/Tokyo")).toBe("2026-03-01");
    expect(localDateKey(instant, PT)).toBe("2026-02-28");
  });
});

describe("localMinuteOfDay", () => {
  it("returns minutes since local midnight", () => {
    expect(localMinuteOfDay(new Date("2026-10-24T06:59:00Z"), PT)).toBe(23 * 60 + 59);
    expect(localMinuteOfDay(new Date("2026-10-24T00:00:00Z"), "UTC")).toBe(0);
  });
});

describe("date-key arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts calendar days exactly across a DST change", () => {
    // US clocks fall back Nov 1 2026; a calendar day is still one key step.
    expect(diffDateKeys("2026-10-31", "2026-11-02")).toBe(2);
    expect(diffDateKeys("2026-11-02", "2026-10-31")).toBe(-2);
  });

  it("derives weekday from the key alone", () => {
    expect(dayOfWeekForKey("2026-10-24")).toBe(6); // Saturday
    expect(dayOfWeekForKey("2026-10-25")).toBe(0); // Sunday
  });
});

describe("calendarDaysBetween", () => {
  it("measures days in the student's zone", () => {
    const now = new Date("2026-10-23T20:00:00Z"); // Fri 1 PM PDT
    const due = new Date("2026-10-24T06:59:00Z"); // Fri 11:59 PM PDT -> same day
    expect(calendarDaysBetween(due, now, PT)).toBe(0);
    expect(calendarDaysBetween(due, now, "UTC")).toBe(1);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a wall-clock time to the right UTC instant", () => {
    expect(zonedTimeToUtc("2026-10-23", 23 * 60 + 59, PT).toISOString()).toBe(
      "2026-10-24T06:59:00.000Z",
    );
  });

  it("respects standard time after the fall-back transition", () => {
    // Nov 2 is PST (UTC-8): 9:00 AM local == 17:00 UTC.
    expect(zonedTimeToUtc("2026-11-02", 9 * 60, PT).toISOString()).toBe(
      "2026-11-02T17:00:00.000Z",
    );
  });

  it("round-trips through localDateKey and localMinuteOfDay", () => {
    const instant = zonedTimeToUtc("2026-07-04", 14 * 60 + 30, "Europe/London");
    expect(localDateKey(instant, "Europe/London")).toBe("2026-07-04");
    expect(localMinuteOfDay(instant, "Europe/London")).toBe(14 * 60 + 30);
  });
});

describe("misc", () => {
  it("validates zones", () => {
    expect(isValidTimeZone(PT)).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("formats minute-of-day", () => {
    expect(formatMinuteOfDay(0)).toBe("12:00 AM");
    expect(formatMinuteOfDay(15 * 60 + 5)).toBe("3:05 PM");
    expect(formatMinuteOfDay(12 * 60)).toBe("12:00 PM");
  });
});
