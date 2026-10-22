import { describe, it, expect } from "vitest";
import { generatePlan } from "./schedule";
import type { WorkItem, AvailabilityWindow, ScheduledSession } from "./types";

// Saturday 9:00 AM (runtime zone). Windows below start at 10:00 so "today"
// still has time left; see the clipping test for the already-passed case.
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

const everyDay = (startMinute: number, endMinute: number): AvailabilityWindow[] =>
  Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, startMinute, endMinute }));

function assertNoOverlaps(sessions: ScheduledSession[]) {
  const byDay = new Map<string, ScheduledSession[]>();
  for (const s of sessions) {
    byDay.set(s.scheduledDate, [...(byDay.get(s.scheduledDate) ?? []), s]);
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.startMinute! - b.startMinute!);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startMinute!).toBeGreaterThanOrEqual(sorted[i - 1].endMinute!);
    }
  }
}

describe("generatePlan — basics", () => {
  it("returns no sessions but a full scored list, a shortfall, and a warning when there is no availability", () => {
    const result = generatePlan({
      workItems: [makeItem()],
      availability: [],
      now: NOW,
      horizonDays: 14,
    });
    expect(result.sessions).toEqual([]);
    expect(result.scored).toHaveLength(1);
    expect(result.unscheduledMinutesByItem["a1"]).toBe(30);
    expect(result.warnings?.some((w) => w.type === "NO_AVAILABILITY")).toBe(true);
    expect(result.warnings?.some((w) => w.type === "DEADLINE_SHORTFALL")).toBe(true);
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
    expect(result.warnings).toEqual([]);
  });

  it("places a short item in the first open time today, with real start/end times", () => {
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 30 })],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 720 }], // Sat 10-12
      now: NOW,
    });
    expect(result.sessions).toHaveLength(1);
    const s = result.sessions[0];
    expect(s.scheduledDate).toBe("2026-08-15");
    expect(s.startMinute).toBe(600);
    expect(s.endMinute).toBe(630);
    expect(s.scheduledMinutes).toBe(30);
    expect(result.unscheduledMinutesByItem["a1"]).toBeUndefined();
  });

  it("does not offer time that has already passed today", () => {
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-08-15T23:00:00") })],
      availability: [{ dayOfWeek: 6, startMinute: 0, endMinute: 120 }], // 12-2 AM, over
      now: NOW,
    });
    expect(result.sessions).toEqual([]);
    expect(result.unscheduledMinutesByItem["a1"]).toBe(30);
  });

  it("starts a partially-elapsed window at the current time, rounded up to 5 minutes", () => {
    const now = new Date("2026-08-15T10:12:00");
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 30, dueAt: new Date("2026-08-15T23:00:00") })],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 720 }],
      now,
    });
    expect(result.sessions[0].startMinute).toBe(10 * 60 + 15);
  });
});

describe("generatePlan — spreading and catching up", () => {
  it("spreads a large item one block per day when there is room", () => {
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 200, dueAt: new Date("2026-08-30T12:00:00") })],
      availability: everyDay(600, 1200),
      now: NOW,
      horizonDays: 21,
    });
    expect(result.sessions).toHaveLength(3); // 90 + 90 + 20
    for (const s of result.sessions) expect(s.scheduledMinutes).toBeLessThanOrEqual(90);
    expect(new Set(result.sessions.map((s) => s.scheduledDate)).size).toBe(3);
    expect(result.sessions.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(200);
  });

  it("packs extra blocks into a day when the deadline leaves no other choice", () => {
    // Due this evening, only today is open: spacing would miss the deadline.
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 200, dueAt: new Date("2026-08-15T23:00:00") })],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 1200 }],
      now: NOW,
    });
    expect(result.sessions.length).toBeGreaterThan(1);
    expect(result.sessions.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(200);
    expect(result.unscheduledMinutesByItem["a1"]).toBeUndefined();
    assertNoOverlaps(result.sessions);
  });

  it("splits a large item across days when one day isn't enough", () => {
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 90 })],
      availability: [
        { dayOfWeek: 6, startMinute: 600, endMinute: 660 }, // Sat: 1h
        { dayOfWeek: 0, startMinute: 600, endMinute: 660 }, // Sun: 1h
      ],
      now: NOW,
    });
    expect(result.sessions.map((s) => s.scheduledDate).sort()).toEqual([
      "2026-08-15",
      "2026-08-16",
    ]);
    expect(result.sessions.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(90);
  });

  it("honors a preferred session length", () => {
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 120, dueAt: new Date("2026-08-15T23:00:00") })],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 1200 }],
      now: NOW,
      preferences: { preferredSessionMinutes: 30 },
    });
    expect(result.sessions).toHaveLength(4);
    for (const s of result.sessions) expect(s.scheduledMinutes).toBe(30);
  });
});

