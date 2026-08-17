import { describe, it, expect } from "vitest";
import { generatePlan } from "./schedule";
import type { WorkItem, AvailabilityWindow } from "./types";

// Saturday, so dayOfWeek-based availability is easy to reason about.
const NOW = new Date("2026-08-15T09:00:00"); // Saturday

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
    dueAt: new Date("2026-08-22T12:00:00"),
    remainingMinutes: 30,
    rawEstimatedMinutes: 30,
    estimateAdjusted: false,
    ...overrides,
  };
}

describe("generatePlan", () => {
  it("returns empty sessions but a full scored list when there is no availability", () => {
    const result = generatePlan({
      workItems: [makeItem()],
      availability: [],
      now: NOW,
    });
    expect(result.sessions).toEqual([]);
    expect(result.scored).toHaveLength(1);
    expect(result.unscheduledMinutesByItem["a1"]).toBe(30);
  });

  it("returns nothing for an empty work list", () => {
    const result = generatePlan({
      workItems: [],
      availability: [{ dayOfWeek: 6, startMinute: 0, endMinute: 600 }],
      now: NOW,
    });
    expect(result.scored).toEqual([]);
    expect(result.sessions).toEqual([]);
    expect(result.unscheduledMinutesByItem).toEqual({});
  });

  it("schedules a short item entirely on the first available day", () => {
    const availability: AvailabilityWindow[] = [
      { dayOfWeek: 6, startMinute: 0, endMinute: 120 }, // today (Saturday), 2h
    ];
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 30 })],
      availability,
      now: NOW,
    });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].scheduledMinutes).toBe(30);
    expect(result.sessions[0].scheduledDate).toBe("2026-08-15");
    expect(result.unscheduledMinutesByItem["a1"]).toBeUndefined();
  });

  it("caps each day's session at the max, deferring the rest to other days rather than cramming one day", () => {
    // Only today has availability, and it's generous (10h) — but the engine
    // gives this item at most one 90-minute block per day, by design (see
    // docs/PLANNING_ENGINE.md — spaced practice, and it leaves room in a
    // busy day for other items). The remainder is unscheduled, not crammed.
    const availability: AvailabilityWindow[] = [
      { dayOfWeek: 6, startMinute: 0, endMinute: 600 }, // 10h today only
    ];
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 200 })],
      availability,
      now: NOW,
    });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].scheduledMinutes).toBe(90);
    expect(result.unscheduledMinutesByItem["a1"]).toBe(110);
  });

  it("spreads a large item one session per day across multiple available days", () => {
    const availability: AvailabilityWindow[] = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      startMinute: 0,
      endMinute: 600,
    }));
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 200, dueAt: new Date("2026-08-30T12:00:00") })],
      availability,
      now: NOW,
    });
    expect(result.sessions).toHaveLength(3); // 90 + 90 + 20
    for (const session of result.sessions) {
      expect(session.scheduledMinutes).toBeLessThanOrEqual(90);
    }
    const dates = new Set(result.sessions.map((s) => s.scheduledDate));
    expect(dates.size).toBe(3);
    const total = result.sessions.reduce((s, x) => s + x.scheduledMinutes, 0);
    expect(total).toBe(200);
  });

  it("splits a large item across multiple days when one day isn't enough", () => {
    const availability: AvailabilityWindow[] = [
      { dayOfWeek: 6, startMinute: 0, endMinute: 60 }, // Sat: 1h
      { dayOfWeek: 0, startMinute: 0, endMinute: 60 }, // Sun: 1h
    ];
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 90 })],
      availability,
      now: NOW,
    });
    const dates = result.sessions.map((s) => s.scheduledDate).sort();
    expect(dates).toEqual(["2026-08-15", "2026-08-16"]);
    const total = result.sessions.reduce((s, x) => s + x.scheduledMinutes, 0);
    expect(total).toBe(90);
  });

  it("gives the higher-scored item first claim on a day's capacity", () => {
    const availability: AvailabilityWindow[] = [
      { dayOfWeek: 6, startMinute: 0, endMinute: 40 }, // only 40 min today
    ];
    const urgent = makeItem({ id: "urgent", dueAt: NOW, remainingMinutes: 40 });
    const relaxed = makeItem({
      id: "relaxed",
      dueAt: new Date("2026-09-01T12:00:00"),
      remainingMinutes: 40,
    });
    const result = generatePlan({
      workItems: [relaxed, urgent],
      availability,
      now: NOW,
    });
    const todaySessions = result.sessions.filter((s) => s.scheduledDate === "2026-08-15");
    expect(todaySessions).toHaveLength(1);
    expect(todaySessions[0].item.id).toBe("urgent");
    expect(result.unscheduledMinutesByItem["relaxed"]).toBe(40);
  });

  it("does not schedule a non-overdue item after its own due date", () => {
    const availability: AvailabilityWindow[] = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      startMinute: 0,
      endMinute: 60,
    }));
    const result = generatePlan({
      workItems: [
        makeItem({ dueAt: new Date("2026-08-16T23:59:00"), remainingMinutes: 500 }),
      ],
      availability,
      now: NOW,
      horizonDays: 7,
    });
    const dates = result.sessions.map((s) => s.scheduledDate);
    expect(dates.every((d) => d <= "2026-08-16")).toBe(true);
  });

  it("keeps offering capacity to an already-overdue item across the whole horizon", () => {
    const availability: AvailabilityWindow[] = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      startMinute: 0,
      endMinute: 30,
    }));
    const result = generatePlan({
      workItems: [
        makeItem({ dueAt: new Date("2026-08-01T00:00:00"), remainingMinutes: 120 }),
      ],
      availability,
      now: NOW,
      horizonDays: 5,
    });
    const total = result.sessions.reduce((s, x) => s + x.scheduledMinutes, 0);
    expect(total).toBe(120); // 5 days * 30min fits exactly
  });

  it("is deterministic for identical inputs", () => {
    const availability: AvailabilityWindow[] = [
      { dayOfWeek: 6, startMinute: 0, endMinute: 120 },
    ];
    const items = [makeItem({ id: "x" }), makeItem({ id: "y", priority: "HIGH" })];
    const first = generatePlan({ workItems: items, availability, now: NOW });
    const second = generatePlan({ workItems: items, availability, now: NOW });
    expect(first.sessions).toEqual(second.sessions);
  });
});
