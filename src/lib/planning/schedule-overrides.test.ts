import { describe, it, expect } from "vitest";
import { generatePlan } from "./schedule";
import type { AvailabilityWindow, WorkItem } from "./types";

// Thursday Oct 22 2026, 15:00 UTC; planning in UTC; study 16:00-20:00 every day.
const NOW = new Date("2026-10-22T15:00:00Z");
const TZ = "UTC";
const everyDay: AvailabilityWindow[] = Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, startMinute: 16 * 60, endMinute: 20 * 60 }));

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    kind: "assignment",
    id: "a1",
    classId: "c1",
    title: "Lab report",
    className: "Chemistry",
    classColor: "#000000",
    priority: "MEDIUM",
    classPriority: "MEDIUM",
    dueAt: new Date("2026-10-26T23:00:00Z"),
    remainingMinutes: 60,
    rawEstimatedMinutes: 60,
    estimateAdjusted: false,
    ...overrides,
  };
}

const plan = (workItems: WorkItem[], extra: Partial<Parameters<typeof generatePlan>[0]> = {}) =>
  generatePlan({ workItems, availability: everyDay, now: NOW, timeZone: TZ, horizonDays: 14, preferences: { preferredSessionMinutes: 60 }, ...extra });

describe("term dates", () => {
  it("plans nothing for a course before its term starts or after it ends", () => {
    const result = plan([
      makeItem({ remainingMinutes: 180, dueAt: new Date("2026-10-30T23:00:00Z"), term: { start: "2026-10-24", end: "2026-10-27" } }),
    ]);
    const dates = result.sessions.map((s) => s.scheduledDate);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date >= "2026-10-24" && date <= "2026-10-27").toBe(true);
    }
  });

  it("says so instead of reporting a shortfall when the work is entirely outside the term", () => {
    const result = plan([makeItem({ term: { start: null, end: "2026-10-20" } })]);
    expect(result.sessions).toEqual([]);
    expect(result.warnings).toContainEqual({ type: "OUTSIDE_TERM", itemId: "a1", kind: "assignment", title: "Lab report", className: "Chemistry" });
    expect(result.warnings?.some((w) => w.type === "DEADLINE_SHORTFALL")).toBe(false);
  });

  it("leaves courses without term dates alone", () => {
    expect(plan([makeItem({ term: { start: null, end: null } })]).sessions).toHaveLength(1);
  });
});

describe("overrides", () => {
  it("skip today moves the block to another day", () => {
    const before = plan([makeItem()]);
    expect(before.sessions[0].scheduledDate).toBe("2026-10-22");
    const after = plan([makeItem()], { exclusions: [{ kind: "assignment", itemId: "a1", type: "skip", date: "2026-10-22" }] });
    expect(after.sessions.map((s) => s.scheduledDate)).toEqual(["2026-10-23"]);
    expect(after.warnings?.some((w) => w.type === "DEADLINE_SHORTFALL")).toBe(false);
  });

  it("not this week keeps the work off until the given day", () => {
    const item = makeItem({ dueAt: new Date("2026-11-02T23:00:00Z"), remainingMinutes: 120 });
    const result = plan([item], { exclusions: [{ kind: "assignment", itemId: "a1", type: "not_this_week", date: "2026-10-26" }] });
    expect(result.sessions.length).toBeGreaterThan(0);
    expect(result.sessions.every((s) => s.scheduledDate >= "2026-10-26")).toBe(true);
  });

  it("flags a shortfall the student's override caused", () => {
    // Due tomorrow evening, 6 hours of work, 4 hours a day: skipping today can't fit.
    const item = makeItem({ dueAt: new Date("2026-10-23T23:00:00Z"), remainingMinutes: 360 });
    const result = plan([item], {
      preferences: { preferredSessionMinutes: 90 },
      exclusions: [{ kind: "assignment", itemId: "a1", type: "skip", date: "2026-10-22" }],
    });
    const shortfall = result.warnings?.find((w) => w.type === "DEADLINE_SHORTFALL");
    expect(shortfall).toMatchObject({ itemId: "a1", override: "skip", shortMinutes: 120 });
  });

  it("an override on one item never touches another", () => {
    const result = plan([makeItem(), makeItem({ id: "a2", title: "Essay" })], {
      exclusions: [{ kind: "assignment", itemId: "a1", type: "skip", date: "2026-10-22" }],
    });
    const a2 = result.sessions.find((s) => s.item.id === "a2");
    expect(a2?.scheduledDate).toBe("2026-10-22");
  });
});

describe("soft review work", () => {
  const review = (overrides: Partial<WorkItem> = {}) =>
    makeItem({
      kind: "review",
      id: "c1",
      title: "Review: Gas laws",
      dueAt: new Date("2026-10-24T23:59:00Z"),
      remainingMinutes: 20,
      rawEstimatedMinutes: 20,
      soft: true,
      review: { topics: [{ topicId: "t1", title: "Gas laws", status: "needs_review", daysSinceRecall: 6, overdueDays: 3, intervalDays: 1 }], examDaysAway: null },
      ...overrides,
    });

  it("places a due review in the next few days", () => {
    const result = plan([review()]);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].item.kind).toBe("review");
    expect(result.sessions[0].scheduledMinutes).toBe(20);
  });

  it("never reports a shortfall for a review that doesn't fit; it waits", () => {
    const busy = makeItem({ id: "big", dueAt: new Date("2026-10-24T23:00:00Z"), remainingMinutes: 720, priority: "HIGH" });
    const result = plan([busy, review()], { preferences: { preferredSessionMinutes: 90 } });
    expect(result.sessions.some((s) => s.item.kind === "review")).toBe(false);
    expect(result.warnings?.some((w) => w.type === "DEADLINE_SHORTFALL" && w.kind === "review")).toBe(false);
    expect(result.deferredMinutesByItem?.c1).toBe(20);
  });

  it("a review and an assignment with the same id stay separate", () => {
    const result = plan([makeItem({ id: "c1" }), review()]);
    expect(result.sessions.filter((s) => s.item.id === "c1").map((s) => s.item.kind).sort()).toEqual(["assignment", "review"]);
  });
});