describe("generatePlan — priority and deadlines", () => {
  it("gives the higher-scored item first claim on scarce time", () => {
    const urgent = makeItem({
      id: "urgent",
      dueAt: new Date("2026-08-15T18:00:00"),
      remainingMinutes: 40,
    });
    const relaxed = makeItem({
      id: "relaxed",
      dueAt: new Date("2026-08-20T12:00:00"),
      remainingMinutes: 40,
    });
    const result = generatePlan({
      workItems: [relaxed, urgent],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 640 }], // 40 min
      now: NOW,
    });
    const today = result.sessions.filter((s) => s.scheduledDate === "2026-08-15");
    expect(today).toHaveLength(1);
    expect(today[0].item.id).toBe("urgent");
    expect(result.unscheduledMinutesByItem["relaxed"]).toBe(40);
  });

  it("never schedules a non-overdue item after its due date — or after its due time that day", () => {
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-08-16T12:00:00"), remainingMinutes: 800 })],
      availability: everyDay(600, 1200),
      now: NOW,
      horizonDays: 7,
    });
    expect(result.sessions.every((s) => s.scheduledDate <= "2026-08-16")).toBe(true);
    for (const s of result.sessions.filter((x) => x.scheduledDate === "2026-08-16")) {
      expect(s.endMinute).toBeLessThanOrEqual(12 * 60);
    }
    // 600 min fit today (10 AM-8 PM) and 120 on the due morning (10 AM-noon):
    // 720 of 800, so exactly 80 is a real shortfall — not pushed past the deadline.
    expect(result.unscheduledMinutesByItem["a1"]).toBe(80);
  });

  it("reports the exact shortfall when work cannot fit before the deadline", () => {
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-08-15T23:00:00"), remainingMinutes: 300 })],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 720 }], // 120 min today
      now: NOW,
    });
    expect(result.unscheduledMinutesByItem["a1"]).toBe(180);
    const shortfall = result.warnings?.find((w) => w.type === "DEADLINE_SHORTFALL");
    expect(shortfall).toMatchObject({ itemId: "a1", shortMinutes: 180, overdue: false });
    const day = result.warnings?.find((w) => w.type === "OVERLOADED_DAY");
    expect(day).toMatchObject({ date: "2026-08-15", shortMinutes: 180, availableMinutes: 120 });
  });

  it("keeps offering capacity to already-overdue work across the horizon", () => {
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-08-01T00:00:00"), remainingMinutes: 120 })],
      availability: everyDay(600, 630),
      now: NOW,
      horizonDays: 5,
    });
    expect(result.sessions.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(120);
    const flagged = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-08-01T00:00:00"), remainingMinutes: 500 })],
      availability: everyDay(600, 630),
      now: NOW,
      horizonDays: 5,
    });
    expect(flagged.warnings?.find((w) => w.type === "DEADLINE_SHORTFALL")).toMatchObject({
      overdue: true,
    });
  });
});

