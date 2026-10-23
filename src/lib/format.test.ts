import { describe, expect, it } from "vitest";
import { dueStatus } from "./format";

const now = new Date("2026-10-22T15:30:00Z");
const tz = "UTC";

describe("dueStatus", () => {
  it("marks past deadlines overdue", () => {
    expect(dueStatus(new Date("2026-10-22T09:00:00Z"), tz, now)).toBe("overdue");
  });

  it("marks later today as today", () => {
    expect(dueStatus(new Date("2026-10-22T23:59:00Z"), tz, now)).toBe("today");
  });

  it("marks the next two days as soon", () => {
    expect(dueStatus(new Date("2026-10-23T23:59:00Z"), tz, now)).toBe("soon");
    expect(dueStatus(new Date("2026-10-24T23:59:00Z"), tz, now)).toBe("soon");
  });

  it("marks anything further out as later", () => {
    expect(dueStatus(new Date("2026-10-25T09:00:00Z"), tz, now)).toBe("later");
  });

  it("uses the student's time zone for the calendar day", () => {
    // 03:00 UTC on the 23rd is still the 22nd in Los Angeles.
    expect(dueStatus(new Date("2026-10-23T03:00:00Z"), "America/Los_Angeles", now)).toBe("today");
  });
});
