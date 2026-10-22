import { describe, it, expect } from "vitest";
import { computeStreak } from "./streak";
import { addDaysToKey } from "@/lib/time/zone";

const today = "2026-10-22";
const back = (n: number) => addDaysToKey(today, -n);
const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => back(from - i));

describe("computeStreak", () => {
  it("is zero with no activity, and today alone counts", () => {
    expect(computeStreak([], today)).toMatchObject({ current: 0, longest: 0, todayDone: false });
    expect(computeStreak([today], today)).toMatchObject({ current: 1, todayDone: true });
  });

  it("keeps a streak alive through today until the day is over", () => {
    expect(computeStreak(range(3, 1), today)).toMatchObject({ current: 3, todayDone: false });
    expect(computeStreak(range(3, 1), today).week.slice(-1)).toEqual(["today"]);
  });

  it("breaks on a missed day without rest days", () => {
    const s = computeStreak([...range(6, 3), back(1)], today);
    expect(s).toMatchObject({ current: 1, longest: 4 });
  });

  it("earns a rest day every 7 days and spends it on a miss", () => {
    const s = computeStreak([...range(10, 3), back(1), today], today);
    expect(s.current).toBe(10);
    expect(s.week).toEqual(["done", "done", "done", "done", "rest", "done", "done"]);
    expect(s.restDays).toBe(0);
  });
});