describe("generatePlan — lead window and horizon", () => {
  it("does not plan work earlier than the lead window before its deadline", () => {
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-09-10T12:00:00"), remainingMinutes: 60 })],
      availability: everyDay(600, 1200),
      now: NOW,
      horizonDays: 28,
    });
    expect(result.sessions.length).toBeGreaterThan(0);
    // Sept 10 minus 14 days.
    expect(result.sessions.every((s) => s.scheduledDate >= "2026-08-27")).toBe(true);
  });

  it("defers — rather than flags — work whose deadline is beyond the horizon", () => {
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-12-01T12:00:00"), remainingMinutes: 30 })],
      availability: everyDay(600, 1200),
      now: NOW,
      horizonDays: 7,
    });
    expect(result.sessions).toEqual([]);
    expect(result.deferredMinutesByItem?.["a1"]).toBe(30);
    expect(result.unscheduledMinutesByItem["a1"]).toBeUndefined();
    expect(result.warnings?.some((w) => w.type === "DEADLINE_SHORTFALL")).toBe(false);
  });
});

describe("generatePlan — daily limits and breaks", () => {
  it("never plans more than the daily cap on any day", () => {
    const items = ["a", "b", "c"].map((id) =>
      makeItem({ id, remainingMinutes: 60, dueAt: new Date("2026-08-18T12:00:00") }),
    );
    const result = generatePlan({
      workItems: items,
      availability: everyDay(600, 1200),
      now: NOW,
      preferences: { maxDailyMinutes: 60, preferredSessionMinutes: 60 },
    });
    const perDay = new Map<string, number>();
    for (const s of result.sessions) {
      perDay.set(s.scheduledDate, (perDay.get(s.scheduledDate) ?? 0) + s.scheduledMinutes);
    }
    for (const total of perDay.values()) expect(total).toBeLessThanOrEqual(60);
    expect(result.sessions.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(180);
  });

  it("leaves a break between back-to-back blocks", () => {
    const result = generatePlan({
      workItems: [
        makeItem({ id: "a", remainingMinutes: 45, dueAt: new Date("2026-08-15T23:00:00") }),
        makeItem({ id: "b", remainingMinutes: 45, dueAt: new Date("2026-08-15T23:30:00") }),
      ],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 900 }],
      now: NOW,
      preferences: { breakMinutes: 10 },
    });
    const [first, second] = [...result.sessions].sort((x, y) => x.startMinute! - y.startMinute!);
    expect(second.startMinute! - first.endMinute!).toBeGreaterThanOrEqual(10);
  });
});

describe("generatePlan — pinned blocks", () => {
  it("keeps a pinned block exactly where the student put it and plans around it", () => {
    const result = generatePlan({
      workItems: [makeItem({ remainingMinutes: 120, dueAt: new Date("2026-08-15T23:00:00") })],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 900 }],
      now: NOW,
      pinnedBlocks: [
        { id: "b1", kind: "assignment", itemId: "a1", date: "2026-08-15", startMinute: 660, durationMinutes: 60 },
      ],
    });
    const pinned = result.sessions.find((s) => s.pinned);
    expect(pinned).toMatchObject({ blockId: "b1", startMinute: 660, endMinute: 720 });
    // 60 of the 120 minutes are already covered by the pinned block.
    const auto = result.sessions.filter((s) => !s.pinned);
    expect(auto.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(60);
    assertNoOverlaps(result.sessions);
  });

  it("ignores pinned blocks for items that no longer exist and blocks that already passed", () => {
    const result = generatePlan({
      workItems: [makeItem()],
      availability: [{ dayOfWeek: 6, startMinute: 600, endMinute: 900 }],
      now: NOW,
      pinnedBlocks: [
        { id: "ghost", kind: "assignment", itemId: "deleted", date: "2026-08-15", startMinute: 600, durationMinutes: 30 },
        { id: "past", kind: "assignment", itemId: "a1", date: "2026-08-15", startMinute: 0, durationMinutes: 60 },
      ],
    });
    expect(result.sessions.some((s) => s.pinned)).toBe(false);
  });
});

