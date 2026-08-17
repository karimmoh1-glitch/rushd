import { describe, it, expect } from "vitest";
import { buildForecast } from "./forecast";
import { scoreItem } from "./score";
import type { WorkItem } from "./types";

const NOW = new Date("2026-08-15T12:00:00"); // Saturday

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
    dueAt: new Date("2026-08-20T12:00:00"),
    remainingMinutes: 60,
    rawEstimatedMinutes: 60,
    estimateAdjusted: false,
    ...overrides,
  };
}

describe("buildForecast", () => {
  it("returns exactly three weeks, labeled in order", () => {
    const weeks = buildForecast([], 300, NOW);
    expect(weeks).toHaveLength(3);
    expect(weeks.map((w) => w.label)).toEqual([
      "This week",
      "Next week",
      "The week after",
    ]);
  });

  it("puts an overdue item in 'This week', not some negative bucket", () => {
    const item = scoreItem(
      makeItem({ id: "overdue", dueAt: new Date("2026-08-10T12:00:00") }),
      NOW,
    );
    const weeks = buildForecast([item], 300, NOW);
    expect(weeks[0].estimatedMinutes).toBe(60);
    expect(weeks[1].estimatedMinutes).toBe(0);
  });

  it("buckets an item due in 10 days into 'Next week'", () => {
    const item = scoreItem(
      makeItem({ id: "b", dueAt: new Date("2026-08-25T12:00:00") }), // 10 days out
      NOW,
    );
    const weeks = buildForecast([item], 300, NOW);
    expect(weeks[1].estimatedMinutes).toBe(60);
    expect(weeks[0].estimatedMinutes).toBe(0);
  });

  it("buckets an item due in 16 days into 'The week after'", () => {
    const item = scoreItem(
      makeItem({ id: "c", dueAt: new Date("2026-08-31T12:00:00") }), // 16 days out
      NOW,
    );
    const weeks = buildForecast([item], 300, NOW);
    expect(weeks[2].estimatedMinutes).toBe(60);
  });

  it("excludes items due beyond the 3-week window entirely", () => {
    const item = scoreItem(
      makeItem({ id: "d", dueAt: new Date("2026-10-01T12:00:00") }), // 47 days out
      NOW,
    );
    const weeks = buildForecast([item], 300, NOW);
    const total = weeks.reduce((s, w) => s + w.estimatedMinutes, 0);
    expect(total).toBe(0);
  });

  it("marks risk 'unknown' when there's no availability at all", () => {
    const weeks = buildForecast([], 0, NOW);
    expect(weeks.every((w) => w.risk === "unknown")).toBe(true);
  });

  it("marks risk 'high' when estimated work exceeds available time", () => {
    const item = scoreItem(makeItem({ remainingMinutes: 500, dueAt: NOW }), NOW);
    const weeks = buildForecast([item], 300, NOW);
    expect(weeks[0].risk).toBe("high");
  });

  it("marks risk 'low' when there's comfortable headroom", () => {
    const item = scoreItem(makeItem({ remainingMinutes: 60, dueAt: NOW }), NOW);
    const weeks = buildForecast([item], 600, NOW);
    expect(weeks[0].risk).toBe("low");
  });

  it("surfaces the highest-scored items due that week as topItems, capped at 3", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      scoreItem(makeItem({ id: `item-${i}`, title: `Item ${i}`, dueAt: NOW }), NOW),
    );
    const weeks = buildForecast(items, 1000, NOW);
    expect(weeks[0].topItems.length).toBeLessThanOrEqual(3);
  });

  it("is deterministic for identical inputs", () => {
    const item = scoreItem(makeItem(), NOW);
    expect(buildForecast([item], 300, NOW)).toEqual(buildForecast([item], 300, NOW));
  });
});