describe("generatePlan — timezones", () => {
  it("treats an 11:59 PM Pacific deadline as that Pacific day, not the UTC day after", () => {
    // Fri Oct 23 11:59 PM PDT == Sat Oct 24 06:59 UTC. The student is free
    // Friday evening and Saturday morning; only Friday is before the deadline.
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-10-24T06:59:00Z"), remainingMinutes: 100 })],
      availability: [
        { dayOfWeek: 5, startMinute: 20 * 60, endMinute: 22 * 60 }, // Fri 8-10 PM
        { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60 }, // Sat 9-12
      ],
      now: new Date("2026-10-23T18:00:00Z"), // Fri 11 AM PDT
      timeZone: "America/Los_Angeles",
      horizonDays: 4,
    });
    expect(result.sessions.every((s) => s.scheduledDate === "2026-10-23")).toBe(true);
    expect(result.sessions.some((s) => s.scheduledDate === "2026-10-24")).toBe(false);
    // All 100 minutes fit in Friday's 8-10 PM window, before the deadline.
    expect(result.unscheduledMinutesByItem["a1"]).toBeUndefined();
    expect(result.sessions.reduce((n, s) => n + s.scheduledMinutes, 0)).toBe(100);
  });

  it("reads 'today' in the student's zone", () => {
    // 2026-10-24 02:00 UTC is still Fri Oct 23 in Los Angeles.
    const result = generatePlan({
      workItems: [makeItem({ dueAt: new Date("2026-10-30T12:00:00Z") })],
      availability: everyDay(0, 1440),
      now: new Date("2026-10-24T02:00:00Z"),
      timeZone: "America/Los_Angeles",
    });
    expect(result.days?.[0].date).toBe("2026-10-23");
  });
});

describe("generatePlan — invariants", () => {
  const workload = (): WorkItem[] =>
    Array.from({ length: 9 }, (_, i) =>
      makeItem({
        id: `w${i}`,
        title: `Item ${i}`,
        remainingMinutes: 25 + i * 17,
        priority: (["LOW", "MEDIUM", "HIGH"] as const)[i % 3],
        dueAt: new Date(2026, 7, 16 + (i % 6), 8 + i, 0),
        kind: i % 4 === 0 ? "exam" : "assignment",
      }),
    );

  it("never overlaps blocks and keeps every auto block inside an availability window", () => {
    const availability: AvailabilityWindow[] = [
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 900, endMinute: 1080 })),
      ...[1, 3, 5].map((d) => ({ dayOfWeek: d, startMinute: 1140, endMinute: 1260 })),
    ];
    const result = generatePlan({
      workItems: workload(),
      availability,
      now: NOW,
      horizonDays: 14,
      preferences: { preferredSessionMinutes: 45, breakMinutes: 10, maxDailyMinutes: 200 },
    });
    assertNoOverlaps(result.sessions);
    for (const s of result.sessions) {
      const dow = new Date(`${s.scheduledDate}T12:00:00Z`).getUTCDay();
      const inside = availability.some(
        (w) => w.dayOfWeek === dow && s.startMinute! >= w.startMinute && s.endMinute! <= w.endMinute,
      );
      expect(inside).toBe(true);
    }
  });

  it("is deterministic and independent of input order", () => {
    const items = workload();
    const availability = everyDay(900, 1080);
    const first = generatePlan({ workItems: items, availability, now: NOW, horizonDays: 14 });
    const second = generatePlan({
      workItems: [...items].reverse(),
      availability,
      now: NOW,
      horizonDays: 14,
    });
    const key = (s: ScheduledSession) =>
      `${s.scheduledDate}|${s.startMinute}|${s.endMinute}|${s.item.id}`;
    expect(first.sessions.map(key)).toEqual(second.sessions.map(key));
  });

  it("accounts for every minute of work: scheduled + unscheduled + deferred", () => {
    const items = workload();
    const result = generatePlan({
      workItems: items,
      availability: everyDay(900, 960),
      now: NOW,
      horizonDays: 14,
    });
    for (const item of items) {
      const scheduled = result.sessions
        .filter((s) => s.item.id === item.id)
        .reduce((n, s) => n + s.scheduledMinutes, 0);
      const short = result.unscheduledMinutesByItem[item.id] ?? 0;
      const deferred = result.deferredMinutesByItem?.[item.id] ?? 0;
      expect(scheduled + short + deferred).toBe(item.remainingMinutes);
    }
  });
});
